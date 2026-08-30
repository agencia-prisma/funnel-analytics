'use server';

import { domainErrorMessage } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { redirect } from 'next/navigation';

import { requireWorkspacePermission } from '@/lib/workspaces';

export async function updateWorkspaceAction(formData: FormData) {
  const workspaceId = String(formData.get('workspace_id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const timezone = String(formData.get('timezone') ?? '').trim();
  const currency = String(formData.get('currency') ?? '')
    .trim()
    .toUpperCase();

  if (!workspaceId || !name || !timezone || !/^[A-Z]{3}$/.test(currency)) {
    redirect(
      '/app/settings/workspace?error=' +
        encodeURIComponent('Revise os dados do Workspace.'),
    );
  }

  try {
    await requireWorkspacePermission(workspaceId, 'workspace.update');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from('workspaces')
      .update({ name, timezone, currency })
      .eq('id', workspaceId);

    if (error) {
      throw error;
    }
  } catch (error) {
    redirect(
      '/app/settings/workspace?error=' +
        encodeURIComponent(domainErrorMessage(error)),
    );
  }

  redirect(
    '/app/settings/workspace?message=' +
      encodeURIComponent('Workspace atualizado.'),
  );
}
