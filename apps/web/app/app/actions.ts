'use server';

import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/session';

export async function switchWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const workspaceId = String(formData.get('workspace_id') ?? '');
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) {
    redirect('/app?error=' + encodeURIComponent('Workspace indisponível.'));
  }

  const cookieStore = await cookies();
  cookieStore.set('funnel_workspace_id', workspaceId, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  redirect('/app');
}
