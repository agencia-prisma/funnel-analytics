import type {
  CollectorEnvelopeV1,
  IdentityEnvelopeV1,
} from '@funnel/event-contracts';
import { ClickHouseSessionRepository } from '../../packages/session-engine/src/index';

import { createRouter } from '../../apps/collector/src/router';
import type {
  CollectorEnv,
  ExecutionContextLike,
} from '../../apps/collector/src/types';
import { clickHouseWriterFromEnv } from '../../apps/event-worker/src/clickhouse-writer';
import { createEventConsumer } from '../../apps/event-worker/src/consumer';
import { CloudflareDlqProducer } from '../../apps/event-worker/src/dlq';
import { R2RawArchive } from '../../apps/event-worker/src/raw-archive';
import { CloudflareSessionRecomputeProducer } from '../../apps/event-worker/src/session-recompute';
import type {
  EventWorkerEnv,
  QueueBatchLike,
} from '../../apps/event-worker/src/types';
import { SupabaseIdentityRepository } from '../../apps/identity-worker/src/control-plane';
import { createIdentityConsumer } from '../../apps/identity-worker/src/consumer';
import { CloudflareIdentityDlqProducer } from '../../apps/identity-worker/src/dlq';
import { identityLinkWriterFromEnv } from '../../apps/identity-worker/src/link-writer';
import type {
  IdentityQueueBatchLike,
  IdentityWorkerEnv,
} from '../../apps/identity-worker/src/types';
import { createSessionConsumer } from '../../apps/session-worker/src/consumer';
import { CloudflareSessionDlqProducer } from '../../apps/session-worker/src/dlq';
import type {
  SessionQueueBatchLike,
  SessionWorkerEnv,
} from '../../apps/session-worker/src/types';

type TestR2Bucket = EventWorkerEnv['EVENTS_RAW_BUCKET'] & {
  list(options?: {
    prefix?: string;
  }): Promise<{ objects: Array<{ key: string }> }>;
};

interface IdentityHarnessEnv
  extends CollectorEnv,
    EventWorkerEnv,
    SessionWorkerEnv,
    IdentityWorkerEnv {
  EVENTS_RAW_BUCKET: TestR2Bucket;
}

let lastIdentityEnvelope: IdentityEnvelopeV1 | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function isIdentityBatch(batch: QueueBatchLike): boolean {
  const body = batch.messages[0]?.body;

  return (
    typeof body === 'object' &&
    body !== null &&
    'encrypted_identifiers' in body
  );
}

function isSessionBatch(batch: QueueBatchLike): boolean {
  const body = batch.messages[0]?.body;

  return typeof body === 'object' && body !== null && 'session_ids' in body;
}

export default {
  async fetch(
    request: Request,
    env: IdentityHarnessEnv,
    ctx: ExecutionContextLike,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__test/identity-envelope') {
      return json(lastIdentityEnvelope);
    }

    if (url.pathname === '/__test/raw-contents') {
      const result = await env.EVENTS_RAW_BUCKET.list({
        prefix: 'events/v1/',
      });
      const contents: string[] = [];

      for (const object of result.objects) {
        const stored = await env.EVENTS_RAW_BUCKET.get(object.key);

        if (stored) {
          contents.push(await stored.text());
        }
      }

      return json({ count: contents.length, contents });
    }

    const routerEnv: IdentityHarnessEnv = {
      ...env,
      IDENTITY_QUEUE: {
        async send(envelope) {
          lastIdentityEnvelope = envelope;
          await env.IDENTITY_QUEUE.send(envelope);
        },
      },
    };

    return createRouter(routerEnv)(request, ctx);
  },

  async queue(batch: QueueBatchLike, env: IdentityHarnessEnv): Promise<void> {
    if (isIdentityBatch(batch)) {
      const consumeIdentity = createIdentityConsumer({
        repository: new SupabaseIdentityRepository(
          env.SUPABASE_URL,
          env.SUPABASE_SECRET_KEY,
        ),
        writer: identityLinkWriterFromEnv(env),
        dlq: new CloudflareIdentityDlqProducer(env.IDENTITY_DLQ),
      });

      await consumeIdentity(batch as IdentityQueueBatchLike);
      return;
    }

    if (isSessionBatch(batch)) {
      const consumeSessions = createSessionConsumer({
        repository: new ClickHouseSessionRepository({
          url: env.CLICKHOUSE_URL,
          username: env.CLICKHOUSE_USERNAME,
          password: env.CLICKHOUSE_PASSWORD,
          database: 'funnel_analytics',
        }),
        dlq: new CloudflareSessionDlqProducer(env.SESSIONS_DLQ),
      });

      await consumeSessions(batch as SessionQueueBatchLike);
      return;
    }

    const consumeEvents = createEventConsumer({
      rawArchive: new R2RawArchive(env.EVENTS_RAW_BUCKET),
      writer: clickHouseWriterFromEnv(env),
      dlq: new CloudflareDlqProducer(env.EVENTS_DLQ),
      sessions: new CloudflareSessionRecomputeProducer(env.SESSIONS_QUEUE),
    });

    await consumeEvents(batch);
  },
};
