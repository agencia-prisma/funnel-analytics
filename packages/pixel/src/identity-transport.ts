import type { BrowserIdentifyRequestV1 } from '@funnel/event-contracts';

import { isRetryableCollectorStatus } from './transport';

export interface IdentityTransportResult {
  ok: boolean;
  status?: number;
}

export class IdentityHttpTransport {
  constructor(
    private readonly endpoint: string,
    private readonly maxRetries: number,
    private readonly fetchRef: typeof fetch = fetch,
  ) {}

  async send(
    payload: BrowserIdentifyRequestV1,
  ): Promise<IdentityTransportResult> {
    const body = JSON.stringify(payload);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchRef(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body,
          credentials: 'omit',
          mode: 'cors',
        });

        if (response.ok) {
          return { ok: true, status: response.status };
        }

        if (
          !isRetryableCollectorStatus(response.status) ||
          attempt >= this.maxRetries
        ) {
          return { ok: false, status: response.status };
        }
      } catch {
        if (attempt >= this.maxRetries) {
          return { ok: false };
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1_000, 100 * 2 ** attempt)),
      );
    }

    return { ok: false };
  }
}
