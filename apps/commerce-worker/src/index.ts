import { CloudflareAttributionRecomputeProducer } from './attribution-publisher';
import { createCommerceConsumer } from './consumer';
import { CloudflareCommerceDlqProducer } from './dlq';
import { ClickHouseCommerceFactsRepository } from './repository';
import type { CommerceQueueBatchLike, CommerceWorkerEnv } from './types';

export default {
  async queue(
    batch: CommerceQueueBatchLike,
    env: CommerceWorkerEnv,
  ): Promise<void> {
    const repository = new ClickHouseCommerceFactsRepository({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USERNAME,
      password: env.CLICKHOUSE_PASSWORD,
      database: 'funnel_analytics',
    });
    const consume = createCommerceConsumer({
      repository,
      dlq: new CloudflareCommerceDlqProducer(env.COMMERCE_DLQ),
      attributionPublisher: new CloudflareAttributionRecomputeProducer(
        env.ATTRIBUTION_QUEUE,
      ),
    });
    await consume(batch);
  },
};
