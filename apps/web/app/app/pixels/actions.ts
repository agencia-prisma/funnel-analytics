'use server';

import { domainErrorMessage } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { createLogger } from '@funnel/observability';
import { normalizeDomain } from '@funnel/pixel';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/session';
import {
  requireCurrentWorkspace,
  requireWorkspacePermission,
} from '@/lib/workspaces';

const logger = createLogger('web');

function stringField(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

function actionError(path: string, error: unknown): never {
  redirect(`${path}?error=${encodeURIComponent(domainErrorMessage(error))}`);
}

export async function createPixelAction(formData: FormData) {
  const user = await requireUser();
  const workspace = await requireCurrentWorkspace();
  const name = stringField(formData, 'name');
  const initialDomainInput = stringField(formData, 'initial_domain');

  let initialDomain: string | null = null;
  let initialWildcard = false;

  if (initialDomainInput) {
    const normalized = normalizeDomain(initialDomainInput);

    if (!normalized) {
      actionError('/app/pixels', new Error('DOMAIN_INVALID'));
    }

    initialDomain = normalized.domain;
    initialWildcard = normalized.wildcard;
  }

  let pixelId: string;

  try {
    await requireWorkspacePermission(workspace.id, 'pixels.create');
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc('create_pixel', {
      initial_domain: initialDomain,
      initial_wildcard: initialWildcard,
      pixel_name: name,
      target_workspace_id: workspace.id,
    });

    if (error) {
      throw error;
    }

    const created = Array.isArray(data) ? data[0] : data;

    if (!created?.pixel_id) {
      throw new Error('PIXEL_NOT_FOUND');
    }

    pixelId = created.pixel_id;

    logger.info('pixel.created', {
      actor_user_id: user.id,
      pixel_id: pixelId,
      workspace_id: workspace.id,
    });
  } catch (error) {
    actionError('/app/pixels', error);
  }

  redirect(`/app/pixels/${pixelId}?created=1`);
}

export async function updatePixelAction(formData: FormData) {
  const user = await requireUser();
  const workspace = await requireCurrentWorkspace();
  const pixelId = stringField(formData, 'pixel_id');
  const name = stringField(formData, 'name');

  try {
    await requireWorkspacePermission(workspace.id, 'pixels.update');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('update_pixel', {
      pixel_name: name,
      target_pixel_id: pixelId,
      target_workspace_id: workspace.id,
    });

    if (error) {
      throw error;
    }

    logger.info('pixel.updated', {
      actor_user_id: user.id,
      pixel_id: pixelId,
      workspace_id: workspace.id,
    });
  } catch (error) {
    actionError(`/app/pixels/${pixelId}`, error);
  }

  redirect(
    `/app/pixels/${pixelId}?message=${encodeURIComponent('Pixel atualizado.')}`,
  );
}

export async function setPixelStatusAction(formData: FormData) {
  const user = await requireUser();
  const workspace = await requireCurrentWorkspace();
  const pixelId = stringField(formData, 'pixel_id');
  const status = stringField(formData, 'status');

  if (status !== 'active' && status !== 'paused' && status !== 'archived') {
    actionError(`/app/pixels/${pixelId}`, new Error('PIXEL_ACCESS_DENIED'));
  }

  try {
    await requireWorkspacePermission(
      workspace.id,
      status === 'archived' ? 'pixels.delete' : 'pixels.update',
    );

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('set_pixel_status', {
      target_pixel_id: pixelId,
      target_status: status,
      target_workspace_id: workspace.id,
    });

    if (error) {
      throw error;
    }

    logger.info('pixel.status_changed', {
      actor_user_id: user.id,
      pixel_id: pixelId,
      workspace_id: workspace.id,
    });
  } catch (error) {
    actionError(`/app/pixels/${pixelId}`, error);
  }

  if (status === 'archived') {
    redirect('/app/pixels?message=' + encodeURIComponent('Pixel arquivado.'));
  }

  redirect(
    `/app/pixels/${pixelId}?message=${encodeURIComponent(
      status === 'paused' ? 'Pixel pausado.' : 'Pixel reativado.',
    )}`,
  );
}

export async function addPixelDomainAction(formData: FormData) {
  const user = await requireUser();
  const workspace = await requireCurrentWorkspace();
  const pixelId = stringField(formData, 'pixel_id');
  const domainInput = stringField(formData, 'domain');
  const normalized = normalizeDomain(domainInput);

  if (!normalized) {
    actionError(`/app/pixels/${pixelId}`, new Error('DOMAIN_INVALID'));
  }

  try {
    await requireWorkspacePermission(workspace.id, 'domains.manage');
    const supabase = await createServerSupabaseClient();
    const { data: domainId, error } = await supabase.rpc('add_pixel_domain', {
      target_domain: normalized.domain,
      target_pixel_id: pixelId,
      target_wildcard: normalized.wildcard,
      target_workspace_id: workspace.id,
    });

    if (error) {
      throw error;
    }

    logger.info('pixel.domain_added', {
      actor_user_id: user.id,
      pixel_id: pixelId,
      workspace_id: workspace.id,
    });

    if (!domainId) {
      throw new Error('DOMAIN_NOT_FOUND');
    }
  } catch (error) {
    actionError(`/app/pixels/${pixelId}`, error);
  }

  redirect(
    `/app/pixels/${pixelId}?message=${encodeURIComponent(
      'Domínio adicionado.',
    )}`,
  );
}

export async function removePixelDomainAction(formData: FormData) {
  const user = await requireUser();
  const workspace = await requireCurrentWorkspace();
  const pixelId = stringField(formData, 'pixel_id');
  const domainId = stringField(formData, 'domain_id');

  try {
    await requireWorkspacePermission(workspace.id, 'domains.manage');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('remove_pixel_domain', {
      target_domain_id: domainId,
      target_workspace_id: workspace.id,
    });

    if (error) {
      throw error;
    }

    logger.info('pixel.domain_removed', {
      actor_user_id: user.id,
      pixel_id: pixelId,
      workspace_id: workspace.id,
    });
  } catch (error) {
    actionError(`/app/pixels/${pixelId}`, error);
  }

  redirect(
    `/app/pixels/${pixelId}?message=${encodeURIComponent('Domínio removido.')}`,
  );
}
