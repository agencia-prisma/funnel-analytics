import type { IdentityLinkV1 } from '@funnel/event-contracts';

import { createClickHouseWebClient } from './client';
import type { ClickHouseConfig } from './types';
import { ClickHouseWriteError } from './writer';

const MAX_IDENTITY_LINKS_PER_INSERT = 500;

function linkVersion(link: IdentityLinkV1): number {
  const value = Date.parse(link.last_seen_at);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ClickHouseWriteError(false, 'CLICKHOUSE_IDENTITY_LINK_INVALID');
  }

  return value;
}

async function insertToken(links: IdentityLinkV1[]): Promise<string> {
  const input = links
    .map(
      (link) =>
        `${link.workspace_id}:${link.visitor_id}:${link.person_id}:${linkVersion(link)}`,
    )
    .sort()
    .join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export interface IdentityLinkWriter {
  insertLinks(links: IdentityLinkV1[]): Promise<void>;
}

export class ClickHouseIdentityLinkWriter implements IdentityLinkWriter {
  private readonly client: ReturnType<typeof createClickHouseWebClient>;

  constructor(config: ClickHouseConfig) {
    this.client = createClickHouseWebClient(
      {
        ...config,
        database: config.database ?? 'funnel_analytics',
      },
      10_000,
    );
  }

  async insertLinks(links: IdentityLinkV1[]): Promise<void> {
    if (!links.length) {
      return;
    }

    if (links.length > MAX_IDENTITY_LINKS_PER_INSERT) {
      throw new ClickHouseWriteError(
        false,
        'CLICKHOUSE_IDENTITY_BATCH_TOO_LARGE',
      );
    }

    try {
      await this.client.insert({
        table: 'funnel_analytics.identity_links',
        values: links.map((link) => ({
          workspace_id: link.workspace_id,
          person_id: link.person_id,
          visitor_id: link.visitor_id,
          pixel_id: link.pixel_id,
          source: link.source,
          confidence: link.confidence,
          linked_at: link.linked_at,
          last_seen_at: link.last_seen_at,
          link_version: linkVersion(link),
        })),
        format: 'JSONEachRow',
        clickhouse_settings: {
          insert_deduplication_token: await insertToken(links),
          wait_for_async_insert: 1,
        },
      });
    } catch (error) {
      if (error instanceof ClickHouseWriteError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
          message,
        );

      throw new ClickHouseWriteError(
        !permanent,
        'CLICKHOUSE_IDENTITY_LINK_FAILED',
      );
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
