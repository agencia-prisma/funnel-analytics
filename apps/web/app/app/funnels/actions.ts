'use server';

import { domainErrorMessage } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { createLogger } from '@funnel/observability';
import { validateFunnelDefinition } from '@funnel/rule-engine';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/session';
import {
  requireCurrentWorkspace,
  requireWorkspacePermission,
} from '@/lib/workspaces';

const logger = createLogger('web');

export interface FunnelActionResult {
  ok: boolean;
  error?: string;
  funnelId?: string;
  version?: number;
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function parseDefinition(raw: string) {
  if (raw.length > 131072) throw new Error('FUNNEL_STEPS_INVALID');
  return validateFunnelDefinition(JSON.parse(raw) as unknown);
}

export async function publishFunnelAction(input: {
  funnelId: string | null;
  expectedCurrentVersion: number | null;
  name: string;
  description: string;
  definitionJson: string;
}): Promise<FunnelActionResult> {
  try {
    const user = await requireUser();
    const workspace = await requireCurrentWorkspace();
    await requireWorkspacePermission(workspace.id, 'funnels.manage');

    const name = text(input.name, 121);
    const description = text(input.description, 2001);
    if (!name || name.length > 120 || description.length > 2000) {
      throw new Error('FUNNEL_INVALID');
    }

    const definition = parseDefinition(input.definitionJson);
    const supabase = await createServerSupabaseClient();

    if (!input.funnelId) {
      const { data, error } = await supabase.rpc('create_funnel_v1', {
        target_workspace_id: workspace.id,
        funnel_name: name,
        funnel_description: description || null,
        conversion_window_seconds: definition.conversion_window_seconds,
        steps: definition.steps,
      });
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] : data;
      if (!created?.funnel_id || !created.version) throw new Error('FUNNEL_NOT_FOUND');

      logger.info('funnel.builder_published', {
        actor_user_id: user.id,
        funnel_id: created.funnel_id,
        version: created.version,
        workspace_id: workspace.id,
      });
      return { ok: true, funnelId: created.funnel_id, version: created.version };
    }

    if (!input.expectedCurrentVersion || input.expectedCurrentVersion < 1) {
      throw new Error('FUNNEL_INVALID');
    }

    const { data, error } = await supabase.rpc('create_funnel_version_v1', {
      target_workspace_id: workspace.id,
      target_funnel_id: input.funnelId,
      expected_current_version: input.expectedCurrentVersion,
      conversion_window_seconds: definition.conversion_window_seconds,
      steps: definition.steps,
    });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.version) throw new Error('FUNNEL_NOT_FOUND');

    logger.info('funnel.builder_published', {
      actor_user_id: user.id,
      funnel_id: input.funnelId,
      version: created.version,
      workspace_id: workspace.id,
    });
    return { ok: true, funnelId: input.funnelId, version: created.version };
  } catch (error) {
    return { ok: false, error: domainErrorMessage(error) };
  }
}

export async function updateFunnelMetadataAction(input: {
  funnelId: string;
  name: string;
  description: string;
}): Promise<FunnelActionResult> {
  try {
    const workspace = await requireCurrentWorkspace();
    await requireWorkspacePermission(workspace.id, 'funnels.manage');
    const name = text(input.name, 121);
    const description = text(input.description, 2001);
    if (!name || name.length > 120 || description.length > 2000) {
      throw new Error('FUNNEL_INVALID');
    }
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('update_funnel_metadata_v1', {
      target_workspace_id: workspace.id,
      target_funnel_id: input.funnelId,
      funnel_name: name,
      funnel_description: description || null,
    });
    if (error) throw error;
    return { ok: true, funnelId: input.funnelId };
  } catch (error) {
    return { ok: false, error: domainErrorMessage(error) };
  }
}

export async function archiveFunnelAction(formData: FormData) {
  const funnelId = String(formData.get('funnel_id') ?? '');
  try {
    const workspace = await requireCurrentWorkspace();
    await requireWorkspacePermission(workspace.id, 'funnels.manage');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('archive_funnel_v1', {
      target_workspace_id: workspace.id,
      target_funnel_id: funnelId,
    });
    if (error) throw error;
  } catch (error) {
    redirect(`/app/funnels?error=${encodeURIComponent(domainErrorMessage(error))}`);
  }
  redirect('/app/funnels?message=' + encodeURIComponent('Funil arquivado.'));
}
