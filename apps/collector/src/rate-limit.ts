import type { RateLimitBinding } from './types';

export interface RateLimiter {
  allow(
    pixelKey: string,
    request: Request,
    scope?: string,
  ): Promise<boolean>;
}

async function ephemeralIpKey(request: Request): Promise<string> {
  const raw =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  );

  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export class CloudflareRateLimiter implements RateLimiter {
  constructor(private readonly binding: RateLimitBinding) {}

  async allow(
    pixelKey: string,
    request: Request,
    scope?: string,
  ): Promise<boolean> {
    const ipKey = await ephemeralIpKey(request);
    const result = await this.binding.limit({
      key: scope
        ? `${scope}:${pixelKey}:${ipKey}`
        : `${pixelKey}:${ipKey}`,
    });

    return result.success;
  }
}
