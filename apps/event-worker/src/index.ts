import { CloudflareDlqProducer } from './dlq';
import { clickHouseWriterFromEnv } from './clickhouse-writer';
import { createEventConsumer } from './consumer';
import { R2RawArchive } from './raw-archive';
import type { EventWorkerEnv, QueueBatchLike } from './types';

export default {
  async queue(batch: QueueBatchLike, env: EventWorkerEnv): Promise<void> {
    const consume = createEventConsumer({
      rawArchive: new R2RawArchive(env.EVENTS_RAW_BUCKET),
      writer: clickHouseWriterFromEnv(env),
      dlq: new CloudflareDlqProducer(env.EVENTS_DLQ),
    });

    await consume(batch);
  },
};
