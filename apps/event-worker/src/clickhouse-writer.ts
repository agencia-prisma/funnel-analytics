import {
  ClickHouseWriteError,
  HttpClickHouseWriter,
  type ClickHouseWriter,
} from '@funnel/clickhouse';

import { PipelineError } from './errors';
import type { EventWorkerEnv } from './types';

export function clickHouseWriterFromEnv(env: EventWorkerEnv): ClickHouseWriter {
  return new HttpClickHouseWriter({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USERNAME,
    password: env.CLICKHOUSE_PASSWORD,
    database: 'funnel_analytics',
  });
}

export function mapClickHouseError(error: unknown): PipelineError {
  if (error instanceof ClickHouseWriteError) {
    return new PipelineError(
      error.retryable ? 'TRANSIENT' : 'PERMANENT',
      error.message === 'CLICKHOUSE_BATCH_TOO_LARGE'
        ? 'CLICKHOUSE_BATCH_TOO_LARGE'
        : 'CLICKHOUSE_FAILED',
    );
  }

  return new PipelineError('TRANSIENT', 'CLICKHOUSE_FAILED');
}
