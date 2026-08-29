import type { HealthEvent } from '@funnel/event-contracts';

interface HealthPayloadOptions {
  now?: () => Date;
  service: string;
  version: string;
}

export function createHealthPayload({
  now = () => new Date(),
  service,
  version,
}: HealthPayloadOptions): HealthEvent {
  return {
    service,
    status: 'ok',
    timestamp: now().toISOString(),
    version,
  };
}
