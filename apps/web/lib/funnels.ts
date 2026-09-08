import 'server-only';

import type { FunnelRuleV1 } from '@funnel/rule-engine';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';

import {
  requireCurrentWorkspace,
  requireWorkspacePermission,
} from './workspaces';

export interface FunnelStepRecord {
  id: string;
  step_key: string;
  position: number;
  name: string;
  rule: FunnelRuleV1;
}

export interface FunnelVersionRecord {
  id: string;
  version: number;
  definition_version: number;
  mode: string;
  conversion_window_seconds: number;
  created_at: string;
  steps: FunnelStepRecord[];
}

export interface FunnelRecord {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  current_version: FunnelVersionRecord | null;
}

export async function listCurrentWorkspaceFunnels(): Promise<FunnelRecord[]> {
  const workspace = await requireCurrentWorkspace();
  await requireWorkspacePermission(workspace.id, 'funnels.view');
  const supabase = await createServerSupabaseClient();

  const { data: funnels, error: funnelError } = await supabase
    .from('funnels')
    .select(
      'id, workspace_id, name, description, status, current_version_id, created_at, updated_at, archived_at',
    )
    .eq('workspace_id', workspace.id)
    .order('updated_at', { ascending: false });

  if (funnelError) throw funnelError;
  if (!funnels?.length) return [];

  const versionIds = funnels
    .map((funnel) => funnel.current_version_id)
    .filter((id): id is string => Boolean(id));

  const versionsById = new Map<string, Omit<FunnelVersionRecord, 'steps'>>();
  if (versionIds.length) {
    const { data: versions, error: versionError } = await supabase
      .from('funnel_versions')
      .select(
        'id, version, definition_version, mode, conversion_window_seconds, created_at',
      )
      .eq('workspace_id', workspace.id)
      .in('id', versionIds);

    if (versionError) throw versionError;
    for (const version of versions ?? []) {
      versionsById.set(version.id, version);
    }
  }

  const stepCountByVersion = new Map<string, number>();
  if (versionIds.length) {
    const { data: steps, error: stepError } = await supabase
      .from('funnel_steps')
      .select('funnel_version_id')
      .eq('workspace_id', workspace.id)
      .in('funnel_version_id', versionIds);

    if (stepError) throw stepError;
    for (const step of steps ?? []) {
      stepCountByVersion.set(
        step.funnel_version_id,
        (stepCountByVersion.get(step.funnel_version_id) ?? 0) + 1,
      );
    }
  }

  return funnels.map((funnel) => {
    const version = funnel.current_version_id
      ? versionsById.get(funnel.current_version_id)
      : undefined;
    return {
      ...(funnel as Omit<FunnelRecord, 'current_version'>),
      current_version: version
        ? {
            ...version,
            steps: Array.from(
              { length: stepCountByVersion.get(version.id) ?? 0 },
              (_, index) => ({
                id: `count-${index}`,
                step_key: '',
                position: index + 1,
                name: '',
                rule: {
                  kind: 'condition',
                  field: 'event_name',
                  operator: 'exists',
                },
              }),
            ),
          }
        : null,
    };
  });
}

export async function getCurrentWorkspaceFunnel(
  funnelId: string,
): Promise<FunnelRecord> {
  const workspace = await requireCurrentWorkspace();
  await requireWorkspacePermission(workspace.id, 'funnels.view');
  const supabase = await createServerSupabaseClient();

  const { data: funnel, error: funnelError } = await supabase
    .from('funnels')
    .select(
      'id, workspace_id, name, description, status, current_version_id, created_at, updated_at, archived_at',
    )
    .eq('workspace_id', workspace.id)
    .eq('id', funnelId)
    .maybeSingle();

  if (funnelError) throw funnelError;
  if (!funnel) throw new Error('FUNNEL_NOT_FOUND');

  if (!funnel.current_version_id) {
    return {
      ...(funnel as Omit<FunnelRecord, 'current_version'>),
      current_version: null,
    };
  }

  const { data: version, error: versionError } = await supabase
    .from('funnel_versions')
    .select(
      'id, version, definition_version, mode, conversion_window_seconds, created_at',
    )
    .eq('workspace_id', workspace.id)
    .eq('funnel_id', funnel.id)
    .eq('id', funnel.current_version_id)
    .maybeSingle();

  if (versionError) throw versionError;
  if (!version) throw new Error('FUNNEL_NOT_FOUND');

  const { data: steps, error: stepError } = await supabase
    .from('funnel_steps')
    .select('id, step_key, position, name, rule')
    .eq('workspace_id', workspace.id)
    .eq('funnel_id', funnel.id)
    .eq('funnel_version_id', version.id)
    .order('position', { ascending: true });

  if (stepError) throw stepError;

  return {
    ...(funnel as Omit<FunnelRecord, 'current_version'>),
    current_version: {
      ...version,
      steps: (steps ?? []) as FunnelStepRecord[],
    },
  };
}
