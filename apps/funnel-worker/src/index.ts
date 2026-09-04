import { createFunnelConsumer } from './consumer';
import { SupabaseFunnelControlPlane } from './control-plane';
import { CloudflareFunnelDlqProducer } from './dlq';
import { ClickHouseFunnelFactsRepository } from './repository';
import type { FunnelQueueBatchLike, FunnelWorkerEnv } from './types';

export default {
  async queue(
    batch: FunnelQueueBatchLike,
    env: FunnelWorkerEnv,
  ): Promise<void> {
    const repository = new ClickHouseFunnelFactsRepository({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USERNAME,
      password: env.CLICKHOUSE_PASSWORD,
      database: 'funnel_analytics',
    });

    const consume = createFunnelConsumer({
      controlPlane: new SupabaseFunnelControlPlane(
        env.SUPABASE_URL,
        env.SUPABASE_SECRET_KEY,
      ),
      repository,
      dlq: new CloudflareFunnelDlqProducer(env.FUNNELS_DLQ),
    });

    await consume(batch);
  },
};
