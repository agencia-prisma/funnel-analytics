import type {
  ConsentStateV1,
  CustomEventV1,
  PageViewEventV1,
} from '@funnel/event-contracts';

import type { TouchContext } from './attribution';
import type { PageContext } from './context';
import { detectDevice } from './device';
import { createUuidV7 } from './ids';
import {
  isValidCustomEventName,
  sanitizeCustomProperties,
} from './properties';

export interface EventIdentity {
  visitorId: string;
  sessionId: string;
}

export interface EventFactoryContext {
  pixelKey: string;
  sdkVersion: string;
  testMode: boolean;
  consentState: ConsentStateV1;
  identity: EventIdentity;
  page: PageContext;
  attribution: TouchContext;
  navigatorRef: Navigator;
  now?: number;
}

function baseEvent(context: EventFactoryContext) {
  const device = detectDevice(context.navigatorRef);
  const occurredAt = new Date(context.now ?? Date.now()).toISOString();

  return {
    event_id: createUuidV7(context.now ?? Date.now()),
    event_version: 1 as const,
    sdk_version: context.sdkVersion,
    pixel_key: context.pixelKey,
    visitor_id: context.identity.visitorId,
    session_id: context.identity.sessionId,
    occurred_at: occurredAt,
    page_url: context.page.pageUrl,
    page_path: context.page.pagePath,
    page_title: context.page.pageTitle,
    referrer: context.page.referrer,
    referrer_domain: context.page.referrerDomain,
    utm_source: context.attribution.utm_source,
    utm_medium: context.attribution.utm_medium,
    utm_campaign: context.attribution.utm_campaign,
    utm_content: context.attribution.utm_content,
    utm_term: context.attribution.utm_term,
    click_ids: { ...context.attribution.click_ids },
    device: {
      type: device.deviceType,
    },
    browser: {
      name: device.browserName,
    },
    os: {
      name: device.osName,
    },
    screen: {
      width: context.page.screen.width,
      height: context.page.screen.height,
      device_pixel_ratio: context.page.screen.devicePixelRatio,
    },
    viewport: {
      width: context.page.viewport.width,
      height: context.page.viewport.height,
    },
    language: context.page.language,
    timezone: context.page.timezone,
    consent_state: context.consentState,
    test_mode: context.testMode,
  };
}

export function createPageViewEvent(
  context: EventFactoryContext,
): PageViewEventV1 {
  return {
    ...baseEvent(context),
    event_name: 'page_view',
  };
}

export function createCustomEvent(
  customEventName: string,
  properties: unknown,
  context: EventFactoryContext,
): CustomEventV1 | null {
  if (!isValidCustomEventName(customEventName)) {
    return null;
  }

  return {
    ...baseEvent(context),
    event_name: 'custom_event',
    custom_event_name: customEventName,
    properties: sanitizeCustomProperties(properties),
  };
}
