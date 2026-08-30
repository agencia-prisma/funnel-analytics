import { Button } from '@funnel/ui/button';
import Link from 'next/link';

import { AuthCard, FormMessage, inputClassName } from '@/components/auth-card';

import { signUpAction } from '../actions';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      description="Crie sua identidade no SaaS. O primeiro Workspace será configurado em seguida."
      footer={
        <>
          Já tem conta?{' '}
          <Link
            className="font-medium text-violet-300 hover:text-violet-200"
            href={
              params.next
                ? `/login?next=${encodeURIComponent(params.next)}`
                : '/login'
            }
          >
            Entrar
          </Link>
        </>
      }
      title="Criar conta"
    >
      <FormMessage error={params.error} />
      <form action={signUpAction} className="grid gap-5">
        {params.next ? (
          <input name="next" type="hidden" value={params.next} />
        ) : null}
        <label className="text-sm font-medium text-zinc-200">
          Nome
          <input
            autoComplete="name"
            className={inputClassName}
            name="display_name"
            required
          />
        </label>
        <label className="text-sm font-medium text-zinc-200">
          E-mail
          <input
            autoComplete="email"
            className={inputClassName}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="text-sm font-medium text-zinc-200">
          Senha
          <input
            autoComplete="new-password"
            className={inputClassName}
            minLength={8}
            name="password"
            required
            type="password"
          />
          <span className="mt-2 block text-xs text-zinc-500">
            Use pelo menos 8 caracteres.
          </span>
        </label>
        <Button type="submit">Criar conta</Button>
      </form>
    </AuthCard>
  );
}
