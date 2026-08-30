import { describe, expect, it } from 'vitest';

import {
  buildPixelInstallSnippet,
  PIXEL_SCRIPT_PLACEHOLDER_URL,
} from './snippet';

describe('pixel install snippet', () => {
  it('embeds the public key and explicit placeholder CDN URL', () => {
    const snippet = buildPixelInstallSnippet(
      'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(snippet).toContain(PIXEL_SCRIPT_PLACEHOLDER_URL);
    expect(snippet).toContain(
      'data-pixel-id="px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    );
  });
});
