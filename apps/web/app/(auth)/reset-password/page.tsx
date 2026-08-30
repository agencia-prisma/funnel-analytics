import { Button } from '@funnel/ui/button';

import { AuthCard, FormMessage, inputClassName } from '@/components/auth-card';

import { resetPasswordAction } from '../actions';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      description="Defina uma nova senha para sua conta."
      title="Nova senha"
    >
      <FormMessage error={params.error} />
      <form action={resetPasswordAction} className="grid gap-5">
        <label className="text-sm font-medium text-zinc-200">
          Nova senha
          <input
            autoComplete="new-password"
            className={inputClassName}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="text-sm font-medium text-zinc-200">
          Confirmar senha
          <input
            autoComplete="new-password"
            className={inputClassName}
            minLength={8}
            name="password_confirmation"
            required
            type="password"
          />
        </label>
        <Button type="submit">Atualizar senha</Button>
      </form>
    </AuthCard>
  );
}
