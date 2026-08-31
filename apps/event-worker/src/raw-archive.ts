import type { CollectorEnvelopeV1 } from '@funnel/event-contracts';

import { PipelineError } from './errors';
import { validateCollectorEnvelope } from './envelope';
import type { R2BucketLike } from './types';

export interface RawArchiveResult {
  key: string;
  bytes: number;
}

export interface RawArchive {
  archive(envelope: CollectorEnvelopeV1): Promise<RawArchiveResult>;
  read(key: string): Promise<CollectorEnvelopeV1 | null>;
}

function safeId(value: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
  }
  return value.toLowerCase();
}

export function rawArchiveKey(envelope: CollectorEnvelopeV1): string {
  const date = new Date(envelope.received_at);

  if (!Number.isFinite(date.getTime())) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
  }

  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');

  return [
    'events/v1',
    `year=${year}`,
    `month=${month}`,
    `day=${day}`,
    `hour=${hour}`,
    `workspace=${safeId(envelope.workspace_id)}`,
    `pixel=${safeId(envelope.pixel_id)}`,
    `${safeId(envelope.request_id)}.json`,
  ].join('/');
}

export class R2RawArchive implements RawArchive {
  constructor(private readonly bucket: R2BucketLike) {}

  async archive(envelope: CollectorEnvelopeV1): Promise<RawArchiveResult> {
    const key = rawArchiveKey(envelope);
    const body = JSON.stringify(envelope);

    try {
      await this.bucket.put(key, body, {
        httpMetadata: {
          contentType: 'application/json',
        },
      });
    } catch {
      throw new PipelineError('TRANSIENT', 'RAW_ARCHIVE_FAILED');
    }

    return {
      key,
      bytes: new TextEncoder().encode(body).byteLength,
    };
  }

  async read(key: string): Promise<CollectorEnvelopeV1 | null> {
    const object = await this.bucket.get(key);

    if (!object) {
      return null;
    }

    return validateCollectorEnvelope(JSON.parse(await object.text()));
  }
}
