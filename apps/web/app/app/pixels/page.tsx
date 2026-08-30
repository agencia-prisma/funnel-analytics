import { Card } from '@funnel/ui/card';
import Link from 'next/link';

import { FormMessage, inputClassName } from '@/components/auth-card';
import { CopyButton } from '@/components/copy-button';
import { PixelHealth } from '@/components/pixel-health';
import { listCurrentWorkspacePixels } from '@/lib/pixels';
import {
  hasWorkspacePermission,
  requireCurrentWorkspace,
} from '@/lib/workspaces';

import { createPixelAction } from './actions';

function formatDate(value: string | null) {
  if (!value) {
    return 'Nenhum evento recebido';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function PixelsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const workspace = await requireCurrentWorkspace();
  const params = await searchParams;
  const [pixels, canCreate] = await Promise.all([
    listCurrentWorkspacePixels(),
    hasWorkspacePermission(workspace.id, 'pixels.create'),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
            Tracking Control Plane
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            Pixels
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Gerencie os identificadores de tracking e os domínios autorizados do
            Workspace {workspace.name}.
          </p>
        </div>
        <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
          {pixels.length} {pixels.length === 1 ? 'Pixel' : 'Pixels'}
        </p>
      </div>

      <div className="mt-6">
        <FormMessage error={params.error} message={params.message} />
      </div>

      {canCreate ? (
        <Card className="mt-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-violet-300 uppercase">
            Novo Pixel
          </p>
          <form
            action={createPixelAction}
            className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
          >
            <label className="text-sm font-medium text-zinc-200">
              Nome
              <input
                className={inputClassName}
                maxLength={120}
                name="name"
                placeholder="Site principal"
                required
              />
            </label>
            <label className="text-sm font-medium text-zinc-200">
              Domínio inicial <span className="text-zinc-600">(opcional)</span>
              <input
                className={inputClassName}
                name="initial_domain"
                placeholder="https://www.exemplo.com/"
              />
            </label>
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-violet-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-violet-400"
              type="submit"
            >
              Criar Pixel
            </button>
          </form>
        </Card>
      ) : null}

      <section className="mt-8 grid gap-5">
        {pixels.length ? (
          pixels.map((pixel) => (
            <Card className="p-0" key={pixel.id}>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">
                      {pixel.name}
                    </h2>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                      {pixel.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-black/30 px-2 py-1 text-xs text-violet-200">
                      {pixel.public_key}
                    </code>
                    <CopyButton value={pixel.public_key} />
                  </div>
                </div>
                <Link
                  className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
                  href={`/app/pixels/${pixel.id}`}
                >
                  Abrir Pixel
                </Link>
              </div>
              <div className="grid gap-px bg-white/10 md:grid-cols-4">
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs uppercase tracking-wider text-zinc-600">
                    Domínios
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-200">
                    {pixel.domains.length}
                  </p>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs uppercase tracking-wider text-zinc-600">
                    Health
                  </p>
                  <div className="mt-2">
                    <PixelHealth
                      lastEventAt={pixel.last_event_at}
                      score={pixel.health_score}
                      status={pixel.health_status}
                    />
                  </div>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs uppercase tracking-wider text-zinc-600">
                    Último evento
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {formatDate(pixel.last_event_at)}
                  </p>
                </div>
                <div className="bg-[#0b0911] p-5">
                  <p className="text-xs uppercase tracking-wider text-zinc-600">
                    Criado em
                  </p>
                  <p className="mt-2 text-sm text-zinc-300">
                    {formatDate(pixel.created_at)}
                  </p>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-lg font-semibold text-white">
              Nenhum Pixel configurado
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {canCreate
                ? 'Crie o primeiro Pixel para receber a public key e preparar a instalação.'
                : 'Este Workspace ainda não possui Pixels configurados.'}
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}
