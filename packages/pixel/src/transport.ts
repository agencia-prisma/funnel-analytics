import type { EventBatchV1 } from '@funnel/event-contracts';

export interface TransportSendOptions {
  unload?: boolean;
}

export interface TransportResult {
  ok: boolean;
  retryable: boolean;
  status?: number;
}

export interface Transport {
  send(
    batch: EventBatchV1,
    options?: TransportSendOptions,
  ): Promise<TransportResult>;
}

export function isRetryableCollectorStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export class HttpTransport implements Transport {
  constructor(
    private readonly endpoint: string,
    private readonly fetchRef: typeof fetch = fetch,
    private readonly navigatorRef: Navigator = navigator,
  ) {}

  async send(
    batch: EventBatchV1,
    options: TransportSendOptions = {},
  ): Promise<TransportResult> {
    const body = JSON.stringify(batch);

    if (options.unload && typeof this.navigatorRef.sendBeacon === 'function') {
      try {
        const sent = this.navigatorRef.sendBeacon(
          this.endpoint,
          new Blob([body], { type: 'application/json' }),
        );

        if (sent) {
          return { ok: true, retryable: false };
        }
      } catch {
        // Fall through to fetch keepalive.
      }
    }

    try {
      const response = await this.fetchRef(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body,
        credentials: 'omit',
        keepalive: Boolean(options.unload),
        mode: 'cors',
      });

      if (response.ok) {
        return {
          ok: true,
          retryable: false,
          status: response.status,
        };
      }

      return {
        ok: false,
        retryable: isRetryableCollectorStatus(response.status),
        status: response.status,
      };
    } catch {
      return { ok: false, retryable: true };
    }
  }
}

export class TestTransport implements Transport {
  readonly batches: EventBatchV1[] = [];

  constructor(private readonly sink?: (batch: EventBatchV1) => void) {}

  async send(batch: EventBatchV1): Promise<TransportResult> {
    const copy = JSON.parse(JSON.stringify(batch)) as EventBatchV1;
    this.batches.push(copy);
    this.sink?.(copy);

    return { ok: true, retryable: false };
  }
}
