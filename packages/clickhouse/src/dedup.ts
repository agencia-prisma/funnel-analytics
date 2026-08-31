import type { NormalizedEventV1 } from '@funnel/event-contracts';

export async function createInsertDedupToken(
  events: NormalizedEventV1[],
): Promise<string> {
  const ids = [...events.map((event) => event.event_id)].sort();
  const payload = new TextEncoder().encode(ids.join('\n'));
  const digest = await crypto.subtle.digest('SHA-256', payload);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
