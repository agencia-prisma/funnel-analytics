import { ClickHouseSessionRepository } from '@funnel/session-engine';

import { createSessionConsumer } from './consumer';
import { CloudflareSessionDlqProducer } from './dlq';
import { CloudflareJourneyQueueProducer } from './journey-queue';
import type { SessionQueueBatchLike, SessionWorkerEnv } from './types';

export default {
  async queue(
    batch: SessionQueueBatchLike,
    env: SessionWorkerEnv,
  ): Promise<void> {
    const consume = createSessionConsumer({
      repository: new ClickHouseSessionRepository({
        url: env.CLICKHOUSE_URL,
        username: env.CLICKHOUSE_USERNAME,
        password: env.CLICKHOUSE_PASSWORD,
        database: 'funnel_analytics',
      }),
      dlq: new CloudflareSessionDlqProducer(env.SESSIONS_DLQ),
      journeys: new CloudflareJourneyQueueProducer(env.JOURNEYS_QUEUE),
    });

    await consume(batch);
  },
};
