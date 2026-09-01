# Journey Engine

EPIC 08 introduces a deterministic Journey layer above canonical session and identity facts.

A Journey is a temporal sequence of current sessions for one logical subject within a Workspace. Anonymous sessions use `subject_kind=visitor`; identified sessions use `subject_kind=person`. Identification never rewrites events or session facts.

## Policy V1

`JourneyPolicyV1` is versioned and defaults to 2,592,000 seconds (30 days). A new Journey starts only when the next `session_started_at` is strictly greater than the previous `last_activity_at + inactivity window`. Equality and overlapping sessions stay in the same Journey.

The worker reads `JOURNEY_INACTIVITY_WINDOW_SECONDS` and passes the policy into the pure engine. Future Workspace/Funnel policy providers can replace the environment-backed provider without changing the algorithm.

## Determinism

Sessions are sorted by `session_started_at`, `last_activity_at`, then `session_id`. Journey IDs use RFC-compatible UUIDv5 with a stable Funnel Analytics namespace and the tuple:

`workspace_id + subject_kind + subject_id + test_mode + first_session_id + policy_version`.

The same logical input therefore creates the same Journey ID. Late identity can legitimately change the subject and Journey ID; stale anonymous Journey facts are tombstoned.

## Multi-session, multi-visitor and multi-pixel

Person identity is Workspace-level. All current visitors linked to a Person are expanded before sessions are queried. Sessions from different visitors and pixels can share a Journey when the inactivity policy allows it. `test_mode` is an absolute grouping boundary and production/test sessions never mix.

## Late events and late identity

Both triggers enqueue a subject-level recompute. The worker re-reads current identity links and all current Session Facts for the affected subject, then reconstructs from canonical state. It does not patch Journey state incrementally.

## Storage

ClickHouse migration `0004_journey_facts.sql` adds:

- `journey_facts` using `ReplacingMergeTree(journey_version)`
- `journey_facts_current` using `FINAL` and `is_deleted=false`
- `journey_session_links` keyed logically by `workspace_id + session_id`
- `journey_session_links_current` using `FINAL` and `is_deleted=false`

Journey facts are partitioned by `cityHash64(journey_id) % 16`; session links by `cityHash64(session_id) % 16`. Late events therefore do not move rows between time partitions.

## Reconciliation and tombstones

Write order is:

1. new/updated Journey facts;
2. current session-to-Journey links;
3. stale Journey tombstones;
4. ACK.

Each recompute reads the maximum related `journey_version` and writes `max + 1`. Duplicate delivery may create another physical version but only one current logical state remains.

## Queues and failure handling

Session Worker publishes `reason=session_updated` after Session Facts are inserted. Identity Worker publishes `reason=identity_linked` after control-plane resolution and `identity_links` insertion. Both ACK their source message only after the Journey queue accepts the envelope.

Journey Worker validates the envelope, applies Workspace-scoped queries, expands identity, reconstructs, writes ClickHouse state and then ACKs. Transient storage/network failures retry. Invalid envelopes, invalid policy and integrity failures go to `JOURNEYS_DLQ`.

V1 keeps Queue `max_concurrency=1` to preserve simple monotonic version allocation. Scaling requires subject/workspace sharding or coordination/locking before increasing concurrency.

## PII

Journey envelopes contain only Workspace, visitor/person references and reason. Journey facts, links and logs contain analytics facts and opaque identifiers only. Email, phone, CPF, name, ciphertext and blind indexes are not consumed by the Journey layer.

## CI

The Journey Engine gate uses an isolated ClickHouse service and host-process tests. It does not create a paid Supabase branch, does not use Supabase Production fixtures and does not place Production service-role credentials in GitHub Actions.
