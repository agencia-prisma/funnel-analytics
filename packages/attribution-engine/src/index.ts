export const ATTRIBUTION_POLICY_VERSION = 1;
export const ATTRIBUTION_CREDIT_MICROS = 1_000_000;
export const ATTRIBUTION_MAX_EVENTS_PER_RECOMPUTE = 100_000;

export const ATTRIBUTION_MODELS_V1 = [
  'first_touch',
  'last_touch',
  'last_non_direct',
  'linear',
] as const;

export type AttributionModelV1 = (typeof ATTRIBUTION_MODELS_V1)[number];

export type AttributionChannelV1 =
  | 'direct'
  | 'paid_search'
  | 'paid_social'
  | 'display'
  | 'native'
  | 'affiliate'
  | 'email'
  | 'organic_search'
  | 'organic_social'
  | 'referral'
  | 'other';

export type AttributionClickIdTypeV1 =
  'gclid' | 'msclkid' | 'fbclid' | 'ttclid' | 'tblci';

export type AttributionEngineErrorCode =
  | 'ATTRIBUTION_INPUT_INVALID'
  | 'ATTRIBUTION_INPUT_TOO_LARGE'
  | 'ATTRIBUTION_ORDER_INVALID'
  | 'ATTRIBUTION_EVENT_INVALID'
  | 'ATTRIBUTION_PURCHASE_EVENT_MISSING'
  | 'ATTRIBUTION_TOUCHPOINT_MISSING';

export class AttributionEngineError extends Error {
  constructor(readonly code: AttributionEngineErrorCode) {
    super(code);
    this.name = 'AttributionEngineError';
  }
}

export interface AttributionSourceEventV1 {
  event_id: string;
  session_id: string;
  occurred_at: string;
  received_at: string;
  test_mode: boolean;
  page_url: string;
  page_path: string;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  msclkid: string | null;
  tblci: string | null;
}

export interface AttributionOrderV1 {
  workspace_id: string;
  journey_id: string;
  person_id: string | null;
  provider: string;
  order_id: string;
  currency: string;
  status: string;
  purchase_event_id: string;
  purchased_at: string;
  gross_amount_minor: number;
  refunded_amount_minor: number;
  net_amount_minor: number;
  test_mode: boolean;
}

export interface AttributionTouchpointV1 {
  sequence_index: number;
  session_id: string;
  event_id: string;
  occurred_at: string;
  channel: AttributionChannelV1;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer_domain: string | null;
  click_id_type: AttributionClickIdTypeV1 | null;
  click_id: string | null;
  is_direct: boolean;
}

export interface AttributionFactDraft {
  workspace_id: string;
  journey_id: string;
  person_id: string | null;
  provider: string;
  order_id: string;
  currency: string;
  order_status: string;
  attribution_model: AttributionModelV1;
  touchpoint_index: number;
  touchpoint_count: number;
  session_id: string;
  event_id: string;
  touchpoint_at: string;
  channel: AttributionChannelV1;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer_domain: string | null;
  click_id_type: AttributionClickIdTypeV1 | null;
  click_id: string | null;
  is_direct: boolean;
  credit_micros: number;
  attributed_gross_amount_minor: number;
  attributed_refunded_amount_minor: number;
  attributed_net_amount_minor: number;
  test_mode: boolean;
  attribution_policy_version: number;
  lookback_window_seconds: number;
}

export interface EvaluateAttributionInput {
  order: AttributionOrderV1;
  events: AttributionSourceEventV1[];
  lookbackWindowSeconds: number;
}

export interface AttributionEvaluationResult {
  touchpoints: AttributionTouchpointV1[];
  facts: AttributionFactDraft[];
}

interface ClickId {
  type: AttributionClickIdTypeV1;
  value: string;
}

function nonEmpty(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new AttributionEngineError('ATTRIBUTION_EVENT_INVALID');
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function lower(value: string | null): string | null {
  return value?.toLowerCase() ?? null;
}

function timestamp(value: string, code: AttributionEngineErrorCode): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AttributionEngineError(code);
  return parsed;
}

function safeMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AttributionEngineError('ATTRIBUTION_ORDER_INVALID');
  }
  return value;
}

function compareEvents(
  left: AttributionSourceEventV1,
  right: AttributionSourceEventV1,
): number {
  return (
    timestamp(left.occurred_at, 'ATTRIBUTION_EVENT_INVALID') -
      timestamp(right.occurred_at, 'ATTRIBUTION_EVENT_INVALID') ||
    timestamp(left.received_at, 'ATTRIBUTION_EVENT_INVALID') -
      timestamp(right.received_at, 'ATTRIBUTION_EVENT_INVALID') ||
    left.event_id.localeCompare(right.event_id)
  );
}

function clickId(event: AttributionSourceEventV1): ClickId | null {
  const candidates: Array<[AttributionClickIdTypeV1, string | null]> = [
    ['gclid', nonEmpty(event.gclid)],
    ['msclkid', nonEmpty(event.msclkid)],
    ['fbclid', nonEmpty(event.fbclid)],
    ['ttclid', nonEmpty(event.ttclid)],
    ['tblci', nonEmpty(event.tblci)],
  ];
  const found = candidates.find(([, value]) => value !== null);
  return found && found[1] ? { type: found[0], value: found[1] } : null;
}

function inferredSource(type: AttributionClickIdTypeV1): string {
  switch (type) {
    case 'gclid':
      return 'google';
    case 'msclkid':
      return 'microsoft';
    case 'fbclid':
      return 'meta';
    case 'ttclid':
      return 'tiktok';
    case 'tblci':
      return 'taboola';
  }
}

function inferredMedium(type: AttributionClickIdTypeV1): string {
  switch (type) {
    case 'gclid':
    case 'msclkid':
      return 'cpc';
    case 'fbclid':
    case 'ttclid':
      return 'paid_social';
    case 'tblci':
      return 'native';
  }
}

function channelFor(input: {
  source: string;
  medium: string | null;
  click: ClickId | null;
  referrerDomain: string | null;
  direct: boolean;
}): AttributionChannelV1 {
  if (input.direct) return 'direct';
  const medium = input.medium?.toLowerCase() ?? '';
  const source = input.source.toLowerCase();

  if (['cpc', 'ppc', 'paid_search', 'paidsearch', 'sem'].includes(medium)) {
    return 'paid_search';
  }
  if (
    ['paid_social', 'paidsocial', 'social_paid', 'paid-social'].includes(medium)
  ) {
    return 'paid_social';
  }
  if (['display', 'cpm', 'banner', 'programmatic'].includes(medium)) {
    return 'display';
  }
  if (['native', 'native_ads', 'native-ad'].includes(medium)) return 'native';
  if (['affiliate', 'affiliates'].includes(medium)) return 'affiliate';
  if (['email', 'e-mail'].includes(medium)) return 'email';
  if (['social', 'organic_social', 'organic-social'].includes(medium)) {
    return 'organic_social';
  }
  if (medium === 'organic') {
    return ['google', 'bing', 'microsoft', 'yahoo', 'duckduckgo'].includes(
      source,
    )
      ? 'organic_search'
      : 'other';
  }
  if (medium === 'referral' || input.referrerDomain) return 'referral';

  if (input.click) {
    if (input.click.type === 'gclid' || input.click.type === 'msclkid') {
      return 'paid_search';
    }
    if (input.click.type === 'fbclid' || input.click.type === 'ttclid') {
      return 'paid_social';
    }
    return 'native';
  }
  return 'other';
}

function hasMarketingSignal(event: AttributionSourceEventV1): boolean {
  return Boolean(
    nonEmpty(event.utm_source) ||
    nonEmpty(event.utm_medium) ||
    nonEmpty(event.utm_campaign) ||
    nonEmpty(event.utm_content) ||
    nonEmpty(event.utm_term) ||
    nonEmpty(event.referrer_domain) ||
    clickId(event),
  );
}

function toTouchpoint(
  event: AttributionSourceEventV1,
  sequenceIndex: number,
): AttributionTouchpointV1 {
  const click = clickId(event);
  const explicitSource = lower(nonEmpty(event.utm_source));
  const explicitMedium = lower(nonEmpty(event.utm_medium));
  const referrerDomain = lower(nonEmpty(event.referrer_domain));
  const hasCampaignSignal = Boolean(
    explicitSource ||
    explicitMedium ||
    nonEmpty(event.utm_campaign) ||
    nonEmpty(event.utm_content) ||
    nonEmpty(event.utm_term),
  );
  const direct = !hasCampaignSignal && !click && !referrerDomain;
  const source =
    explicitSource ??
    (click ? inferredSource(click.type) : (referrerDomain ?? 'direct'));
  const medium =
    explicitMedium ??
    (click ? inferredMedium(click.type) : referrerDomain ? 'referral' : null);

  return {
    sequence_index: sequenceIndex,
    session_id: event.session_id,
    event_id: event.event_id,
    occurred_at: new Date(
      timestamp(event.occurred_at, 'ATTRIBUTION_EVENT_INVALID'),
    ).toISOString(),
    channel: channelFor({
      source,
      medium,
      click,
      referrerDomain,
      direct,
    }),
    source,
    medium,
    campaign: nonEmpty(event.utm_campaign),
    content: nonEmpty(event.utm_content),
    term: nonEmpty(event.utm_term),
    referrer_domain: referrerDomain,
    click_id_type: click?.type ?? null,
    click_id: click?.value ?? null,
    is_direct: direct,
  };
}

function buildTouchpoints(
  events: AttributionSourceEventV1[],
  order: AttributionOrderV1,
  lookbackWindowSeconds: number,
): AttributionTouchpointV1[] {
  const purchasedAt = timestamp(
    order.purchased_at,
    'ATTRIBUTION_ORDER_INVALID',
  );
  const earliest = purchasedAt - lookbackWindowSeconds * 1000;
  const eligible = events
    .filter((event) => event.test_mode === order.test_mode)
    .filter((event) => {
      const occurredAt = timestamp(
        event.occurred_at,
        'ATTRIBUTION_EVENT_INVALID',
      );
      return occurredAt >= earliest && occurredAt <= purchasedAt;
    })
    .sort(compareEvents);

  if (!eligible.some((event) => event.event_id === order.purchase_event_id)) {
    throw new AttributionEngineError('ATTRIBUTION_PURCHASE_EVENT_MISSING');
  }

  const sessions = new Map<string, AttributionSourceEventV1[]>();
  for (const event of eligible) {
    if (!event.session_id) {
      throw new AttributionEngineError('ATTRIBUTION_EVENT_INVALID');
    }
    const existing = sessions.get(event.session_id);
    if (existing) existing.push(event);
    else sessions.set(event.session_id, [event]);
  }

  const touchpoints: AttributionTouchpointV1[] = [];
  for (const sessionEvents of sessions.values()) {
    sessionEvents.sort(compareEvents);
    const selected =
      sessionEvents.find((event) => hasMarketingSignal(event)) ??
      sessionEvents[0];
    if (selected) touchpoints.push(toTouchpoint(selected, 0));
  }

  touchpoints.sort(
    (left, right) =>
      timestamp(left.occurred_at, 'ATTRIBUTION_EVENT_INVALID') -
        timestamp(right.occurred_at, 'ATTRIBUTION_EVENT_INVALID') ||
      left.session_id.localeCompare(right.session_id) ||
      left.event_id.localeCompare(right.event_id),
  );

  return touchpoints.map((touchpoint, index) => ({
    ...touchpoint,
    sequence_index: index + 1,
  }));
}

function distribute(total: number, count: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || count <= 0) {
    throw new AttributionEngineError('ATTRIBUTION_ORDER_INVALID');
  }
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}

function selectTouchpoints(
  model: AttributionModelV1,
  touchpoints: AttributionTouchpointV1[],
): AttributionTouchpointV1[] {
  if (!touchpoints.length) {
    throw new AttributionEngineError('ATTRIBUTION_TOUCHPOINT_MISSING');
  }
  if (model === 'first_touch') return [touchpoints[0]!];
  if (model === 'last_touch') return [touchpoints[touchpoints.length - 1]!];
  if (model === 'last_non_direct') {
    for (let index = touchpoints.length - 1; index >= 0; index -= 1) {
      const touchpoint = touchpoints[index]!;
      if (!touchpoint.is_direct) return [touchpoint];
    }
    return [touchpoints[touchpoints.length - 1]!];
  }
  return touchpoints;
}

function validateInput(input: EvaluateAttributionInput): void {
  if (
    !input.order?.workspace_id ||
    !input.order.journey_id ||
    !input.order.provider ||
    !input.order.order_id ||
    !input.order.currency ||
    !input.order.purchase_event_id ||
    typeof input.order.test_mode !== 'boolean' ||
    !Array.isArray(input.events) ||
    !Number.isSafeInteger(input.lookbackWindowSeconds) ||
    input.lookbackWindowSeconds <= 0
  ) {
    throw new AttributionEngineError('ATTRIBUTION_INPUT_INVALID');
  }
  if (input.events.length > ATTRIBUTION_MAX_EVENTS_PER_RECOMPUTE) {
    throw new AttributionEngineError('ATTRIBUTION_INPUT_TOO_LARGE');
  }
  safeMoney(input.order.gross_amount_minor);
  safeMoney(input.order.refunded_amount_minor);
  safeMoney(input.order.net_amount_minor);
  if (
    input.order.refunded_amount_minor > input.order.gross_amount_minor ||
    input.order.net_amount_minor !==
      input.order.gross_amount_minor - input.order.refunded_amount_minor
  ) {
    throw new AttributionEngineError('ATTRIBUTION_ORDER_INVALID');
  }
  timestamp(input.order.purchased_at, 'ATTRIBUTION_ORDER_INVALID');
}

export function evaluateAttribution(
  input: EvaluateAttributionInput,
): AttributionEvaluationResult {
  validateInput(input);
  const touchpoints = buildTouchpoints(
    input.events,
    input.order,
    input.lookbackWindowSeconds,
  );
  if (!touchpoints.length) {
    throw new AttributionEngineError('ATTRIBUTION_TOUCHPOINT_MISSING');
  }

  const facts: AttributionFactDraft[] = [];
  for (const model of ATTRIBUTION_MODELS_V1) {
    const selected = selectTouchpoints(model, touchpoints);
    const credit = distribute(ATTRIBUTION_CREDIT_MICROS, selected.length);
    const gross = distribute(input.order.gross_amount_minor, selected.length);
    const refunded = distribute(
      input.order.refunded_amount_minor,
      selected.length,
    );
    const net = distribute(input.order.net_amount_minor, selected.length);

    selected.forEach((touchpoint, index) => {
      facts.push({
        workspace_id: input.order.workspace_id,
        journey_id: input.order.journey_id,
        person_id: input.order.person_id,
        provider: input.order.provider,
        order_id: input.order.order_id,
        currency: input.order.currency,
        order_status: input.order.status,
        attribution_model: model,
        touchpoint_index: touchpoint.sequence_index,
        touchpoint_count: touchpoints.length,
        session_id: touchpoint.session_id,
        event_id: touchpoint.event_id,
        touchpoint_at: touchpoint.occurred_at,
        channel: touchpoint.channel,
        source: touchpoint.source,
        medium: touchpoint.medium,
        campaign: touchpoint.campaign,
        content: touchpoint.content,
        term: touchpoint.term,
        referrer_domain: touchpoint.referrer_domain,
        click_id_type: touchpoint.click_id_type,
        click_id: touchpoint.click_id,
        is_direct: touchpoint.is_direct,
        credit_micros: credit[index]!,
        attributed_gross_amount_minor: gross[index]!,
        attributed_refunded_amount_minor: refunded[index]!,
        attributed_net_amount_minor: net[index]!,
        test_mode: input.order.test_mode,
        attribution_policy_version: ATTRIBUTION_POLICY_VERSION,
        lookback_window_seconds: input.lookbackWindowSeconds,
      });
    });
  }

  return { touchpoints, facts };
}
