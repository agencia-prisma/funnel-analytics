import { Card } from '@funnel/ui/card';

import { requireCurrentWorkspace } from '@/lib/workspaces';

export default async function DashboardPage() {
  const workspace = await requireCurrentWorkspace();

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
        Workspace ativo
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
        {workspace.name}
      </h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Autenticação, tenancy e autorização estão ativas. Pixels e Funnel
        Builder pertencem aos próximos Epics.
      </p>
      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-zinc-500 uppercase">Role</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {workspace.role}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-500 uppercase">Timezone</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {workspace.timezone}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-500 uppercase">Moeda</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {workspace.currency}
          </p>
        </Card>
      </section>
    </main>
  );
}
