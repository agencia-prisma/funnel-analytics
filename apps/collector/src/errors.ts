export type CollectorErrorCode =
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_BATCH'
  | 'INVALID_EVENT'
  | 'UNSUPPORTED_EVENT_VERSION'
  | 'PII_NOT_ALLOWED'
  | 'INVALID_IDENTITY'
  | 'IDENTIFICATION_CONSENT_DENIED'
  | 'IDENTITY_CRYPTO_UNAVAILABLE'
  | 'IDENTITY_QUEUE_UNAVAILABLE'
  | 'PIXEL_NOT_AVAILABLE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'QUEUE_UNAVAILABLE'
  | 'CONTROL_PLANE_CONFIG_MISSING'
  | 'CONTROL_PLANE_URL_INVALID'
  | 'CONTROL_PLANE_TIMEOUT'
  | 'CONTROL_PLANE_NETWORK_ERROR'
  | 'CONTROL_PLANE_UNAUTHORIZED'
  | 'CONTROL_PLANE_RESPONSE_INVALID'
  | 'CONTROL_PLANE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class CollectorError extends Error {
  constructor(
    readonly status: number,
    readonly code: CollectorErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'CollectorError';
  }
}
