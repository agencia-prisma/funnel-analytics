import { EVENT_BATCH_V1_MAX_BODY_BYTES } from '@funnel/event-contracts';

import { CollectorError } from './errors';

export async function readJsonBody(
  request: Request,
  maxBytes = EVENT_BATCH_V1_MAX_BODY_BYTES,
): Promise<unknown> {
  const contentLength = request.headers.get('content-length');

  if (contentLength) {
    const parsed = Number(contentLength);

    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new CollectorError(413, 'PAYLOAD_TOO_LARGE');
    }
  }

  if (!request.body) {
    throw new CollectorError(400, 'INVALID_REQUEST');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      await reader.cancel();
      throw new CollectorError(413, 'PAYLOAD_TOO_LARGE');
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new CollectorError(400, 'INVALID_REQUEST');
  }

  return parsed;
}

export function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (!contentType.startsWith('application/json')) {
    throw new CollectorError(400, 'INVALID_REQUEST');
  }
}
