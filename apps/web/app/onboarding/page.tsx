import { Button } from '@funnel/ui/button';
import { Card } from '@funnel/ui/card';
import { redirect } from 'next/navigation';

import { FormMessage, inputClassName } from '@/components/auth-card';
import { requireUser } from '@/lib/auth/session';
import { listUserWorkspaces } from '@/lib/workspaces';

import { createWorkspaceAction } from './actions';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const workspaces = await listUserWorkspaces();

  if (workspaces.length) {
    redirect('/app');
  }

  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-12">
      <Card className="w-full">
        <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
          Onboarding
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          Crie seu Workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Este será o primeiro tenant da sua conta. Você poderá participar de
          outros Workspaces depois.
        </p>
        <div className="mt-8">
          <FormMessage error={params.error} />
          <form action={createWorkspaceAction} className="grid gap-5">
            <label className="text-sm font-medium text-zinc-200">
              Nome da empresa / Workspace
              <input className={inputClassName} name="name" required />
            </label>
            <label className="text-sm font-medium text-zinc-200">
              Timezone
              <input
                className={inputClassName}
                defaultValue="America/Sao_Paulo"
                name="timezone"
                required
              />
            </label>
            <label className="text-sm font-medium text-zinc-200">
              Moeda
              <input
                className={inputClassName}
                defaultValue="BRL"
                maxLength={3}
                name="currency"
                required
              />
            </label>
            <Button type="submit">Criar Workspace</Button>
          </form>
        </div>
      </Card>
    </main>
  );
}
