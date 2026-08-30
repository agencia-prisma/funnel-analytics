'use server';

import { domainErrorMessage } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { createLogger } from '@funnel/observability';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/session';
import { hashInviteToken } from '@/lib/security';

const logger = createLogger('web');

export async function acceptInvitationAction(formData: FormData) {
  const user = await requireUser();
  const token = String(formData.get('token') ?? '');

  if (!token) {
    redirect('/app?error=' + encodeURIComponent('Convite inválido.'));
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('accept_workspace_invitation', {
    invite_token_hash: hashInviteToken(token),
  });

  if (error || !data) {
    redirect(
      `/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(
        domainErrorMessage(error),
      )}`,
    );
  }

  const workspaceId = data as string;
  const cookieStore = await cookies();
  cookieStore.set('funnel_workspace_id', workspaceId, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  logger.info('workspace.invitation.accepted', {
    actor_user_id: user.id,
    workspace_id: workspaceId,
  });

  redirect('/app');
}
