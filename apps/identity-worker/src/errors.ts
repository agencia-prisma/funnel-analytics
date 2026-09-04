import type { PipelineFailureKind } from '@funnel/event-contracts';

export type IdentityWorkerErrorCode =
  | 'IDENTITY_ENVELOPE_INVALID'
  | 'IDENTITY_ENVELOPE_VERSION_UNSUPPORTED'
  | 'IDENTITY_CONTROL_PLANE_CONFIG_MISSING'
  | 'IDENTITY_CONTROL_PLANE_URL_INVALID'
  | 'IDENTITY_CONTROL_PLANE_TIMEOUT'
  | 'IDENTITY_CONTROL_PLANE_NETWORK_ERROR'
  | 'IDENTITY_CONTROL_PLANE_RESPONSE_INVALID'
  | 'IDENTITY_CONTROL_PLANE_UNAVAILABLE'
  | 'IDENTITY_CONTROL_PLANE_INVALID'
  | 'IDENTITY_CONFLICT'
  | 'VISITOR_IDENTITY_CONFLICT'
  | 'IDENTITY_LINK_WRITE_FAILED'
  | 'IDENTITY_DLQ_FAILED';

export class IdentityWorkerError extends Error {
  constructor(
    readonly kind: PipelineFailureKind,
    readonly code: IdentityWorkerErrorCode,
  ) {
    super(code);
    this.name = 'IdentityWorkerError';
  }
}
