import {
  SESSION_RECOMPUTE_V1_MAX_SESSION_IDS,
  type NormalizedEventV1,
  type SessionRecomputeEnvelopeV1,
} from '@funnel/event-contracts';

interface SessionGroup {
  workspace_id: string;
  pixel_id: string;
  session_ids: Set<string>;
}

export function buildSessionRecomputeEnvelopes(
  events: NormalizedEventV1[],
  generatedAt: string,
  requestIdFactory: () => string = crypto.randomUUID,
): SessionRecomputeEnvelopeV1[] {
  const groups = new Map<string, SessionGroup>();

  for (const event of events) {
    const key = `${event.workspace_id}:${event.pixel_id}`;
    const existing = groups.get(key);

    if (existing) {
      existing.session_ids.add(event.session_id);
      continue;
    }

    groups.set(key, {
      workspace_id: event.workspace_id,
      pixel_id: event.pixel_id,
      session_ids: new Set([event.session_id]),
    });
  }

  const envelopes: SessionRecomputeEnvelopeV1[] = [];

  for (const group of groups.values()) {
    const sessionIds = [...group.session_ids].sort();

    for (
      let offset = 0;
      offset < sessionIds.length;
      offset += SESSION_RECOMPUTE_V1_MAX_SESSION_IDS
    ) {
      envelopes.push({
        envelope_version: 1,
        request_id: requestIdFactory(),
        generated_at: generatedAt,
        workspace_id: group.workspace_id,
        pixel_id: group.pixel_id,
        session_ids: sessionIds.slice(
          offset,
          offset + SESSION_RECOMPUTE_V1_MAX_SESSION_IDS,
        ),
      });
    }
  }

  return envelopes;
}
