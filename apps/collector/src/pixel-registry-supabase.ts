import {
  type PixelDomainRecord,
  type PixelRecord,
  type PixelRegistry,
} from './pixel-registry';
import type { CollectorErrorCode } from './errors';

const DEFAULT_TIMEOUT_MS = 2_500;

export type ControlPlaneErrorCode = Extract<
  CollectorErrorCode,
  | 'CONTROL_PLANE_CONFIG_MISSING'
  | 'CONTROL_PLANE_URL_INVALID'
  | 'CONTROL_PLANE_TIMEOUT'
  | 'CONTROL_PLANE_NETWORK_ERROR'
  | 'CONTROL_PLANE_UNAUTHORIZED'
  | 'CONTROL_PLANE_RESPONSE_INVALID'
  | 'CONTROL_PLANE_UNAVAILABLE'
>;

export class ControlPlaneError extends Error {
  constructor(readonly code: ControlPlaneErrorCode) {
    super(code);
    this.name = 'ControlPlaneError';
  }
}

interface SupabasePixelRow {
  id: string;
  workspace_id: string;
  public_key: string;
  status: PixelRecord['status'];
  health_status: PixelRecord['health_status'];
  pixel_domains?: PixelDomainRecord[];
}

export class SupabasePixelRegistry implements PixelRegistry {
  constructor(
    private readonly supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetchRef?: typeof fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async resolvePixel(publicKey: string): Promise<PixelRecord | null> {
    const url = this.controlPlaneUrl('/rest/v1/pixels');
    url.searchParams.set('public_key', `eq.${publicKey}`);
    url.searchParams.set(
      'select',
      'id,workspace_id,public_key,status,health_status,pixel_domains(id,domain,wildcard,status,verified_at,last_seen_at)',
    );
    url.searchParams.set('limit', '1');

    const response = await this.request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    let rows: unknown;

    try {
      rows = await response.json();
    } catch {
      throw new ControlPlaneError('CONTROL_PLANE_RESPONSE_INVALID');
    }

    if (!Array.isArray(rows)) {
      throw new ControlPlaneError('CONTROL_PLANE_RESPONSE_INVALID');
    }

    const row = rows[0] as SupabasePixelRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      workspace_id: row.workspace_id,
      public_key: row.public_key,
      status: row.status,
      health_status: row.health_status,
      domains: Array.isArray(row.pixel_domains) ? row.pixel_domains : [],
    };
  }

  async touchAccepted(
    pixel: PixelRecord,
    domain: PixelDomainRecord,
    acceptedAt: string,
  ): Promise<void> {
    const pixelUrl = this.controlPlaneUrl('/rest/v1/pixels');
    pixelUrl.searchParams.set('id', `eq.${pixel.id}`);

    const pixelPatch: Record<string, string> = {
      last_event_at: acceptedAt,
    };

    if (pixel.health_status === 'pending') {
      pixelPatch.health_status = 'healthy';
    }

    const domainUrl = this.controlPlaneUrl('/rest/v1/pixel_domains');
    domainUrl.searchParams.set('id', `eq.${domain.id}`);

    const domainPatch: Record<string, string> = {
      last_seen_at: acceptedAt,
    };

    if (domain.status === 'pending') {
      domainPatch.status = 'active';
      domainPatch.verified_at = acceptedAt;
    }

    await Promise.all([
      this.request(pixelUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(pixelPatch),
      }),
      this.request(domainUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(domainPatch),
      }),
    ]);
  }

  private controlPlaneUrl(path: string): URL {
    const supabaseUrl = this.supabaseUrl?.trim();
    const secretKey = this.secretKey?.trim();

    if (!supabaseUrl || !secretKey) {
      throw new ControlPlaneError('CONTROL_PLANE_CONFIG_MISSING');
    }

    try {
      const baseUrl = new URL(supabaseUrl);

      if (!['http:', 'https:'].includes(baseUrl.protocol)) {
        throw new TypeError('Unsupported Supabase URL protocol');
      }

      return new URL(path, baseUrl);
    } catch {
      throw new ControlPlaneError('CONTROL_PLANE_URL_INVALID');
    }
  }

  private async request(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      const secretKey = this.secretKey.trim();
      headers.set('apikey', secretKey);
      headers.set('authorization', `Bearer ${secretKey}`);

      const requestInit: RequestInit = {
        ...init,
        headers,
        signal: controller.signal,
      };

      // In Cloudflare Workers, storing the native global fetch on an instance and
      // invoking it as `this.fetchRef(...)` may bind the repository as receiver
      // and fail with `Illegal invocation` before any outbound HTTP request.
      // Production therefore calls Worker-global fetch directly. Tests can inject
      // a fetch implementation without changing the production call path.
      const fetchRef = this.fetchRef;
      const response = fetchRef
        ? await fetchRef(url.toString(), requestInit)
        : await fetch(url.toString(), requestInit);

      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          throw new ControlPlaneError('CONTROL_PLANE_UNAUTHORIZED');
        }

        if ([408, 504].includes(response.status)) {
          throw new ControlPlaneError('CONTROL_PLANE_TIMEOUT');
        }

        if (response.status === 429 || response.status >= 500) {
          throw new ControlPlaneError('CONTROL_PLANE_UNAVAILABLE');
        }

        throw new ControlPlaneError('CONTROL_PLANE_RESPONSE_INVALID');
      }

      return response;
    } catch (error) {
      if (error instanceof ControlPlaneError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new ControlPlaneError('CONTROL_PLANE_TIMEOUT');
      }

      throw new ControlPlaneError('CONTROL_PLANE_NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }
}
