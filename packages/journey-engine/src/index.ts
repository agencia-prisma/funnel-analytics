import type { IdentityLinkV1, SessionFactV1 } from '@funnel/event-contracts';

export type JourneySubjectKind = 'visitor' | 'person';

export interface JourneyPolicyV1 {
  version: 1;
  inactivity_window_seconds: number;
}

export interface JourneyFactDraft {
  workspace_id: string;
  journey_id: string;
  subject_kind: JourneySubjectKind;
  subject_id: string;
  person_id: string | null;
  test_mode: boolean;
  policy_version: number;
  inactivity_window_seconds: number;
  journey_started_at: string;
  last_activity_at: string;
  duration_seconds: number;
  session_count: number;
  visitor_count: number;
  pixel_count: number;
  event_count: number;
  page_view_count: number;
  custom_event_count: number;
  first_session_id: string;
  last_session_id: string;
  first_pixel_id: string;
  last_pixel_id: string;
  landing_page_url: string | null;
  landing_page_path: string | null;
  landing_page_title: string | null;
  exit_page_url: string | null;
  exit_page_path: string | null;
  exit_page_title: string | null;
  first_referrer: string | null;
  first_referrer_domain: string | null;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
  first_utm_content: string | null;
  first_utm_term: string | null;
  last_utm_source: string | null;
  last_utm_medium: string | null;
  last_utm_campaign: string | null;
  last_utm_content: string | null;
  last_utm_term: string | null;
  first_fbclid: string | null;
  first_ttclid: string | null;
  first_gclid: string | null;
  first_msclkid: string | null;
  first_tblci: string | null;
  last_fbclid: string | null;
  last_ttclid: string | null;
  last_gclid: string | null;
  last_msclkid: string | null;
  last_tblci: string | null;
  max_session_version: string;
  max_identity_link_version: string;
}

export interface JourneySessionLinkDraft {
  workspace_id: string;
  session_id: string;
  journey_id: string;
  visitor_id: string;
  person_id: string | null;
  pixel_id: string;
  test_mode: boolean;
  sequence_index: number;
  session_started_at: string;
}

export interface ReconstructJourneysInput {
  workspaceId: string;
  sessions: SessionFactV1[];
  identityLinks: IdentityLinkV1[];
  policy: JourneyPolicyV1;
}

export interface ReconstructJourneysResult {
  journeys: JourneyFactDraft[];
  sessionLinks: JourneySessionLinkDraft[];
}

export class JourneyEngineError extends Error {
  constructor(
    readonly code:
      | 'JOURNEY_POLICY_INVALID'
      | 'JOURNEY_WORKSPACE_MISMATCH'
      | 'JOURNEY_INPUT_TOO_LARGE',
  ) {
    super(code);
    this.name = 'JourneyEngineError';
  }
}

export const JOURNEY_NAMESPACE = '8169dd94-0db8-5dcf-8f65-6e7ed1dcbaf1';
export const JOURNEY_DEFAULT_INACTIVITY_WINDOW_SECONDS = 2_592_000;
export const JOURNEY_MAX_VISITORS_PER_RECOMPUTE = 1_000;
export const JOURNEY_MAX_SESSIONS_PER_RECOMPUTE = 10_000;

export const JOURNEY_POLICY_V1: JourneyPolicyV1 = {
  version: 1,
  inactivity_window_seconds: JOURNEY_DEFAULT_INACTIVITY_WINDOW_SECONDS,
};

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('UUID_INVALID');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export async function uuidV5(namespace: string, name: string): Promise<string> {
  const namespaceBytes = uuidBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}

export async function deterministicJourneyId(input: {
  workspaceId: string;
  subjectKind: JourneySubjectKind;
  subjectId: string;
  testMode: boolean;
  firstSessionId: string;
  policyVersion: number;
}): Promise<string> {
  return uuidV5(
    JOURNEY_NAMESPACE,
    [
      input.workspaceId,
      input.subjectKind,
      input.subjectId,
      input.testMode ? '1' : '0',
      input.firstSessionId,
      String(input.policyVersion),
    ].join(':'),
  );
}

function compareSessions(a: SessionFactV1, b: SessionFactV1): number {
  return (
    Date.parse(a.session_started_at) - Date.parse(b.session_started_at) ||
    Date.parse(a.last_activity_at) - Date.parse(b.last_activity_at) ||
    a.session_id.localeCompare(b.session_id)
  );
}

function maxVersion(values: string[]): string {
  let max = 0n;
  for (const value of values) {
    const parsed = BigInt(value);
    if (parsed > max) max = parsed;
  }
  return max.toString();
}

function identityVersion(link: IdentityLinkV1): string {
  return String(Date.parse(link.last_seen_at));
}

export async function reconstructJourneys(
  input: ReconstructJourneysInput,
): Promise<ReconstructJourneysResult> {
  if (
    input.policy.version !== 1 ||
    !Number.isInteger(input.policy.inactivity_window_seconds) ||
    input.policy.inactivity_window_seconds <= 0
  ) {
    throw new JourneyEngineError('JOURNEY_POLICY_INVALID');
  }
  if (input.sessions.length > JOURNEY_MAX_SESSIONS_PER_RECOMPUTE) {
    throw new JourneyEngineError('JOURNEY_INPUT_TOO_LARGE');
  }

  const links = new Map<string, IdentityLinkV1>();
  for (const link of input.identityLinks) {
    if (link.workspace_id !== input.workspaceId) {
      throw new JourneyEngineError('JOURNEY_WORKSPACE_MISMATCH');
    }
    const current = links.get(link.visitor_id);
    if (
      !current ||
      Date.parse(link.last_seen_at) > Date.parse(current.last_seen_at)
    ) {
      links.set(link.visitor_id, link);
    }
  }
  if (
    new Set(input.sessions.map((s) => s.visitor_id)).size >
    JOURNEY_MAX_VISITORS_PER_RECOMPUTE
  ) {
    throw new JourneyEngineError('JOURNEY_INPUT_TOO_LARGE');
  }

  const groups = new Map<
    string,
    {
      subjectKind: JourneySubjectKind;
      subjectId: string;
      personId: string | null;
      testMode: boolean;
      sessions: SessionFactV1[];
    }
  >();

  for (const session of input.sessions) {
    if (session.workspace_id !== input.workspaceId) {
      throw new JourneyEngineError('JOURNEY_WORKSPACE_MISMATCH');
    }
    const link = links.get(session.visitor_id);
    const subjectKind: JourneySubjectKind = link ? 'person' : 'visitor';
    const subjectId = link?.person_id ?? session.visitor_id;
    const key = [subjectKind, subjectId, session.test_mode ? '1' : '0'].join(
      ':',
    );
    const group = groups.get(key) ?? {
      subjectKind,
      subjectId,
      personId: link?.person_id ?? null,
      testMode: session.test_mode,
      sessions: [],
    };
    group.sessions.push(session);
    groups.set(key, group);
  }

  const journeys: JourneyFactDraft[] = [];
  const sessionLinks: JourneySessionLinkDraft[] = [];
  const windowMs = input.policy.inactivity_window_seconds * 1000;

  for (const group of groups.values()) {
    const ordered = group.sessions.sort(compareSessions);
    const segments: SessionFactV1[][] = [];
    let current: SessionFactV1[] = [];

    for (const session of ordered) {
      const previous = current.at(-1);
      if (
        previous &&
        Date.parse(session.session_started_at) >
          Date.parse(previous.last_activity_at) + windowMs
      ) {
        segments.push(current);
        current = [];
      }
      current.push(session);
    }
    if (current.length) segments.push(current);

    for (const segment of segments) {
      const first = segment[0]!;
      const last = segment.at(-1)!;
      const journeyId = await deterministicJourneyId({
        workspaceId: input.workspaceId,
        subjectKind: group.subjectKind,
        subjectId: group.subjectId,
        testMode: group.testMode,
        firstSessionId: first.session_id,
        policyVersion: input.policy.version,
      });
      const relevantLinks =
        group.personId === null
          ? []
          : input.identityLinks.filter(
              (link) => link.person_id === group.personId,
            );
      const visitors = new Set(segment.map((session) => session.visitor_id));
      const pixels = new Set(segment.map((session) => session.pixel_id));

      journeys.push({
        workspace_id: input.workspaceId,
        journey_id: journeyId,
        subject_kind: group.subjectKind,
        subject_id: group.subjectId,
        person_id: group.personId,
        test_mode: group.testMode,
        policy_version: input.policy.version,
        inactivity_window_seconds: input.policy.inactivity_window_seconds,
        journey_started_at: first.session_started_at,
        last_activity_at: segment.reduce(
          (max, s) =>
            Date.parse(s.last_activity_at) > Date.parse(max)
              ? s.last_activity_at
              : max,
          first.last_activity_at,
        ),
        duration_seconds: Math.max(
          0,
          Math.floor(
            (Math.max(...segment.map((s) => Date.parse(s.last_activity_at))) -
              Date.parse(first.session_started_at)) /
              1000,
          ),
        ),
        session_count: segment.length,
        visitor_count: visitors.size,
        pixel_count: pixels.size,
        event_count: segment.reduce((sum, s) => sum + s.event_count, 0),
        page_view_count: segment.reduce((sum, s) => sum + s.page_view_count, 0),
        custom_event_count: segment.reduce(
          (sum, s) => sum + s.custom_event_count,
          0,
        ),
        first_session_id: first.session_id,
        last_session_id: last.session_id,
        first_pixel_id: first.pixel_id,
        last_pixel_id: last.pixel_id,
        landing_page_url: first.landing_page_url,
        landing_page_path: first.landing_page_path,
        landing_page_title: first.landing_page_title,
        exit_page_url: last.exit_page_url,
        exit_page_path: last.exit_page_path,
        exit_page_title: last.exit_page_title,
        first_referrer: first.session_referrer,
        first_referrer_domain: first.session_referrer_domain,
        first_utm_source: first.utm_source,
        first_utm_medium: first.utm_medium,
        first_utm_campaign: first.utm_campaign,
        first_utm_content: first.utm_content,
        first_utm_term: first.utm_term,
        last_utm_source: last.utm_source,
        last_utm_medium: last.utm_medium,
        last_utm_campaign: last.utm_campaign,
        last_utm_content: last.utm_content,
        last_utm_term: last.utm_term,
        first_fbclid: first.fbclid,
        first_ttclid: first.ttclid,
        first_gclid: first.gclid,
        first_msclkid: first.msclkid,
        first_tblci: first.tblci,
        last_fbclid: last.fbclid,
        last_ttclid: last.ttclid,
        last_gclid: last.gclid,
        last_msclkid: last.msclkid,
        last_tblci: last.tblci,
        max_session_version: maxVersion(segment.map((s) => s.session_version)),
        max_identity_link_version: relevantLinks.length
          ? maxVersion(relevantLinks.map(identityVersion))
          : '0',
      });

      segment.forEach((session, sequenceIndex) => {
        sessionLinks.push({
          workspace_id: input.workspaceId,
          session_id: session.session_id,
          journey_id: journeyId,
          visitor_id: session.visitor_id,
          person_id: group.personId,
          pixel_id: session.pixel_id,
          test_mode: session.test_mode,
          sequence_index: sequenceIndex,
          session_started_at: session.session_started_at,
        });
      });
    }
  }

  journeys.sort(
    (a, b) =>
      a.journey_started_at.localeCompare(b.journey_started_at) ||
      a.journey_id.localeCompare(b.journey_id),
  );
  sessionLinks.sort(
    (a, b) =>
      a.session_started_at.localeCompare(b.session_started_at) ||
      a.session_id.localeCompare(b.session_id),
  );

  return { journeys, sessionLinks };
}
