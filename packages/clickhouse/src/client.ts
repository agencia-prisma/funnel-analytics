import { createClient } from '@clickhouse/client-web';

import type { ClickHouseConfig } from './types';

const LOCAL_CLICKHOUSE_PATTERN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/;

export function validateClickHouseUrl(url: string): void {
  if (
    !url ||
    (url.startsWith('http://') && !LOCAL_CLICKHOUSE_PATTERN.test(url))
  ) {
    throw new Error('CLICKHOUSE_HTTPS_REQUIRED');
  }
}

export function createClickHouseWebClient(
  config: ClickHouseConfig,
  requestTimeoutMs = 10_000,
) {
  validateClickHouseUrl(config.url);

  return createClient({
    url: config.url,
    username: config.username,
    password: config.password,
    database: config.database ?? 'funnel_analytics',
    request_timeout: requestTimeoutMs,
  });
}

export type ClickHouseWebClient = ReturnType<typeof createClickHouseWebClient>;
