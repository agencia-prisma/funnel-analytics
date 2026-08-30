export type PixelStatus = 'active' | 'paused' | 'archived';
export type PixelHealthStatus = 'pending' | 'healthy' | 'warning' | 'critical';
export type PixelDomainStatus = 'pending' | 'active' | 'blocked';

export interface PixelDomainRecord {
  id: string;
  domain: string;
  wildcard: boolean;
  status: PixelDomainStatus;
  verified_at?: string | null;
  last_seen_at?: string | null;
}

export interface PixelRecord {
  id: string;
  workspace_id: string;
  public_key: string;
  status: PixelStatus;
  health_status: PixelHealthStatus;
  domains: PixelDomainRecord[];
}

export interface PixelRegistry {
  resolvePixel(publicKey: string): Promise<PixelRecord | null>;
  touchAccepted(
    pixel: PixelRecord,
    domain: PixelDomainRecord,
    acceptedAt: string,
  ): Promise<void>;
}

interface LocalRegistryPayload {
  pixels?: PixelRecord[];
}

export class LocalPixelRegistry implements PixelRegistry {
  private readonly pixels: PixelRecord[];

  constructor(rawJson: string) {
    let parsed: LocalRegistryPayload;

    try {
      parsed = JSON.parse(rawJson) as LocalRegistryPayload;
    } catch {
      parsed = {};
    }

    this.pixels = Array.isArray(parsed.pixels) ? parsed.pixels : [];
  }

  async resolvePixel(publicKey: string): Promise<PixelRecord | null> {
    return this.pixels.find((pixel) => pixel.public_key === publicKey) ?? null;
  }

  async touchAccepted(
    _pixel: PixelRecord,
    _domain: PixelDomainRecord,
    _acceptedAt: string,
  ): Promise<void> {
    // Local registry is deterministic and intentionally non-persistent.
  }
}
