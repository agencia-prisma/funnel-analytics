'use server';

import {
  domainErrorMessage,
  type WorkspaceRole,
} from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { createLogger } from '@funnel/observability';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/session';
import { createInviteToken } from '@/lib/security';
import { requireWorkspacePermission } from '@/lib/workspaces';

const logger = createLogger('web');

export interface InvitationActionState {
  error?: string;
  link?: string;
}

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  const headerStore = await headers();
  const host =
    headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? '127.0.0.1:3000';
  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';

  return `${protocol}://${host}`;
}

export async function createInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const user = await requireUser();
  const workspaceId = String(formData.get('workspace_id') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? '') as WorkspaceRole;

  try {
    await requireWorkspacePermission(workspaceId, 'members.invite');
    const supabase = await createServerSupabaseClient();
    const { token, tokenHash } = createInviteToken();

    const { error } = await supabase.rpc('create_workspace_invitation', {
      invite_email: email,
      invite_expires_at: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      invite_role: role,
      invite_token_hash: tokenHash,
      target_workspace_id: workspaceId,
    });

    if (error) {
      throw error;
    }

    logger.info('workspace.invitation.created', {
      actor_user_id: user.id,
      workspace_id: workspaceId,
    });

    return {
      link: `${await appOrigin()}/invite/${token}`,
    };
  } catch (error) {
    return { error: domainErrorMessage(error) };
  }
}

export async function changeMemberRoleAction(formData: FormData) {
  const user = await requireUser();
  const workspaceId = String(formData.get('workspace_id') ?? '');
  const targetUserId = String(formData.get('user_id') ?? '');
  const role = String(formData.get('role') ?? '') as WorkspaceRole;

  try {
    await requireWorkspacePermission(workspaceId, 'members.update_role');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('change_workspace_member_role', {
      target_role: role,
      target_user_id: targetUserId,
      target_workspace_id: workspaceId,
    });

    if (error) {
      throw error;
    }

    logger.info('workspace.member.role_changed', {
      actor_user_id: user.id,
      workspace_id: workspaceId,
    });
  } catch (error) {
    redirect(
      '/app/settings/members?error=' +
        encodeURIComponent(domainErrorMessage(error)),
    );
  }

  redirect('/app/settings/members?message=' + encodeURIComponent('Role atualizado.'));
}

export async function removeMemberAction(formData: FormData) {
  const workspaceId = String(formData.get('workspace_id') ?? '');
  const targetUserId = String(formData.get('user_id') ?? '');

  try {
    await requireWorkspacePermission(workspaceId, 'members.remove');
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('remove_workspace_member', {
      target_user_id: targetUserId,
      target_workspace_id: workspaceId,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    redirect(
      '/app/settings/members?error=' +
        encodeURIComponent(domainErrorMessage(error)),
    );
  }

  const cookieStore = await cookies();
  const selected = cookieStore.get('funnel_workspace_id')?.value;

  if (selected === workspaceId) {
    // The current user may have removed themselves only when owner safety allows.
    // Access is revalidated by the protected layout on the next request.
  }

  redirect('/app/settings/members?message=' + encodeURIComponent('Membro removido.'));
}

export async function revokeInvitationAction(formData: FormData) {
  const invitationId = String(formData.get('invitation_id') ?? '');

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc('revoke_workspace_invitation', {
      target_invitation_id: invitationId,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    redirect(
      '/app/settings/members?error=' +
        encodeURIComponent(domainErrorMessage(error)),
    );
  }

  redirect(
    '/app/settings/members?message=' + encodeURIComponent('Convite revogado.'),
  );
}
