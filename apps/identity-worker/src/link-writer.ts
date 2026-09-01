import {
  ClickHouseIdentityLinkWriter,
  ClickHouseWriteError,
  type IdentityLinkWriter,
} from '@funnel/clickhouse';

import { IdentityWorkerError } from './errors';
import type { IdentityWorkerEnv } from './types';

export function identityLinkWriterFromEnv(
  env: IdentityWorkerEnv,
): IdentityLinkWriter {
  return new ClickHouseIdentityLinkWriter({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USERNAME,
    password: env.CLICKHOUSE_PASSWORD,
    database: 'funnel_analytics',
  });
}

export function mapIdentityLinkWriteError(
  error: unknown,
): IdentityWorkerError {
  if (error instanceof ClickHouseWriteError) {
    return new IdentityWorkerError(
      error.retryable ? 'TRANSIENT' : 'PERMANENT',
      'IDENTITY_LINK_WRITE_FAILED',
    );
  }

  return new IdentityWorkerError(
    'TRANSIENT',
    'IDENTITY_LINK_WRITE_FAILED',
  );
}
