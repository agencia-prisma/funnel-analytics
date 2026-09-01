import type { IdentityEnvelopeV1 } from '@funnel/event-contracts';

import { IdentityWorkerError } from './errors';

const DEFAULT_TIMEOUT_MS = 5_000;

export type IdentityResolutionStatus =
  'RESOLVED' | 'IDENTITY_CONFLICT' | 'VISITOR_IDENTITY_CONFLICT';

export interface IdentityResolution {
  resolution_status: IdentityResolutionStatus;
  person_id: string | null;
  person_created: boolean;
  visitor_link_created: boolean;
  linked_at: string;
  last_seen_at: string;
}

export interface IdentityRepository {
  resolve(envelope: IdentityEnvelopeV1): Promise<IdentityResolution>;
}

interface PostgrestErrorShape {
  message?: string;
  code?: string;
}

export class SupabaseIdentityRepository implements IdentityRepository {
  constructor(
    private readonly supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetchRef: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async resolve(envelope: IdentityEnvelopeV1): Promise<IdentityResolution> {
    if (!this.supabaseUrl || !this.secretKey) {
      throw new IdentityWorkerError(
        'TRANSIENT',
        'IDENTITY_CONTROL_PLANE_UNAVAILABLE',
      );
    }

    const url = new URL('/rest/v1/rpc/resolve_identity_v1', this.supabaseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchRef(url, {
        method: 'POST',
        headers: {
          apikey: this.secretKey,
          authorization: `Bearer ${this.secretKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          target_workspace_id: envelope.workspace_id,
          target_pixel_id: envelope.pixel_id,
          target_visitor_id: envelope.visitor_id,
          target_session_id: envelope.session_id,
          observed_at: envelope.received_at,
          protected_identifiers: envelope.encrypted_identifiers,
          identity_source: envelope.source,
          identity_confidence: envelope.confidence,
          target_test_mode: envelope.test_mode,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let code = '';

        try {
          const body = (await response.json()) as PostgrestErrorShape;
          code = `${body.code ?? ''} ${body.message ?? ''}`;
        } catch {
          code = '';
        }

        const permanent =
          response.status >= 400 &&
          response.status < 500 &&
          ![408, 425, 429].includes(response.status);

        if (
          /IDENTITY_INVALID|WORKSPACE_NOT_FOUND|PIXEL_NOT_AVAILABLE|IDENTITY_PERSON_NOT_ACTIVE/i.test(
            code,
          )
        ) {
          throw new IdentityWorkerError(
            'PERMANENT',
            'IDENTITY_CONTROL_PLANE_INVALID',
          );
        }

        throw new IdentityWorkerError(
          permanent ? 'PERMANENT' : 'TRANSIENT',
          permanent
            ? 'IDENTITY_CONTROL_PLANE_INVALID'
            : 'IDENTITY_CONTROL_PLANE_UNAVAILABLE',
        );
      }

      let rows: IdentityResolution[];

      try {
        rows = (await response.json()) as IdentityResolution[];
      } catch {
        throw new IdentityWorkerError(
          'TRANSIENT',
          'IDENTITY_CONTROL_PLANE_UNAVAILABLE',
        );
      }

      const result = rows[0];

      if (
        !result ||
        ![
          'RESOLVED',
          'IDENTITY_CONFLICT',
          'VISITOR_IDENTITY_CONFLICT',
        ].includes(result.resolution_status)
      ) {
        throw new IdentityWorkerError(
          'TRANSIENT',
          'IDENTITY_CONTROL_PLANE_UNAVAILABLE',
        );
      }

      return result;
    } catch (error) {
      if (error instanceof IdentityWorkerError) {
        throw error;
      }

      throw new IdentityWorkerError(
        'TRANSIENT',
        'IDENTITY_CONTROL_PLANE_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
