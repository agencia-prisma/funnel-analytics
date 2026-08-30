import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const WARNING_GZIP_BYTES = 12 * 1024;
const FAIL_GZIP_BYTES = 20 * 1024;

const fileUrl = new URL('../dist/pixel.min.js', import.meta.url);
const content = await readFile(fileUrl);
const gzipBytes = gzipSync(content).byteLength;

console.log(
  JSON.stringify(
    {
      bundle: 'dist/pixel.min.js',
      raw_bytes: content.byteLength,
      gzip_bytes: gzipBytes,
      warning_gzip_bytes: WARNING_GZIP_BYTES,
      fail_gzip_bytes: FAIL_GZIP_BYTES,
    },
    null,
    2,
  ),
);

if (gzipBytes > FAIL_GZIP_BYTES) {
  console.error('Pixel bundle exceeds the 20 KB gzip hard limit.');
  process.exit(1);
}

if (gzipBytes > WARNING_GZIP_BYTES) {
  console.warn('Pixel bundle exceeds the 12 KB gzip warning threshold.');
}
