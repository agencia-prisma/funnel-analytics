import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });

const shared = {
  entryPoints: [new URL('../src/browser-entry.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
};

await build({
  ...shared,
  minify: false,
  outfile: new URL('../dist/pixel.js', import.meta.url).pathname,
});

await build({
  ...shared,
  minify: true,
  outfile: new URL('../dist/pixel.min.js', import.meta.url).pathname,
});
