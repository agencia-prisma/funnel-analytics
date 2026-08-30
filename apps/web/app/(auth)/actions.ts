'use server';

import { domainErrorMessage } from '@funnel/auth';
import { createServerSupabaseClient } from '@funnel/db/supabase/server';
import { createLogger } from '@funnel/observability';
import { redirect } from 'next/navigation';

import { safeNextPath } from '@/lib/security';

const logger = createLogger('web');

function stringField(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

function errorRedirect(path: string, error: unknown, next?: string | null): never {
  const params = new URLSearchParams({
    error: domainErrorMessage(error),
  });

  if (next) {
    params.set('next', next);
  }

  redirect(`${path}?${params.toString()}`);
}

export async function signUpAction(formData: FormData) {
  const displayName = stringField(formData, 'display_name');
  const email = stringField(formData, 'email').toLowerCase();
  const password = stringField(formData, 'password');
  const next = safeNextPath(formData.get('next'));
  const supabase = await createServerSupabaseClient();

  if (!displayName || !email || password.length < 8) {
    errorRedirect('/sign-up', new Error('WORKSPACE_INVALID'), next);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'http://127.0.0.1:3000';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(
        next ?? '/onboarding',
      )}`,
    },
  });

  if (error) {
    errorRedirect('/sign-up', error, next);
  }

  logger.info('auth.signup.success', {
    actor_user_id: data.user?.id,
  });

  if (!data.session) {
    const params = new URLSearchParams({
      message: 'Confirme seu e-mail para continuar.',
    });

    if (next) {
      params.set('next', next);
    }

    redirect(`/login?${params.toString()}`);
  }

  redirect(next ?? '/onboarding');
}

export async function loginAction(formData: FormData) {
  const email = stringField(formData, 'email').toLowerCase();
  const password = stringField(formData, 'password');
  const next = safeNextPath(formData.get('next'));
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    errorRedirect('/login', error, next);
  }

  logger.info('auth.login.success', {
    actor_user_id: data.user.id,
  });

  redirect(next ?? '/app');
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function forgotPasswordAction(formData: FormData) {
  const email = stringField(formData, 'email').toLowerCase();
  const supabase = await createServerSupabaseClient();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'http://127.0.0.1:3000';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    errorRedirect('/forgot-password', error);
  }

  redirect(
    '/login?message=' +
      encodeURIComponent('Se a conta existir, enviaremos as instruções de acesso.'),
  );
}

export async function resetPasswordAction(formData: FormData) {
  const password = stringField(formData, 'password');
  const confirmation = stringField(formData, 'password_confirmation');
  const supabase = await createServerSupabaseClient();

  if (password.length < 8 || password !== confirmation) {
    errorRedirect(
      '/reset-password',
      new Error('As senhas precisam coincidir e ter ao menos 8 caracteres.'),
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    errorRedirect('/reset-password', error);
  }

  redirect('/login?message=' + encodeURIComponent('Senha atualizada com sucesso.'));
}
