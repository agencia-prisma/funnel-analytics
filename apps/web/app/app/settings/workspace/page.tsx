import { can } from '@funnel/auth';
import { Button } from '@funnel/ui/button';
import { Card } from '@funnel/ui/card';

import { FormMessage, inputClassName } from '@/components/auth-card';
import { requireCurrentWorkspace } from '@/lib/workspaces';

import { updateWorkspaceAction } from './actions';

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const workspace = await requireCurrentWorkspace();
  const params = await searchParams;
  const canUpdate = can(workspace.role, 'workspace.update');

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
        Configurações
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Workspace</h1>
      <Card className="mt-8">
        <FormMessage error={params.error} message={params.message} />
        <form action={updateWorkspaceAction} className="grid gap-5">
          <input name="workspace_id" type="hidden" value={workspace.id} />
          <label className="text-sm font-medium text-zinc-200">
            Nome
            <input
              className={inputClassName}
              defaultValue={workspace.name}
              disabled={!canUpdate}
              name="name"
              required
            />
          </label>
          <label className="text-sm font-medium text-zinc-200">
            Slug
            <input
              className={inputClassName}
              disabled
              value={workspace.slug}
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-200">
              Timezone
              <input
                className={inputClassName}
                defaultValue={workspace.timezone}
                disabled={!canUpdate}
                name="timezone"
                required
              />
            </label>
            <label className="text-sm font-medium text-zinc-200">
              Moeda
              <input
                className={inputClassName}
                defaultValue={workspace.currency}
                disabled={!canUpdate}
                maxLength={3}
                name="currency"
                required
              />
            </label>
          </div>
          {canUpdate ? <Button type="submit">Salvar alterações</Button> : null}
        </form>
      </Card>
    </main>
  );
}
