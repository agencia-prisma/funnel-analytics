import { Button } from '@funnel/ui/button';
import Link from 'next/link';

import { AuthCard, FormMessage, inputClassName } from '@/components/auth-card';

import { forgotPasswordAction } from '../actions';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      description="Informe seu e-mail para receber o link de recuperação."
      footer={
        <Link className="font-medium text-violet-300" href="/login">
          Voltar para o login
        </Link>
      }
      title="Recuperar senha"
    >
      <FormMessage error={params.error} />
      <form action={forgotPasswordAction} className="grid gap-5">
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
        <Button type="submit">Enviar instruções</Button>
      </form>
    </AuthCard>
  );
}
