import { domainMatchesAuthorizedPattern } from '@funnel/pixel/domains';

import { CollectorError } from './errors';
import type {
  PixelDomainRecord,
  PixelRecord,
  PixelRegistry,
} from './pixel-registry';
import { ControlPlaneError } from './pixel-registry-supabase';

function findAuthorizedDomain(
  pixel: PixelRecord,
  originHost: string,
): PixelDomainRecord | null {
  for (const domain of pixel.domains) {
    if (domain.status === 'blocked') {
      continue;
    }

    if (
      domainMatchesAuthorizedPattern(originHost, {
        domain: domain.domain,
        wildcard: domain.wildcard,
      })
    ) {
      return domain;
    }
  }

  return null;
}

export async function authorizePixel(input: {
  registry: PixelRegistry;
  pixelKey: string;
  originHost: string;
}): Promise<{
  pixel: PixelRecord;
  domain: PixelDomainRecord;
}> {
  let pixel: PixelRecord | null;

  try {
    pixel = await input.registry.resolvePixel(input.pixelKey);
  } catch (error) {
    if (error instanceof ControlPlaneError) {
      throw new CollectorError(503, error.code);
    }

    throw error;
  }

  if (!pixel || pixel.status !== 'active') {
    throw new CollectorError(404, 'PIXEL_NOT_AVAILABLE');
  }

  const domain = findAuthorizedDomain(pixel, input.originHost);

  if (!domain) {
    throw new CollectorError(403, 'ORIGIN_NOT_ALLOWED');
  }

  return { pixel, domain };
}
