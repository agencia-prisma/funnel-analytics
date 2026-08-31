import type { CollectorEnvelopeV1 } from '@funnel/event-contracts';

import { createRouter } from '../../apps/collector/src/router';
import type {
  CollectorEnv,
  ExecutionContextLike,
} from '../../apps/collector/src/types';
import { clickHouseWriterFromEnv } from '../../apps/event-worker/src/clickhouse-writer';
import { createEventConsumer } from '../../apps/event-worker/src/consumer';
import { CloudflareDlqProducer } from '../../apps/event-worker/src/dlq';
import { R2RawArchive } from '../../apps/event-worker/src/raw-archive';
import type {
  EventWorkerEnv,
  QueueBatchLike,
} from '../../apps/event-worker/src/types';

type TestR2Bucket = EventWorkerEnv['EVENTS_RAW_BUCKET'] & {
  list(options?: {
    prefix?: string;
  }): Promise<{ objects: Array<{ key: string }> }>;
};

interface PipelineEnv extends CollectorEnv, EventWorkerEnv {
  EVENTS_RAW_BUCKET: TestR2Bucket;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: PipelineEnv,
    ctx: ExecutionContextLike,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__test/raw-list') {
      const result = await env.EVENTS_RAW_BUCKET.list({
        prefix: 'events/v1/',
      });
      return json({
        count: result.objects.length,
        keys: result.objects.map((object) => object.key),
      });
    }

    if (url.pathname === '/__test/duplicate' && request.method === 'POST') {
      const envelope = (await request.json()) as CollectorEnvelopeV1;
      await env.EVENTS_QUEUE.send(envelope);
      await env.EVENTS_QUEUE.send(envelope);

      return json({ accepted: true, copies: 2 }, 202);
    }

    return createRouter(env)(request, ctx);
  },

  async queue(batch: QueueBatchLike, env: PipelineEnv): Promise<void> {
    const consume = createEventConsumer({
      rawArchive: new R2RawArchive(env.EVENTS_RAW_BUCKET),
      writer: clickHouseWriterFromEnv(env),
      dlq: new CloudflareDlqProducer(env.EVENTS_DLQ),
    });

    await consume(batch);
  },
};
