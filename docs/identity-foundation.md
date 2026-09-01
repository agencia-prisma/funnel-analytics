# Identity Foundation

## Scope

EPIC 07 introduces the canonical identity layer that connects anonymous browser visitors to a Workspace-scoped `person_id` without moving plaintext PII into the analytics data plane.

The identity path is intentionally separate from analytics ingestion:

```text
pixel.js identify()
→ POST /v1/identify
→ Pixel + Origin authorization
→ normalization
→ HMAC blind index + AES-256-GCM
→ IDENTITY_QUEUE
→ Identity Worker
→ Supabase canonical identity
→ ClickHouse identity_links
```

The normal analytics path remains:

```text
/v1/events
→ EVENTS_QUEUE
→ R2 raw archive
→ ClickHouse events
→ session_facts
```

Plaintext identity payloads never enter that path.

## Canonical model

### Person

`public.persons` is Workspace-scoped and uses a random UUID `person_id`.

A Person may own multiple visitor IDs and therefore multiple sessions.

Person status supports:

- `active`
- `merged`
- `deleted`

The schema is prepared for future merge and privacy operations without hard-deleting historical references.

### Visitor links

`public.person_visitor_links` connects:

```text
workspace_id
person_id
visitor_id
pixel_id (provenance)
```

Within one Workspace, a visitor can have at most one active canonical Person relationship.

### Protected identifiers

PII is stored only in `private.person_identifiers`.

Stored fields are:

- identifier type;
- blind index;
- AES-GCM ciphertext;
- encryption key version;
- source/confidence;
- timestamps.

No plaintext email, phone, CPF or name is stored in this table.

Strong resolution identifiers are:

- email;
- phone;
- CPF.

Name is intentionally not sufficient by itself to merge Persons.

## Normalization

### Email

- trim;
- lowercase;
- basic structural validation.

Provider-specific rewriting is deliberately not used. Dots and plus aliases are preserved.

### Phone

Phone input must be deterministically expressible as E.164. The SDK/server does not guess a country for ambiguous numbers.

### CPF

CPF is reduced to digits and validated using its checksum. Repeated-digit invalid values are rejected.

### Name

Name is Unicode NFKC-normalized, trimmed and internal whitespace is collapsed.

Name remains a weak attribute.

## Cryptography

### Encryption

Identifiers are encrypted with AES-256-GCM.

Each encrypted value uses a fresh random 12-byte IV. The identifier type is included as authenticated associated data.

Ciphertext format:

```text
aes256gcm.<base64url iv>.<base64url ciphertext+tag>
```

### Blind indexes

Exact resolution/search uses HMAC-SHA-256 over:

```text
identifier_type:normalized_value
```

A dedicated HMAC secret is required.

A plain SHA-256 hash of email/phone/CPF is not used because it is vulnerable to dictionary attacks.

### Key separation

Two independent secrets are required:

```text
IDENTITY_ENCRYPTION_KEY_V1
IDENTITY_HMAC_KEY_V1
```

Ciphertexts carry `encryption_key_version` so a future key rotation can be performed safely.

## Browser SDK

`funnelAnalytics.identify()` is separate from `track()`.

Example:

```js
await window.funnelAnalytics.identify({
  email: 'user@example.com',
  phone: '+5511999998888',
});
```

Identity data is not:

- sent to `/v1/events`;
- written into the analytics event queue;
- written to the event recovery buffer;
- persisted in localStorage/IndexedDB/cookies for offline retry;
- printed in debug logs.

When identity consent is not permitted, the request is not sent.

## Collector endpoint

### POST /v1/identify

The Collector reuses the same Pixel and Origin security boundary used by browser event ingestion.

It validates:

- active Pixel;
- authorized Origin/domain;
- payload shape;
- UUIDs;
- timestamp window;
- consent state;
- identifier limits.

Limits:

- max body: 16 KB;
- max identifiers: 4;
- identity rate-limit policy: 30 requests / 60 seconds.

Before enqueue:

```text
plaintext
→ normalize
→ HMAC blind index
→ AES-GCM ciphertext
→ IdentityEnvelopeV1
```

A successful request returns `202` only after the identity queue accepts the protected envelope.

The response never exposes `person_id`, ciphertext or blind indexes.

## Identity Queue

The `IDENTITY_QUEUE` envelope contains only protected identifiers.

It may contain:

- Workspace/Pixel identifiers;
- pseudonymous visitor/session IDs;
- ciphertext;
- blind indexes;
- source/confidence;
- test mode.

It must not contain plaintext identity values.

Queue delivery is at-least-once, so downstream resolution is idempotent.

Permanent failures use `IDENTITY_DLQ`.

## Identity Worker

The Identity Worker:

1. validates `IdentityEnvelopeV1`;
2. resolves the identity transactionally in Supabase;
3. writes a pseudonymous link to ClickHouse;
4. acknowledges only after both operations succeed.

Transient Supabase or ClickHouse failures cause retry without ack.

Identity conflicts are permanent and go to DLQ.

The worker does not decrypt identifiers for resolution.

## Resolution rules

### New strong identity

```text
new email/phone/CPF
→ new Person
→ identifiers
→ visitor link
```

### Existing strong identity

```text
existing strong identifier
→ existing Person
→ missing identifiers/timestamps updated
→ visitor linked
```

### Multiple visitors

```text
visitor A + email X
visitor B + email X
→ same Person
```

### Identity conflict

If strong identifiers resolve to more than one Person:

```text
email A → Person 1
phone B → Person 2

email A + phone B
→ IDENTITY_CONFLICT
```

No automatic merge occurs.

### Visitor conflict

If a visitor is already linked to Person 1 and a new strong match resolves to Person 2:

```text
VISITOR_IDENTITY_CONFLICT
```

The link is not silently overwritten.

## Concurrency

Strong identifiers have Workspace-scoped uniqueness and the resolver acquires transaction advisory locks derived from the Workspace + identifier blind index.

The purpose is to prevent concurrent requests for the same strong identity from creating duplicate Persons.

## Supabase security

`public.persons` and `public.person_visitor_links` use RLS and require `people.view`.

`people.view_pii` is a separate permission.

`private.person_identifiers` and `private.person_merge_history` have no direct `anon` or `authenticated` table access.

Privileged functions:

- use `SECURITY DEFINER` only where needed;
- use `SET search_path = ''`;
- have explicit EXECUTE grants/revokes.

Authorization does not use `user_metadata`.

## PII access and audit

Authorized PII access is performed through controlled RPCs.

Actions such as PII view/search are written to `audit_logs`.

Audit metadata records the action and identifier type where necessary, never the identifier value itself.

## ClickHouse

Migration:

```text
infra/clickhouse/migrations/0003_identity_links.sql
```

`funnel_analytics.identity_links` contains no PII.

It stores the pseudonymous relationship:

```text
workspace_id
person_id
visitor_id
pixel_id
source
confidence
linked_at
last_seen_at
link_version
```

`session_person_links` joins `session_facts` to the current identity link by Workspace + visitor.

Late identification therefore associates historical sessions without rewriting prior events or session snapshots.

## Logging

Operational logs may contain:

- Workspace;
- Pixel;
- identifier count;
- identifier types;
- latency;
- error code.

Operational logs must not contain:

- email;
- phone;
- CPF;
- name;
- ciphertext;
- blind index;
- visitor ID;
- session ID;
- click IDs.

## Failure modes

### Identity Queue unavailable

Collector returns `503`; no false `202`.

### Supabase unavailable

Identity Worker retries and does not ack.

### ClickHouse unavailable

Identity Worker retries and does not ack.

### Identity conflict

Message is moved to DLQ and no arbitrary Person is selected.

### Missing crypto key

Collector fails closed and does not enqueue plaintext.

### Unknown key version

Future decrypt/rotation tooling must reject unknown versions rather than guessing.

## Production provisioning

EPIC 07 code does not automatically provision Production resources.

Before Production activation, provision/configure explicitly:

- Supabase identity migration;
- `IDENTITY_QUEUE`;
- `IDENTITY_DLQ`;
- Identity Worker;
- identity encryption secret;
- identity HMAC secret;
- ClickHouse migration `0003_identity_links.sql`.

Do not publish the crypto secrets to Vercel public variables or browser bundles.

## Runbook

### Identity Queue growing

Check Collector acceptance rate, Identity Worker availability, Supabase latency and ClickHouse write errors.

### Identity DLQ growing

Inspect error-code distribution. Do not expose protected identifier payloads in operational logs.

### Crypto key missing

Stop identity ingestion, restore the correct server-side secret binding and do not substitute a generated key.

### Identity conflict

Keep Persons separate. Investigate source/provenance before any future controlled merge operation.

### ClickHouse identity link failure

Do not ack the identity queue message until the link write succeeds or a permanent failure is classified.

## Out of scope

EPIC 07 does not implement:

- Journey Engine;
- probabilistic identity;
- fingerprinting;
- automatic form scraping;
- checkout identity;
- Hotmart/Kiwify identity integration;
- full People UI;
- Privacy Center;
- fuzzy PII search.
