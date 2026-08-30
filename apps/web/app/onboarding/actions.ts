'use server';

import {
  createWorkspaceSlugCandidate,
  domainErrorMessage,
} from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { createLogger } from '@funnel/observability';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/session';
import { createCollisionSuffix } from '@/lib/security';

const logger = createLogger('web');

export async function createWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  const timezone =
    String(formData.get('timezone') ?? '').trim() || 'America/Sao_Paulo';
  const currency = String(formData.get('currency') ?? 'BRL')
    .trim()
    .toUpperCase();
  const supabase = await createServerSupabaseClient();

  if (!name || !timezone || !/^[A-Z]{3}$/.test(currency)) {
    redirect(
      '/onboarding?error=' +
        encodeURIComponent('Revise os dados do Workspace e tente novamente.'),
    );
  }

  let workspaceId: string | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = createWorkspaceSlugCandidate(
      name,
      attempt === 0 ? undefined : createCollisionSuffix(),
    );

    const { data, error } = await supabase.rpc('create_workspace', {
      workspace_currency: currency,
      workspace_name: name,
      workspace_slug: slug,
      workspace_timezone: timezone,
    });

    if (!error) {
      workspaceId = data as string;
      break;
    }

    lastError = error;

    if (!String(error.message).toLowerCase().includes('duplicate')) {
      break;
    }
  }

  if (!workspaceId) {
    redirect(
      '/onboarding?error=' + encodeURIComponent(domainErrorMessage(lastError)),
    );
  }

  const cookieStore = await cookies();
  cookieStore.set('funnel_workspace_id', workspaceId, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  logger.info('workspace.created', {
    actor_user_id: user.id,
    workspace_id: workspaceId,
  });

  redirect('/app');
}
