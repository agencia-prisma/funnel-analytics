import { describe, expect, it } from 'vitest';

import { CollectorError } from './errors';
import { readJsonBody, requireJsonContentType } from './request';

describe('collector request limits', () => {
  it('parses valid JSON', async () => {
    const request = new Request('https://collector.test/v1/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody(request)).resolves.toEqual({ ok: true });
  });

  it('rejects invalid JSON', async () => {
    const request = new Request('https://collector.test/v1/events', {
      method: 'POST',
      body: '{',
    });

    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('rejects body larger than 128 KB', async () => {
    const request = new Request('https://collector.test/v1/events', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(129 * 1024) }),
    });

    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('requires application/json', () => {
    const request = new Request('https://collector.test/v1/events', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    });

    expect(() => requireJsonContentType(request)).toThrow(CollectorError);
  });
});
