import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const url = process.env.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123';
const username = process.env.CLICKHOUSE_USERNAME ?? 'default';
const password = process.env.CLICKHOUSE_PASSWORD ?? '';

const migrationsDir = fileURLToPath(
  new URL('../../../infra/clickhouse/migrations/', import.meta.url),
);

const files = (await readdir(migrationsDir))
  .filter((file) => /^\d+.*\.sql$/.test(file))
  .sort();

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  const endpoint = new URL(url);
  endpoint.searchParams.set('multiquery', '1');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: sql,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Migration ${file} failed: ${response.status} ${body}`);
  }

  console.log(`Applied ClickHouse migration: ${file}`);
}
