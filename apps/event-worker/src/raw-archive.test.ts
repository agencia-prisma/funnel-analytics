import { describe, expect, it } from 'vitest';

import { normalizeEnvelope } from './normalization';
import { R2RawArchive, rawArchiveKey } from './raw-archive';
import { envelope } from './test-fixtures';
import type { R2BucketLike } from './types';

class MemoryBucket implements R2BucketLike {
  readonly objects = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async get(key: string) {
    const value = this.objects.get(key);
    return value
      ? {
          async text() {
            return value;
          },
        }
      : null;
  }
}

describe('R2 raw archive', () => {
  it('uses a deterministic partitioned key with no page URL or PII', () => {
    const key = rawArchiveKey(envelope());

    expect(key).toBe(
      'events/v1/year=2026/month=08/day=30/hour=04/workspace=21000000-0000-0000-0000-000000000001/pixel=31000000-0000-0000-0000-000000000001/550e8400-e29b-41d4-a716-446655440000.json',
    );
    expect(key).not.toContain('example.com');
  });

  it('is idempotent for retries of the same request_id', async () => {
    const bucket = new MemoryBucket();
    const archive = new R2RawArchive(bucket);
    const input = envelope();

    const first = await archive.archive(input);
    const second = await archive.archive(input);

    expect(second.key).toBe(first.key);
    expect(bucket.objects.size).toBe(1);
  });

  it('supports deterministic replay through the same normalizer', async () => {
    const bucket = new MemoryBucket();
    const archive = new R2RawArchive(bucket);
    const input = envelope();
    const { key } = await archive.archive(input);

    const replayed = await archive.read(key);

    expect(replayed).not.toBeNull();
    expect(normalizeEnvelope(replayed!)).toEqual(normalizeEnvelope(input));
  });
});
