import {
  JOURNEY_DEFAULT_INACTIVITY_WINDOW_SECONDS,
  type JourneyPolicyV1,
} from '@funnel/journey-engine';

import { createJourneyConsumer } from './consumer';
import { CloudflareJourneyDlqProducer } from './dlq';
import { ClickHouseJourneyRepository } from './repository';
import type { JourneyQueueBatchLike, JourneyWorkerEnv } from './types';

function policyFromEnv(env: JourneyWorkerEnv): JourneyPolicyV1 {
  const configured = env.JOURNEY_INACTIVITY_WINDOW_SECONDS;
  const inactivityWindow = configured
    ? Number(configured)
    : JOURNEY_DEFAULT_INACTIVITY_WINDOW_SECONDS;

  return {
    version: 1,
    inactivity_window_seconds: inactivityWindow,
  };
}

export default {
  async queue(
    batch: JourneyQueueBatchLike,
    env: JourneyWorkerEnv,
  ): Promise<void> {
    const repository = new ClickHouseJourneyRepository({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USERNAME,
      password: env.CLICKHOUSE_PASSWORD,
      database: 'funnel_analytics',
    });

    const consume = createJourneyConsumer({
      repository,
      dlq: new CloudflareJourneyDlqProducer(env.JOURNEYS_DLQ),
      policy: policyFromEnv(env),
    });

    await consume(batch);
  },
};
