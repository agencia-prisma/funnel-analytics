import { createAttributionConsumer } from './consumer';
import { CloudflareAttributionDlqProducer } from './dlq';
import { ClickHouseAttributionFactsRepository } from './repository';
import type { AttributionQueueBatchLike, AttributionWorkerEnv } from './types';

export default {
  async queue(
    batch: AttributionQueueBatchLike,
    env: AttributionWorkerEnv,
  ): Promise<void> {
    const repository = new ClickHouseAttributionFactsRepository({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USERNAME,
      password: env.CLICKHOUSE_PASSWORD,
      database: 'funnel_analytics',
    });
    const consume = createAttributionConsumer({
      repository,
      dlq: new CloudflareAttributionDlqProducer(env.ATTRIBUTION_DLQ),
    });
    await consume(batch);
  },
};
