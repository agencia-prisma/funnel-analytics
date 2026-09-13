import 'server-only';

import { readServerEnv } from '@funnel/config';

import type { FunnelRecord } from './funnels';
import { getCurrentWorkspaceFunnel } from './funnels';
import {
  requireCurrentWorkspace,
  requireWorkspacePermission,
} from './workspaces';

export type AnalyticsRangeDays = 7 | 30 | 90;

export interface FunnelStepAnalytics {
  stepKey: string;
  position: number;
  reachedAttempts: number;
  medianElapsedMs: number;
  averageElapsedMs: number;
  conversionFromPreviousPct: number | null;
  dropOffFromPreviousPct: number | null;
}

export interface FunnelAnalyticsOverview {
  funnelId: string;
  funnelVersionId: string | null;
  funnelVersion: number | null;
  rangeDays: AnalyticsRangeDays;
  currency: string;
  entrants: number;
  conversions: number;
  completionRatePct: number;
  medianConversionMs: number;
  averageConversionMs: number;
  sessions: number;
  pageViews: number;
  checkouts: number;
  orders: number;
  revenueMinor: number;
  aovMinor: number;
  steps: FunnelStepAnalytics[];
  generatedAt: string;
}

type ClickHouseParam = string | number | boolean;

interface ClickHouseConfig {
  url: string;
  username: string;
  password: string;
}

function requireClickHouseConfig(): ClickHouseConfig {
  const env = readServerEnv();
  if (!env.CLICKHOUSE_URL || !env.CLICKHOUSE_USERNAME || !env.CLICKHOUSE_PASSWORD) {
    throw new Error('ANALYTICS_CLICKHOUSE_NOT_CONFIGURED');
  }
  return {
    url: env.CLICKHOUSE_URL.replace(/\/$/, ''),
    username: env.CLICKHOUSE_USERNAME,
    password: env.CLICKHOUSE_PASSWORD,
  };
}

async function queryClickHouse<T>(
  query: string,
  params: Record<string, ClickHouseParam>,
): Promise<T[]> {
  const config = requireClickHouseConfig();
  const url = new URL(config.url);
  url.searchParams.set('database', 'funnel_analytics');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(`param_${key}`, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: `${query.trim()}\nFORMAT JSONEachRow`,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`ANALYTICS_CLICKHOUSE_QUERY_FAILED:${response.status}`);
    }
    const text = await response.text();
    if (!text.trim()) return [];
    return text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } finally {
    clearTimeout(timeout);
  }
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export async function getFunnelAnalytics(
  funnelId: string,
  rangeDays: AnalyticsRangeDays = 30,
): Promise<FunnelAnalyticsOverview> {
  const workspace = await requireCurrentWorkspace();
  await requireWorkspacePermission(workspace.id, 'funnels.view');

  const funnel: FunnelRecord = await getCurrentWorkspaceFunnel(funnelId);
  if (funnel.workspace_id !== workspace.id) {
    throw new Error('FUNNEL_NOT_FOUND');
  }

  const version = funnel.current_version;
  if (!version) {
    return {
      funnelId: funnel.id,
      funnelVersionId: null,
      funnelVersion: null,
      rangeDays,
      currency: workspace.currency,
      entrants: 0,
      conversions: 0,
      completionRatePct: 0,
      medianConversionMs: 0,
      averageConversionMs: 0,
      sessions: 0,
      pageViews: 0,
      checkouts: 0,
      orders: 0,
      revenueMinor: 0,
      aovMinor: 0,
      steps: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const common = {
    workspace_id: workspace.id,
    funnel_version_id: version.id,
    range_days: rangeDays,
  };

  const [stepRows, conversionRows, trafficRows, commerceRows] = await Promise.all([
    queryClickHouse<{
      step_key: string;
      step_position: number | string;
      reached_attempts: number | string;
      median_elapsed_ms: number | string;
      average_elapsed_ms: number | string;
    }>(
      `
SELECT
  step_key,
  step_position,
  uniqExact(tuple(journey_id, attempt_id)) AS reached_attempts,
  quantileExact(0.5)(elapsed_ms) AS median_elapsed_ms,
  avg(elapsed_ms) AS average_elapsed_ms
FROM funnel_analytics.funnel_step_hits_current
WHERE workspace_id = {workspace_id:UUID}
  AND funnel_version_id = {funnel_version_id:UUID}
  AND is_deleted = false
  AND test_mode = false
  AND occurred_at >= now() - toIntervalDay({range_days:UInt16})
GROUP BY step_key, step_position
ORDER BY step_position
`,
      common,
    ),
    queryClickHouse<{
      conversions: number | string;
      median_conversion_ms: number | string;
      average_conversion_ms: number | string;
    }>(
      `
SELECT
  uniqExact(tuple(journey_id, attempt_id)) AS conversions,
  quantileExact(0.5)(conversion_ms) AS median_conversion_ms,
  avg(conversion_ms) AS average_conversion_ms
FROM funnel_analytics.funnel_conversion_facts_current
WHERE workspace_id = {workspace_id:UUID}
  AND funnel_version_id = {funnel_version_id:UUID}
  AND is_deleted = false
  AND test_mode = false
  AND converted_at >= now() - toIntervalDay({range_days:UInt16})
`,
      common,
    ),
    queryClickHouse<{
      sessions: number | string;
      page_views: number | string;
    }>(
      `
SELECT
  uniqExact(session_id) AS sessions,
  countIf(event_name = 'page_view') AS page_views
FROM funnel_analytics.events FINAL
WHERE workspace_id = {workspace_id:UUID}
  AND test_mode = false
  AND occurred_at >= now() - toIntervalDay({range_days:UInt16})
  AND session_id IN
  (
    SELECT DISTINCT session_id
    FROM funnel_analytics.funnel_step_hits_current
    WHERE workspace_id = {workspace_id:UUID}
      AND funnel_version_id = {funnel_version_id:UUID}
      AND is_deleted = false
      AND test_mode = false
      AND occurred_at >= now() - toIntervalDay({range_days:UInt16})
  )
`,
      common,
    ),
    queryClickHouse<{
      checkouts: number | string;
      orders: number | string;
      revenue_minor: number | string;
    }>(
      `
WITH funnel_journeys AS
(
  SELECT DISTINCT journey_id
  FROM funnel_analytics.funnel_step_hits_current
  WHERE workspace_id = {workspace_id:UUID}
    AND funnel_version_id = {funnel_version_id:UUID}
    AND is_deleted = false
    AND test_mode = false
    AND occurred_at >= now() - toIntervalDay({range_days:UInt16})
)
SELECT
  (SELECT uniqExact(checkout_id)
   FROM funnel_analytics.commerce_checkout_facts_current
   WHERE workspace_id = {workspace_id:UUID}
     AND is_deleted = false
     AND test_mode = false
     AND occurred_at >= now() - toIntervalDay({range_days:UInt16})
     AND journey_id IN funnel_journeys) AS checkouts,
  (SELECT uniqExact(tuple(provider, order_id))
   FROM funnel_analytics.commerce_revenue_facts_current
   WHERE workspace_id = {workspace_id:UUID}
     AND is_deleted = false
     AND test_mode = false
     AND currency = {currency:String}
     AND purchased_at >= now() - toIntervalDay({range_days:UInt16})
     AND journey_id IN funnel_journeys) AS orders,
  (SELECT sum(net_amount_minor)
   FROM funnel_analytics.commerce_revenue_facts_current
   WHERE workspace_id = {workspace_id:UUID}
     AND is_deleted = false
     AND test_mode = false
     AND currency = {currency:String}
     AND purchased_at >= now() - toIntervalDay({range_days:UInt16})
     AND journey_id IN funnel_journeys) AS revenue_minor
`,
      { ...common, currency: workspace.currency },
    ),
  ]);

  const orderedDefinitionSteps = [...version.steps].sort(
    (a, b) => a.position - b.position,
  );
  const countsByKey = new Map(
    stepRows.map((row) => [row.step_key, numberValue(row.reached_attempts)]),
  );
  const timingByKey = new Map(
    stepRows.map((row) => [
      row.step_key,
      {
        median: numberValue(row.median_elapsed_ms),
        average: numberValue(row.average_elapsed_ms),
      },
    ]),
  );

  const steps = orderedDefinitionSteps.map((step, index) => {
    const reachedAttempts = countsByKey.get(step.step_key) ?? 0;
    const previous = index > 0 ? orderedDefinitionSteps[index - 1] : null;
    const previousCount = previous ? countsByKey.get(previous.step_key) ?? 0 : 0;
    const fromPrevious = previous ? pct(reachedAttempts, previousCount) : null;
    return {
      stepKey: step.step_key,
      position: step.position,
      reachedAttempts,
      medianElapsedMs: Math.round(timingByKey.get(step.step_key)?.median ?? 0),
      averageElapsedMs: Math.round(timingByKey.get(step.step_key)?.average ?? 0),
      conversionFromPreviousPct: fromPrevious,
      dropOffFromPreviousPct:
        fromPrevious === null ? null : Math.max(0, Math.round((100 - fromPrevious) * 100) / 100),
    };
  });

  const entrants = steps[0]?.reachedAttempts ?? 0;
  const conversion = conversionRows[0];
  const traffic = trafficRows[0];
  const commerce = commerceRows[0];
  const conversions = numberValue(conversion?.conversions);
  const orders = numberValue(commerce?.orders);
  const revenueMinor = numberValue(commerce?.revenue_minor);

  return {
    funnelId: funnel.id,
    funnelVersionId: version.id,
    funnelVersion: version.version,
    rangeDays,
    currency: workspace.currency,
    entrants,
    conversions,
    completionRatePct: pct(conversions, entrants),
    medianConversionMs: Math.round(numberValue(conversion?.median_conversion_ms)),
    averageConversionMs: Math.round(numberValue(conversion?.average_conversion_ms)),
    sessions: numberValue(traffic?.sessions),
    pageViews: numberValue(traffic?.page_views),
    checkouts: numberValue(commerce?.checkouts),
    orders,
    revenueMinor,
    aovMinor: orders > 0 ? Math.round(revenueMinor / orders) : 0,
    steps,
    generatedAt: new Date().toISOString(),
  };
}
