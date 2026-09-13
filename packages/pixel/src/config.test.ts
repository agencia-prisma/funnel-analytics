import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVENT_ENDPOINT,
  DEFAULT_IDENTITY_ENDPOINT,
  readPixelConfig,
} from './config';

function script(dataset: Record<string, string>): HTMLScriptElement {
  return { dataset } as unknown as HTMLScriptElement;
}

describe('production Pixel configuration', () => {
  it('uses the production Collector when no endpoint override is provided', () => {
    const config = readPixelConfig(
      script({ pixelId: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    );

    expect(config).toMatchObject({
      endpoint: DEFAULT_EVENT_ENDPOINT,
      identityEndpoint: DEFAULT_IDENTITY_ENDPOINT,
      testMode: false,
      testTransport: false,
    });
  });

  it('keeps test_mode separate from the in-browser test transport', () => {
    const config = readPixelConfig(
      script({
        pixelId: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        testMode: 'true',
      }),
    );

    expect(config).toMatchObject({
      endpoint: DEFAULT_EVENT_ENDPOINT,
      testMode: true,
      testTransport: false,
    });
  });
});
