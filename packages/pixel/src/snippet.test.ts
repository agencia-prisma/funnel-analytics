import { describe, expect, it } from 'vitest';

import { buildPixelInstallSnippet, PIXEL_SCRIPT_URL } from './snippet';

describe('pixel install snippet', () => {
  it('embeds the production script URL and the Pixel public key', () => {
    const snippet = buildPixelInstallSnippet(
      'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(snippet).toContain(PIXEL_SCRIPT_URL);
    expect(snippet).toContain(
      'data-pixel-id="px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    );
    expect(snippet).not.toContain('DOMINIO-FUTURO');
  });
});
