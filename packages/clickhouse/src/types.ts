import type { NormalizedEventV1 } from '@funnel/event-contracts';

export interface ClickHouseConfig {
  url: string;
  username: string;
  password: string;
  database?: string;
}

export interface ClickHouseInsertResult {
  eventCount: number;
  dedupToken: string;
}

export interface ClickHouseWriter {
  insertEvents(
    events: NormalizedEventV1[],
    dedupToken?: string,
  ): Promise<ClickHouseInsertResult>;
}
