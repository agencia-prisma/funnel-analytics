import type {
  BrowserEventV1,
  CollectorEnvelopeV1,
  NormalizedEventV1,
} from '@funnel/event-contracts';

function normalizeEvent(
  envelope: CollectorEnvelopeV1,
  event: BrowserEventV1,
): NormalizedEventV1 {
  const isCustom = event.event_name === 'custom_event';

  return {
    event_id: event.event_id,
    event_version: event.event_version,
    event_name: isCustom ? event.custom_event_name : event.event_name,
    custom_event_name: isCustom ? event.custom_event_name : null,
    workspace_id: envelope.workspace_id,
    pixel_id: envelope.pixel_id,
    visitor_id: event.visitor_id,
    session_id: event.session_id,
    occurred_at: event.occurred_at,
    received_at: envelope.received_at,
    source: envelope.source,
    page_url: event.page_url,
    page_path: event.page_path,
    page_title: event.page_title,
    origin_host: envelope.origin_host,
    referrer: event.referrer,
    referrer_domain: event.referrer_domain,
    utm_source: event.utm_source,
    utm_medium: event.utm_medium,
    utm_campaign: event.utm_campaign,
    utm_content: event.utm_content,
    utm_term: event.utm_term,
    fbclid: event.click_ids.fbclid ?? null,
    ttclid: event.click_ids.ttclid ?? null,
    gclid: event.click_ids.gclid ?? null,
    msclkid: event.click_ids.msclkid ?? null,
    tblci: event.click_ids.tblci ?? null,
    device_type: event.device.type,
    browser_name: event.browser.name,
    os_name: event.os.name,
    screen_width: event.screen.width,
    screen_height: event.screen.height,
    device_pixel_ratio: event.screen.device_pixel_ratio,
    viewport_width: event.viewport.width,
    viewport_height: event.viewport.height,
    language: event.language,
    timezone: event.timezone,
    consent_state: event.consent_state,
    test_mode: event.test_mode,
    sdk_version: event.sdk_version,
    properties: isCustom ? event.properties : {},
  };
}

export function normalizeEnvelope(
  envelope: CollectorEnvelopeV1,
): NormalizedEventV1[] {
  return envelope.events.map((event) => normalizeEvent(envelope, event));
}
