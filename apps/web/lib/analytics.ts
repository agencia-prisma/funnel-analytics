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

export interface AnalyticsMetricComparison {
  current: number;
  previous: number;
  changePct: number | null;
}

export interface FunnelAnalyticsComparison {
  entrants: AnalyticsMetricComparison;
  conversions: AnalyticsMetricComparison;
  completionRatePct: AnalyticsMetricComparison;
  sessions: AnalyticsMetricComparison;
  checkouts: AnalyticsMetricComparison;
  orders: AnalyticsMetricComparison;
  revenueMinor: AnalyticsMetricComparison;
  aovMinor: AnalyticsMetricComparison;
}

export interface FunnelAnalyticsTimeSeriesPoint {
  date: string;
  entrants: number;
  conversions: number;
  revenueMinor: number;
}

export interface FunnelAttributionAnalytics {
  attributionModel: string;
  channel: string;
  source: string;
  campaign: string | null;
  orders: number;
  attributedRevenueMinor: number;
  sharePct: number;
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
  comparison: FunnelAnalyticsComparison;
  timeSeries: FunnelAnalyticsTimeSeriesPoint[];
  attribution: FunnelAttributionAnalytics[];
  generatedAt: string;
}

type ClickHouseParam = string | number | boolean;

interface ClickHouseConfig {
  url: string;
  username: string;
  password: string;
}

interface WindowMetrics {
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
}

function requireClickHouseConfig(): ClickHouseConfig {
  const env = readServerEnv();
  if (
    !env.CLICKHOUSE_URL ||
    !env.CLICKHOUSE_USERNAME ||
    !env.CLICKHOUSE_PASSWORD
  ) {
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ANALYTICS_CLICKHOUSE_TIMEOUT');
    }
    throw error;
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

export function analyticsChangePct(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10_000) / 100;
}

function compareMetric(
  current: number,
  previous: number,
): AnalyticsMetricComparison {
  return {
    current,
    previous,
    changePct: analyticsChangePct(current, previous),
  };
}

function emptyWindowMetrics(): WindowMetrics {
  return {
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
  };
}

async function loadWindowMetrics(input: {
  workspaceId: string;
  funnelVersionId: string;
  currency: string;
  fromDaysAgo: number;
  toDaysAgo: number;
}): Promise<WindowMetrics> {
  const common = {
    workspace_id: input.workspaceId,
    funnel_version_id: input.funnelVersionId,
    from_days_ago: input.fromDaysAgo,
    to_days_ago: input.toDaysAgo,
  };
  const timePredicate = (column: string) =>
    `${column} >= now() - toIntervalDay({from_days_ago:UInt16})\n  AND ${column} < now() - toIntervalDay({to_days_ago:UInt16})`;

  const [stepRows, conversionRows, trafficRows, commerceRows] =
    await Promise.all([
      queryClickHouse<{ entrants: number | string }>(
        `
SELECT uniqExact(tuple(journey_id, attempt_id)) AS entrants
FROM funnel_analytics.funnel_step_hits_current
WHERE workspace_id = {workspace_id:UUID}
  AND funnel_version_id = {funnel_version_id:UUID}
  AND step_position = 1
  AND is_deleted = false
  AND test_mode = false
  AND ${timePredicate('occurred_at')}
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
  AND ${timePredicate('converted_at')}
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
  AND ${timePredicate('occurred_at')}
  AND session_id IN
  (
    SELECT DISTINCT session_id
    FROM funnel_analytics.funnel_step_hits_current
    WHERE workspace_id = {workspace_id:UUID}
      AND funnel_version_id = {funnel_version_id:UUID}
      AND is_deleted = false
      AND test_mode = false
      AND ${timePredicate('occurred_at')}
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
    AND ${timePredicate('occurred_at')}
)
SELECT
  (SELECT uniqExact(checkout_id)
   FROM funnel_analytics.commerce_checkout_facts_current
   WHERE workspace_id = {workspace_id:UUID}
     AND is_deleted = false
     AND test_mode = false
     AND ${timePredicate('occurred_at')}
     AND journey_id IN funnel_journeys) AS checkouts,
  (SELECT uniqExact(tuple(provider, order_id))
   FROM funnel_analytics.commerce_revenue_facts_current
   WHERE workspace_id = {workspace_id:UUID}
     AND is_deleted = false
     AND test_mode = false
     AND currency = {currency:String}
     AND ${timePredicate('purchased_at')}
     AND journey_id IN funnel_journeys) AS orders,
  (SELECT sum(net_amount_minor)
   FROM funnel_analytics.commerce_revenue_facts_current
   WHERE workspace_id = {workspace_id:UUID}
     AND is_deleted = false
     AND test_mode = false
     AND currency = {currency:String}
     AND ${timePredicate('purchased_at')}
     AND journey_id IN funnel_journeys) AS revenue_minor
`,
        { ...common, currency: input.currency },
      ),
    ]);

  const entrants = numberValue(stepRows[0]?.entrants);
  const conversions = numberValue(conversionRows[0]?.conversions);
  const orders = numberValue(commerceRows[0]?.orders);
  const revenueMinor = numberValue(commerceRows[0]?.revenue_minor);

  return {
    entrants,
    conversions,
    completionRatePct: pct(conversions, entrants),
    medianConversionMs: Math.round(
      numberValue(conversionRows[0]?.median_conversion_ms),
    ),
    averageConversionMs: Math.round(
      numberValue(conversionRows[0]?.average_conversion_ms),
    ),
    sessions: numberValue(trafficRows[0]?.sessions),
    pageViews: numberValue(trafficRows[0]?.page_views),
    checkouts: numberValue(commerceRows[0]?.checkouts),
    orders,
    revenueMinor,
    aovMinor: orders > 0 ? Math.round(revenueMinor / orders) : 0,
  };
}

async function loadTimeSeries(input: {
  workspaceId: string;
  funnelVersionId: string;
  currency: string;
  rangeDays: AnalyticsRangeDays;
}): Promise<FunnelAnalyticsTimeSeriesPoint[]> {
  const params = {
    workspace_id: input.workspaceId,
    funnel_version_id: input.funnelVersionId,
    range_days: input.rangeDays,
    currency: input.currency,
  };

  const [entryRows, conversionRows, revenueRows] = await Promise.all([
    queryClickHouse<{ day: string; entrants: number | string }>(
      `
SELECT toString(toDate(occurred_at)) AS day,
       uniqExact(tuple(journey_id, attempt_id)) AS entrants
FROM funnel_analytics.funnel_step_hits_current
WHERE workspace_id = {workspace_id:UUID}
  AND funnel_version_id = {funnel_version_id:UUID}
  AND step_position = 1
  AND is_deleted = false
  AND test_mode = false
  AND occurred_at >= today() - toIntervalDay({range_days:UInt16} - 1)
GROUP BY day
ORDER BY day
`,
      params,
    ),
    queryClickHouse<{ day: string; conversions: number | string }>(
      `
SELECT toString(toDate(converted_at)) AS day,
       uniqExact(tuple(journey_id, attempt_id)) AS conversions
FROM funnel_analytics.funnel_conversion_facts_current
WHERE workspace_id = {workspace_id:UUID}
  AND funnel_version_id = {funnel_version_id:UUID}
  AND is_deleted = false
  AND test_mode = false
  AND converted_at >= today() - toIntervalDay({range_days:UInt16} - 1)
GROUP BY day
ORDER BY day
`,
      params,
    ),
    queryClickHouse<{ day: string; revenue_minor: number | string }>(
      `
WITH funnel_journeys AS
(
  SELECT DISTINCT journey_id
  FROM funnel_analytics.funnel_step_hits_current
  WHERE workspace_id = {workspace_id:UUID}
    AND funnel_version_id = {funnel_version_id:UUID}
    AND is_deleted = false
    AND test_mode = false
    AND occurred_at >= today() - toIntervalDay({range_days:UInt16} - 1)
)
SELECT toString(toDate(purchased_at)) AS day,
       sum(net_amount_minor) AS revenue_minor
FROM funnel_analytics.commerce_revenue_facts_current
WHERE workspace_id = {workspace_id:UUID}
  AND is_deleted = false
  AND test_mode = false
  AND currency = {currency:String}
  AND purchased_at >= today() - toIntervalDay({range_days:UInt16} - 1)
  AND journey_id IN funnel_journeys
GROUP BY day
ORDER BY day
`,
      params,
    ),
  ]);

  const byDate = new Map<string, FunnelAnalyticsTimeSeriesPoint>();
  const ensure = (date: string) => {
    const current = byDate.get(date);
    if (current) return current;
    const created = { date, entrants: 0, conversions: 0, revenueMinor: 0 };
    byDate.set(date, created);
    return created;
  };

  for (const row of entryRows)
    ensure(row.day).entrants = numberValue(row.entrants);
  for (const row of conversionRows)
    ensure(row.day).conversions = numberValue(row.conversions);
  for (const row of revenueRows)
    ensure(row.day).revenueMinor = numberValue(row.revenue_minor);

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function loadAttribution(input: {
  workspaceId: string;
  funnelVersionId: string;
  currency: string;
  rangeDays: AnalyticsRangeDays;
}): Promise<FunnelAttributionAnalytics[]> {
  const rows = await queryClickHouse<{
    attribution_model: string;
    channel: string;
    source: string;
    campaign: string | null;
    orders: number | string;
    attributed_revenue_minor: number | string;
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
  a.attribution_model,
  a.channel,
  a.source,
  a.campaign,
  uniqExact(tuple(a.provider, a.order_id)) AS orders,
  sum(a.attributed_net_amount_minor) AS attributed_revenue_minor
FROM funnel_analytics.attribution_facts_current AS a
INNER JOIN funnel_analytics.commerce_revenue_facts_current AS r
  ON r.workspace_id = a.workspace_id
 AND r.provider = a.provider
 AND r.order_id = a.order_id
WHERE a.workspace_id = {workspace_id:UUID}
  AND a.is_deleted = false
  AND a.test_mode = false
  AND r.is_deleted = false
  AND r.test_mode = false
  AND r.currency = {currency:String}
  AND r.purchased_at >= now() - toIntervalDay({range_days:UInt16})
  AND r.journey_id IN funnel_journeys
GROUP BY a.attribution_model, a.channel, a.source, a.campaign
ORDER BY attributed_revenue_minor DESC
LIMIT 20
`,
    {
      workspace_id: input.workspaceId,
      funnel_version_id: input.funnelVersionId,
      currency: input.currency,
      range_days: input.rangeDays,
    },
  );

  const totalsByModel = new Map<string, number>();
  for (const row of rows) {
    totalsByModel.set(
      row.attribution_model,
      (totalsByModel.get(row.attribution_model) ?? 0) +
        numberValue(row.attributed_revenue_minor),
    );
  }

  return rows.map((row) => {
    const revenue = numberValue(row.attributed_revenue_minor);
    return {
      attributionModel: row.attribution_model,
      channel: row.channel,
      source: row.source,
      campaign: row.campaign,
      orders: numberValue(row.orders),
      attributedRevenueMinor: revenue,
      sharePct: pct(revenue, totalsByModel.get(row.attribution_model) ?? 0),
    };
  });
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
    const empty = emptyWindowMetrics();
    const comparison = {
      entrants: compareMetric(0, 0),
      conversions: compareMetric(0, 0),
      completionRatePct: compareMetric(0, 0),
      sessions: compareMetric(0, 0),
      checkouts: compareMetric(0, 0),
      orders: compareMetric(0, 0),
      revenueMinor: compareMetric(0, 0),
      aovMinor: compareMetric(0, 0),
    };
    return {
      funnelId: funnel.id,
      funnelVersionId: null,
      funnelVersion: null,
      rangeDays,
      currency: workspace.currency,
      ...empty,
      steps: [],
      comparison,
      timeSeries: [],
      attribution: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const common = {
    workspace_id: workspace.id,
    funnel_version_id: version.id,
    range_days: rangeDays,
  };

  const [stepRows, current, previous, timeSeries, attribution] =
    await Promise.all([
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
      loadWindowMetrics({
        workspaceId: workspace.id,
        funnelVersionId: version.id,
        currency: workspace.currency,
        fromDaysAgo: rangeDays,
        toDaysAgo: 0,
      }),
      loadWindowMetrics({
        workspaceId: workspace.id,
        funnelVersionId: version.id,
        currency: workspace.currency,
        fromDaysAgo: rangeDays * 2,
        toDaysAgo: rangeDays,
      }),
      loadTimeSeries({
        workspaceId: workspace.id,
        funnelVersionId: version.id,
        currency: workspace.currency,
        rangeDays,
      }),
      loadAttribution({
        workspaceId: workspace.id,
        funnelVersionId: version.id,
        currency: workspace.currency,
        rangeDays,
      }),
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
    const previousStep = index > 0 ? orderedDefinitionSteps[index - 1] : null;
    const previousCount = previousStep
      ? (countsByKey.get(previousStep.step_key) ?? 0)
      : 0;
    const fromPrevious = previousStep
      ? pct(reachedAttempts, previousCount)
      : null;
    return {
      stepKey: step.step_key,
      position: step.position,
      reachedAttempts,
      medianElapsedMs: Math.round(timingByKey.get(step.step_key)?.median ?? 0),
      averageElapsedMs: Math.round(
        timingByKey.get(step.step_key)?.average ?? 0,
      ),
      conversionFromPreviousPct: fromPrevious,
      dropOffFromPreviousPct:
        fromPrevious === null
          ? null
          : Math.max(0, Math.round((100 - fromPrevious) * 100) / 100),
    };
  });

  return {
    funnelId: funnel.id,
    funnelVersionId: version.id,
    funnelVersion: version.version,
    rangeDays,
    currency: workspace.currency,
    ...current,
    steps,
    comparison: {
      entrants: compareMetric(current.entrants, previous.entrants),
      conversions: compareMetric(current.conversions, previous.conversions),
      completionRatePct: compareMetric(
        current.completionRatePct,
        previous.completionRatePct,
      ),
      sessions: compareMetric(current.sessions, previous.sessions),
      checkouts: compareMetric(current.checkouts, previous.checkouts),
      orders: compareMetric(current.orders, previous.orders),
      revenueMinor: compareMetric(current.revenueMinor, previous.revenueMinor),
      aovMinor: compareMetric(current.aovMinor, previous.aovMinor),
    },
    timeSeries,
    attribution,
    generatedAt: new Date().toISOString(),
  };
}
