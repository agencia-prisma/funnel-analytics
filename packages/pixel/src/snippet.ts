import { PRODUCTION_COLLECTOR_ORIGIN, SDK_VERSION } from './config';

export const PIXEL_SCRIPT_URL = `${PRODUCTION_COLLECTOR_ORIGIN}/pixel.js`;
export const VERSIONED_PIXEL_SCRIPT_URL = `${PRODUCTION_COLLECTOR_ORIGIN}/pixel.v${SDK_VERSION}.js`;

export function buildPixelInstallSnippet(
  publicKey: string,
  scriptUrl: string = PIXEL_SCRIPT_URL,
): string {
  return [
    '<script',
    '  async',
    `  src="${scriptUrl}"`,
    `  data-pixel-id="${publicKey}">`,
    '</script>',
  ].join('\n');
}
