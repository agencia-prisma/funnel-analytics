import type { IdentityLinkV1, SessionFactV1 } from '@funnel/event-contracts';
import { expect, it } from 'vitest';

import { JOURNEY_POLICY_V1, reconstructJourneys } from './index';

const workspaceId = '21000000-0000-0000-0000-000000000001';
const personId = '51000000-0000-0000-0000-000000000001';
const pixelId = '31000000-0000-0000-0000-000000000001';

function uuid(index: number, prefix: string): string {
  return `${prefix}-0000-7000-8000-${index.toString().padStart(12, '0')}`;
}

it('reconstructs 1,000 sessions across 10 visitors without quadratic blow-up', async () => {
  const visitors = Array.from({ length: 10 }, (_, index) =>
    uuid(index + 1, '018f0000'),
  );
  const identityLinks: IdentityLinkV1[] = visitors.map((visitor_id) => ({
    link_version: 1,
    workspace_id: workspaceId,
    person_id: personId,
    visitor_id,
    pixel_id: pixelId,
    source: 'manual_browser_identify',
    confidence: 'high',
    linked_at: '2026-09-01T00:00:00.000Z',
    last_seen_at: '2026-09-01T00:00:01.000Z',
  }));

  const sessions: SessionFactV1[] = Array.from(
    { length: 1_000 },
    (_, index) => {
      const at = new Date(
        Date.parse('2026-09-01T00:00:00.000Z') + index * 60_000,
      ).toISOString();
      return {
        workspace_id: workspaceId,
        pixel_id: pixelId,
        session_id: uuid(index + 1, '018f1000'),
        visitor_id: visitors[index % visitors.length]!,
        session_partition_month: 202609,
        session_started_at: at,
        last_activity_at: at,
        duration_seconds: 0,
        event_count: 1,
        page_view_count: 1,
        custom_event_count: 0,
        landing_page_url: null,
        landing_page_path: null,
        landing_page_title: null,
        exit_page_url: null,
        exit_page_path: null,
        exit_page_title: null,
        session_referrer: null,
        session_referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        fbclid: null,
        ttclid: null,
        gclid: null,
        msclkid: null,
        tblci: null,
        device_type: 'desktop',
        browser_name: 'Chrome',
        os_name: 'macOS',
        language: null,
        timezone: null,
        test_mode: false,
        first_event_id: uuid(index + 1, '018f2000'),
        last_event_id: uuid(index + 1, '018f2000'),
        max_received_at: at,
        session_version: String(index + 1),
        updated_at: at,
      };
    },
  );

  const startedAt = performance.now();
  const result = await reconstructJourneys({
    workspaceId,
    sessions,
    identityLinks,
    policy: JOURNEY_POLICY_V1,
  });
  const elapsed = performance.now() - startedAt;

  expect(result.sessionLinks).toHaveLength(1_000);
  expect(result.journeys).toHaveLength(1);
  expect(result.journeys[0]?.visitor_count).toBe(10);
  expect(elapsed).toBeLessThan(10_000);
});
