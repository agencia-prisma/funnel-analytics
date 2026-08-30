export const PIXEL_SCRIPT_PLACEHOLDER_URL =
  'https://cdn.DOMINIO-FUTURO.com/pixel.js';

export function buildPixelInstallSnippet(
  publicKey: string,
  scriptUrl: string = PIXEL_SCRIPT_PLACEHOLDER_URL,
): string {
  return [
    '<script',
    '  async',
    `  src="${scriptUrl}"`,
    `  data-pixel-id="${publicKey}">`,
    '</script>',
  ].join('\n');
}
