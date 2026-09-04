import {
  validateFunnelDefinition,
  type FunnelDefinitionV1,
} from '@funnel/rule-engine';

import { FunnelWorkerError } from './errors';

const DEFAULT_TIMEOUT_MS = 5_000;

interface FunnelRow {
  id: string;
  current_version_id: string;
}

interface FunnelVersionRow {
  id: string;
  funnel_id: string;
  version: number;
  definition_version: number;
  mode: string;
  conversion_window_seconds: number;
}

interface FunnelStepRow {
  funnel_version_id: string;
  step_key: string;
  position: number;
  name: string;
  rule: unknown;
}

export interface ActiveFunnelDefinition {
  funnelId: string;
  funnelVersionId: string;
  funnelVersion: number;
  definition: FunnelDefinitionV1;
}

export interface FunnelControlPlane {
  activeDefinitions(workspaceId: string): Promise<ActiveFunnelDefinition[]>;
}

export class SupabaseFunnelControlPlane implements FunnelControlPlane {
  constructor(
    private readonly supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetchRef?: typeof fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  private endpoint(path: string, params: URLSearchParams): URL {
    const supabaseUrl = this.supabaseUrl?.trim();
    const secretKey = this.secretKey?.trim();

    if (!supabaseUrl || !secretKey) {
      throw new FunnelWorkerError(
        'PERMANENT',
        'FUNNEL_CONTROL_PLANE_CONFIG_MISSING',
      );
    }

    try {
      const base = new URL(supabaseUrl);
      if (!['http:', 'https:'].includes(base.protocol)) {
        throw new TypeError('Unsupported protocol');
      }
      const url = new URL(path, base);
      url.search = params.toString();
      return url;
    } catch {
      throw new FunnelWorkerError(
        'PERMANENT',
        'FUNNEL_CONTROL_PLANE_URL_INVALID',
      );
    }
  }

  private async request<T>(path: string, params: URLSearchParams): Promise<T> {
    const url = this.endpoint(path, params);
    const secretKey = this.secretKey.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const requestInit: RequestInit = {
        method: 'GET',
        headers: {
          apikey: secretKey,
          authorization: `Bearer ${secretKey}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      };
      const fetchRef = this.fetchRef;
      const response = fetchRef
        ? await fetchRef(url.toString(), requestInit)
        : await fetch(url.toString(), requestInit);

      if (!response.ok) {
        const transient =
          [408, 425, 429].includes(response.status) || response.status >= 500;
        throw new FunnelWorkerError(
          transient ? 'TRANSIENT' : 'PERMANENT',
          transient
            ? 'FUNNEL_CONTROL_PLANE_UNAVAILABLE'
            : 'FUNNEL_CONTROL_PLANE_INVALID_RESPONSE',
        );
      }

      try {
        return (await response.json()) as T;
      } catch {
        throw new FunnelWorkerError(
          'PERMANENT',
          'FUNNEL_CONTROL_PLANE_INVALID_RESPONSE',
        );
      }
    } catch (error) {
      if (error instanceof FunnelWorkerError) throw error;
      throw new FunnelWorkerError(
        controller.signal.aborted ? 'TRANSIENT' : 'TRANSIENT',
        'FUNNEL_CONTROL_PLANE_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async activeDefinitions(
    workspaceId: string,
  ): Promise<ActiveFunnelDefinition[]> {
    const funnelParams = new URLSearchParams();
    funnelParams.set('workspace_id', `eq.${workspaceId}`);
    funnelParams.set('status', 'eq.active');
    funnelParams.set('select', 'id,current_version_id');
    funnelParams.set('order', 'id.asc');

    const funnels = await this.request<FunnelRow[]>(
      '/rest/v1/funnels',
      funnelParams,
    );
    if (!Array.isArray(funnels)) {
      throw new FunnelWorkerError(
        'PERMANENT',
        'FUNNEL_CONTROL_PLANE_INVALID_RESPONSE',
      );
    }
    if (!funnels.length) return [];

    const versionIds = funnels.map((funnel) => funnel.current_version_id);
    if (versionIds.some((id) => !id)) {
      throw new FunnelWorkerError('PERMANENT', 'FUNNEL_DEFINITION_INVALID');
    }

    const versionParams = new URLSearchParams();
    versionParams.set('workspace_id', `eq.${workspaceId}`);
    versionParams.set('id', `in.(${versionIds.join(',')})`);
    versionParams.set(
      'select',
      'id,funnel_id,version,definition_version,mode,conversion_window_seconds',
    );
    const versions = await this.request<FunnelVersionRow[]>(
      '/rest/v1/funnel_versions',
      versionParams,
    );

    const stepParams = new URLSearchParams();
    stepParams.set('workspace_id', `eq.${workspaceId}`);
    stepParams.set('funnel_version_id', `in.(${versionIds.join(',')})`);
    stepParams.set('select', 'funnel_version_id,step_key,position,name,rule');
    stepParams.set('order', 'position.asc');
    const steps = await this.request<FunnelStepRow[]>(
      '/rest/v1/funnel_steps',
      stepParams,
    );

    if (!Array.isArray(versions) || !Array.isArray(steps)) {
      throw new FunnelWorkerError(
        'PERMANENT',
        'FUNNEL_CONTROL_PLANE_INVALID_RESPONSE',
      );
    }

    const versionById = new Map(
      versions.map((version) => [version.id, version]),
    );
    const stepsByVersion = new Map<string, FunnelStepRow[]>();
    for (const step of steps) {
      const list = stepsByVersion.get(step.funnel_version_id) ?? [];
      list.push(step);
      stepsByVersion.set(step.funnel_version_id, list);
    }

    return funnels.map((funnel) => {
      const version = versionById.get(funnel.current_version_id);
      const versionSteps = stepsByVersion.get(funnel.current_version_id) ?? [];
      if (
        !version ||
        version.funnel_id !== funnel.id ||
        !Number.isInteger(version.version) ||
        versionSteps.length < 2
      ) {
        throw new FunnelWorkerError('PERMANENT', 'FUNNEL_DEFINITION_INVALID');
      }

      try {
        const definition = validateFunnelDefinition({
          definition_version: version.definition_version,
          mode: version.mode,
          conversion_window_seconds: version.conversion_window_seconds,
          steps: versionSteps
            .sort((left, right) => left.position - right.position)
            .map((step) => ({
              step_key: step.step_key,
              name: step.name,
              rule: step.rule,
            })),
        });

        return {
          funnelId: funnel.id,
          funnelVersionId: version.id,
          funnelVersion: version.version,
          definition,
        };
      } catch {
        throw new FunnelWorkerError('PERMANENT', 'FUNNEL_DEFINITION_INVALID');
      }
    });
  }
}
