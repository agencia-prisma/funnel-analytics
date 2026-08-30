import {
  type PixelDomainRecord,
  type PixelRecord,
  type PixelRegistry,
} from './pixel-registry';

const DEFAULT_TIMEOUT_MS = 2_500;

export class ControlPlaneUnavailableError extends Error {
  constructor() {
    super('CONTROL_PLANE_UNAVAILABLE');
    this.name = 'ControlPlaneUnavailableError';
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
    private readonly fetchRef: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async resolvePixel(publicKey: string): Promise<PixelRecord | null> {
    if (!this.supabaseUrl || !this.secretKey) {
      throw new ControlPlaneUnavailableError();
    }

    const url = new URL('/rest/v1/pixels', this.supabaseUrl);
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

    let rows: SupabasePixelRow[];

    try {
      rows = (await response.json()) as SupabasePixelRow[];
    } catch {
      throw new ControlPlaneUnavailableError();
    }

    const row = rows[0];

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
    const pixelUrl = new URL('/rest/v1/pixels', this.supabaseUrl);
    pixelUrl.searchParams.set('id', `eq.${pixel.id}`);

    const pixelPatch: Record<string, string> = {
      last_event_at: acceptedAt,
    };

    if (pixel.health_status === 'pending') {
      pixelPatch.health_status = 'healthy';
    }

    const domainUrl = new URL('/rest/v1/pixel_domains', this.supabaseUrl);
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

  private async request(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('apikey', this.secretKey);

      const response = await this.fetchRef(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ControlPlaneUnavailableError();
      }

      return response;
    } catch (error) {
      if (error instanceof ControlPlaneUnavailableError) {
        throw error;
      }

      throw new ControlPlaneUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
