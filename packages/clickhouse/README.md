# @funnel/clickhouse

Server-only ClickHouse access for Funnel Analytics.

## Client

Uses the official `@clickhouse/client-web` package because it is Fetch/Web Streams based and supported in Cloudflare Workers.

## Schema

Versioned DDL lives in:

```text
infra/clickhouse/migrations
```

Apply explicitly:

```bash
CLICKHOUSE_URL=http://127.0.0.1:8123 \
CLICKHOUSE_USERNAME=default \
CLICKHOUSE_PASSWORD=... \
pnpm clickhouse:migrate
```

Migrations are never applied automatically to Production by pull requests.

## Events

Primary analytical table:

```text
funnel_analytics.events
```

It uses `ReplacingMergeTree` with monthly partitioning and an event-oriented sorting key. Retries are additionally given deterministic insert deduplication tokens.

For correctness-sensitive raw-event queries, `FINAL` provides immediate logical deduplication. Future high-volume analytical APIs should prefer derived/materialized representations rather than blindly attaching `FINAL` to every query.
