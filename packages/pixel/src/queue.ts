import type { BrowserEventV1, EventBatchV1 } from '@funnel/event-contracts';

import {
  DEFAULT_MAX_BATCH_EVENTS,
  DEFAULT_MAX_PAYLOAD_BYTES,
  DEFAULT_MAX_QUEUE_EVENTS,
  DEFAULT_MAX_RETRIES,
} from './config';
import {
  readJson,
  STORAGE_KEYS,
  type StorageAdapter,
  writeJson,
} from './storage';
import type { Transport } from './transport';

export interface QueueOptions {
  maxBatchEvents?: number;
  maxQueueEvents?: number;
  maxPayloadBytes?: number;
  maxRetries?: number;
  storage?: StorageAdapter | null;
  persistenceAllowed?: () => boolean;
  delay?: (milliseconds: number) => Promise<void>;
  debug?: (event: string, metadata?: Record<string, unknown>) => void;
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function payloadBytes(batch: EventBatchV1): number {
  return new TextEncoder().encode(JSON.stringify(batch)).byteLength;
}

export class EventQueue {
  private events: BrowserEventV1[] = [];
  private hydrated = false;
  private inFlight: Promise<boolean> | null = null;

  private readonly maxBatchEvents: number;
  private readonly maxQueueEvents: number;
  private readonly maxPayloadBytes: number;
  private readonly maxRetries: number;
  private readonly storage: StorageAdapter | null;
  private readonly persistenceAllowed: () => boolean;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly debug: (
    event: string,
    metadata?: Record<string, unknown>,
  ) => void;

  constructor(
    private readonly transport: Transport | null,
    options: QueueOptions = {},
  ) {
    this.maxBatchEvents =
      options.maxBatchEvents ?? DEFAULT_MAX_BATCH_EVENTS;
    this.maxQueueEvents =
      options.maxQueueEvents ?? DEFAULT_MAX_QUEUE_EVENTS;
    this.maxPayloadBytes =
      options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.storage = options.storage ?? null;
    this.persistenceAllowed = options.persistenceAllowed ?? (() => false);
    this.delay = options.delay ?? defaultDelay;
    this.debug = options.debug ?? (() => undefined);
  }

  size(): number {
    this.hydrate();
    return this.events.length;
  }

  enqueue(event: BrowserEventV1): void {
    this.hydrate();
    this.events.push(event);

    if (this.events.length > this.maxQueueEvents) {
      this.events.splice(0, this.events.length - this.maxQueueEvents);
    }

    this.persist();
    this.debug('pixel.event.queued', {
      event_name: event.event_name,
      queue_size: this.events.length,
    });

    if (this.events.length >= this.maxBatchEvents) {
      void this.flush();
    }
  }

  async flush(unload = false): Promise<boolean> {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.performFlush(unload).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  clear(): void {
    this.events = [];
    this.hydrated = true;
    this.storage?.remove(STORAGE_KEYS.queue);
  }

  private hydrate(): void {
    if (this.hydrated) {
      return;
    }

    this.hydrated = true;

    if (!this.storage || !this.persistenceAllowed()) {
      return;
    }

    const stored =
      readJson<BrowserEventV1[]>(this.storage, STORAGE_KEYS.queue) ?? [];

    this.events = stored.slice(-this.maxQueueEvents);
  }

  private persist(): void {
    if (!this.storage || !this.persistenceAllowed()) {
      this.storage?.remove(STORAGE_KEYS.queue);
      return;
    }

    writeJson(this.storage, STORAGE_KEYS.queue, this.events);
  }

  private createBatch(count: number): EventBatchV1 {
    return {
      batch_version: 1,
      sent_at: new Date().toISOString(),
      events: this.events.slice(0, count),
    };
  }

  private selectBatch(): EventBatchV1 | null {
    if (!this.events.length) {
      return null;
    }

    let count = Math.min(this.maxBatchEvents, this.events.length);
    let batch = this.createBatch(count);

    while (count > 1 && payloadBytes(batch) > this.maxPayloadBytes) {
      count -= 1;
      batch = this.createBatch(count);
    }

    if (payloadBytes(batch) > this.maxPayloadBytes) {
      this.events.shift();
      this.persist();
      this.debug('pixel.event.dropped', { reason: 'payload_too_large' });
      return null;
    }

    return batch;
  }

  private async performFlush(unload: boolean): Promise<boolean> {
    this.hydrate();

    if (!this.transport || !this.events.length) {
      return false;
    }

    const batch = this.selectBatch();

    if (!batch) {
      return false;
    }

    this.debug('pixel.flush.started', {
      event_count: batch.events.length,
    });

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const result = await this.transport.send(batch, { unload });

      if (result.ok) {
        this.events.splice(0, batch.events.length);
        this.persist();
        this.debug('pixel.flush.succeeded', {
          event_count: batch.events.length,
        });
        return true;
      }

      if (!result.retryable || unload) {
        this.events.splice(0, batch.events.length);
        this.persist();
        this.debug('pixel.flush.failed', {
          retryable: result.retryable,
          status: result.status,
        });
        return false;
      }

      if (attempt < this.maxRetries) {
        const backoff = Math.min(250 * 2 ** attempt, 2_000);
        await this.delay(backoff);
      }
    }

    this.debug('pixel.flush.failed', { retryable: true });
    return false;
  }
}
