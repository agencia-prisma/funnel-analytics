import { Button } from '@funnel/ui/button';
import Link from 'next/link';

import { AuthCard, FormMessage, inputClassName } from '@/components/auth-card';

import { loginAction } from '../actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      description="Entre com sua conta para acessar os Workspaces autorizados."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link
            className="font-medium text-violet-300 hover:text-violet-200"
            href={
              params.next
                ? `/sign-up?next=${encodeURIComponent(params.next)}`
                : '/sign-up'
            }
          >
            Criar conta
          </Link>
        </>
      }
      title="Entrar"
    >
      <FormMessage error={params.error} message={params.message} />
      <form action={loginAction} className="grid gap-5">
        {params.next ? (
          <input name="next" type="hidden" value={params.next} />
        ) : null}
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
            autoComplete="current-password"
            className={inputClassName}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <Link
            className="text-sm text-zinc-400 hover:text-white"
            href="/forgot-password"
          >
            Esqueci minha senha
          </Link>
          <Button type="submit">Entrar</Button>
        </div>
      </form>
    </AuthCard>
  );
}
