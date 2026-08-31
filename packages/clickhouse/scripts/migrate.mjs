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

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      current += char;
      if (char === '\n') {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (!quote && char === '-' && next === '-') {
      current += char + next;
      index += 1;
      lineComment = true;
      continue;
    }

    if (!quote && char === '/' && next === '*') {
      current += char + next;
      index += 1;
      blockComment = true;
      continue;
    }

    if (quote) {
      current += char;

      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }

      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

async function executeStatement(statement, file, statementNumber) {
  const endpoint = new URL(url);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: statement,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Migration ${file} statement ${statementNumber} failed: ${response.status} ${body}`,
    );
  }
}

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  const statements = splitSqlStatements(sql);

  for (const [index, statement] of statements.entries()) {
    await executeStatement(statement, file, index + 1);
  }

  console.log(
    `Applied ClickHouse migration: ${file} (${statements.length} statements)`,
  );
}
