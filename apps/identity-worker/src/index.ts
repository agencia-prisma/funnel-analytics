import { CloudflareIdentityDlqProducer } from './dlq';
import { SupabaseIdentityRepository } from './control-plane';
import { createIdentityConsumer } from './consumer';
import { identityLinkWriterFromEnv } from './link-writer';
import { CloudflareJourneyQueueProducer } from './journey-queue';
import type { IdentityQueueBatchLike, IdentityWorkerEnv } from './types';

export default {
  async queue(
    batch: IdentityQueueBatchLike,
    env: IdentityWorkerEnv,
  ): Promise<void> {
    const consume = createIdentityConsumer({
      repository: new SupabaseIdentityRepository(
        env.SUPABASE_URL,
        env.SUPABASE_SECRET_KEY,
      ),
      writer: identityLinkWriterFromEnv(env),
      dlq: new CloudflareIdentityDlqProducer(env.IDENTITY_DLQ),
      journeys: new CloudflareJourneyQueueProducer(env.JOURNEYS_QUEUE),
    });

    await consume(batch);
  },
};
