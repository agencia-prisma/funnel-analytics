import { createRouter } from './router';
import type {
  CollectorEnv,
  ExecutionContextLike,
  QueueBatchLike,
} from './types';

export default {
  async fetch(
    request: Request,
    env: CollectorEnv,
    ctx: ExecutionContextLike,
  ): Promise<Response> {
    return createRouter(env)(request, ctx);
  },

  async queue(batch: QueueBatchLike, env: CollectorEnv): Promise<void> {
    if (env.COLLECTOR_ENV !== 'local') {
      return;
    }

    for (const message of batch.messages) {
      message.ack();
    }
  },
};
