import { Card } from '@funnel/ui/card';
import Link from 'next/link';

import { FormMessage } from '@/components/auth-card';
import { listCurrentWorkspaceFunnels } from '@/lib/funnels';
import {
  hasWorkspacePermission,
  requireCurrentWorkspace,
} from '@/lib/workspaces';

import { ArchiveFunnelForm } from './ArchiveFunnelForm';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

const statusLabel = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
} as const;

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const workspace = await requireCurrentWorkspace();
  const params = await searchParams;
  const [funnels, canManage] = await Promise.all([
    listCurrentWorkspaceFunnels(),
    hasWorkspacePermission(workspace.id, 'funnels.manage'),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
            Funnel Control Plane
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            Funnels
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Modele jornadas ordenadas visualmente sem acoplar o runtime ao
            canvas.
          </p>
        </div>
        {canManage ? (
          <Link
            className="inline-flex h-11 items-center rounded-lg bg-violet-500 px-5 text-sm font-semibold text-white hover:bg-violet-400"
            href="/app/funnels/new"
          >
            Novo Funnel
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        <FormMessage error={params.error} message={params.message} />
      </div>

      <section className="mt-8 grid gap-4">
        {funnels.length ? (
          funnels.map((funnel) => (
            <Card className="p-0" key={funnel.id}>
              <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(120px,1fr))_auto]">
                <div className="bg-[#0b0911] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold text-white">
                      {funnel.name}
                    </h2>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
                      {statusLabel[funnel.status]}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-500">
                    {funnel.description || 'Sem descrição.'}
                  </p>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs tracking-wider text-zinc-600 uppercase">
                    Versão ativa
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-200">
                    {funnel.current_version
                      ? `v${funnel.current_version.version}`
                      : '—'}
                  </p>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs tracking-wider text-zinc-600 uppercase">
                    Steps
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-200">
                    {funnel.current_version?.step_count ?? 0}
                  </p>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs tracking-wider text-zinc-600 uppercase">
                    Atualizado
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {formatDate(funnel.updated_at)}
                  </p>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs tracking-wider text-zinc-600 uppercase">
                    Janela
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {funnel.current_version
                      ? `${Math.round(funnel.current_version.conversion_window_seconds / 86400)} dia(s)`
                      : '—'}
                  </p>
                </div>
                <div className="flex min-w-40 items-center justify-end gap-2 bg-[#0b0911] p-5">
                  <Link
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                    href={`/app/funnels/${funnel.id}`}
                  >
                    Abrir
                  </Link>
                  {canManage && funnel.status !== 'archived' ? (
                    <ArchiveFunnelForm funnelId={funnel.id} />
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-lg font-semibold text-white">
              Você ainda não criou nenhum funil.
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Crie seu primeiro funil para começar a mapear a jornada de
              conversão.
            </p>
            {canManage ? (
              <Link
                className="mt-5 inline-flex rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white"
                href="/app/funnels/new"
              >
                Criar primeiro funil
              </Link>
            ) : null}
          </Card>
        )}
      </section>
    </main>
  );
}
