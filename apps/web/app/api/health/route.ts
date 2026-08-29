import { PRODUCT_VERSION, SERVICES } from '@funnel/config';
import { createHealthPayload } from '@funnel/observability';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    createHealthPayload({
      service: SERVICES.web,
      version: PRODUCT_VERSION,
    }),
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
