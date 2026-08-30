import { buildPixelInstallSnippet } from '@funnel/pixel';
import { Card } from '@funnel/ui/card';
import Link from 'next/link';

import { FormMessage, inputClassName } from '@/components/auth-card';
import { CopyButton } from '@/components/copy-button';
import { PixelHealth } from '@/components/pixel-health';
import { getCurrentWorkspacePixel } from '@/lib/pixels';
import {
  hasWorkspacePermission,
  requireCurrentWorkspace,
} from '@/lib/workspaces';

import {
  addPixelDomainAction,
  removePixelDomainAction,
  setPixelStatusAction,
  updatePixelAction,
} from '../actions';

function formatDate(value: string | null) {
  if (!value) {
    return 'Ainda não recebido';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function PixelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ pixelId: string }>;
  searchParams: Promise<{
    created?: string;
    error?: string;
    message?: string;
  }>;
}) {
  const { pixelId } = await params;
  const query = await searchParams;
  const workspace = await requireCurrentWorkspace();
  const [pixel, canUpdate, canArchive, canManageDomains] = await Promise.all([
    getCurrentWorkspacePixel(pixelId),
    hasWorkspacePermission(workspace.id, 'pixels.update'),
    hasWorkspacePermission(workspace.id, 'pixels.delete'),
    hasWorkspacePermission(workspace.id, 'domains.manage'),
  ]);

  const snippet = buildPixelInstallSnippet(pixel.public_key);
  const isArchived = pixel.status === 'archived';

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <Link className="text-sm text-zinc-500 hover:text-white" href="/app/pixels">
        ← Pixels
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              {pixel.name}
            </h1>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
              {pixel.status}
            </span>
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            Workspace: {workspace.name}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <FormMessage
          error={query.error}
          message={
            query.created === '1'
              ? 'Pixel criado. A public key e o código de instalação estão prontos.'
              : query.message
          }
        />
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold tracking-[0.16em] text-violet-300 uppercase">
            Visão Geral
          </p>
          <dl className="mt-5 grid gap-5">
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-600">
                Public Key
              </dt>
              <dd className="mt-2 flex flex-wrap items-center gap-2">
                <code
                  className="break-all rounded-md bg-black/30 px-2 py-1 text-xs text-violet-200"
                  data-testid="pixel-public-key"
                >
                  {pixel.public_key}
                </code>
                <CopyButton
                  label="Copiar public key"
                  testId="copy-public-key"
                  value={pixel.public_key}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-zinc-600">
                Health
              </dt>
              <dd className="mt-2">
                <PixelHealth
                  lastEventAt={pixel.last_event_at}
                  score={pixel.health_score}
                  status={pixel.health_status}
                />
              </dd>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-600">
                  Último evento
                </dt>
                <dd className="mt-2 text-sm text-zinc-300">
                  {formatDate(pixel.last_event_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-600">
                  Criado em
                </dt>
                <dd className="mt-2 text-sm text-zinc-300">
                  {formatDate(pixel.created_at)}
                </dd>
              </div>
            </div>
          </dl>
        </Card>

        <Card>
          <p className="text-xs font-semibold tracking-[0.16em] text-violet-300 uppercase">
            Instalação
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Adicione o snippet ao HTML das páginas que serão rastreadas.
          </p>
          <pre
            className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-zinc-300"
            data-testid="installation-snippet"
          >
            <code>{snippet}</code>
          </pre>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <CopyButton
              label="Copiar código"
              testId="copy-install-snippet"
              value={snippet}
            />
            <p className="text-xs text-amber-200">
              Código preparado — ativação do coletor entra na próxima etapa.
            </p>
          </div>
        </Card>
      </section>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-violet-300 uppercase">
              Domínios
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Domínios autorizados
            </h2>
          </div>
          <p className="text-xs text-zinc-500">
            Verificação real ocorrerá após o primeiro evento válido.
          </p>
        </div>

        {canManageDomains && !isArchived ? (
          <form
            action={addPixelDomainAction}
            className="mt-6 flex flex-wrap items-end gap-3"
          >
            <input name="pixel_id" type="hidden" value={pixel.id} />
            <label className="min-w-[280px] flex-1 text-sm font-medium text-zinc-200">
              Adicionar domínio
              <input
                className={inputClassName}
                name="domain"
                placeholder="exemplo.com ou *.exemplo.com"
                required
              />
            </label>
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-violet-500 px-5 text-sm font-semibold text-white hover:bg-violet-400"
              type="submit"
            >
              Adicionar
            </button>
          </form>
        ) : null}

        <div className="mt-6 grid gap-3">
          {pixel.domains.length ? (
            pixel.domains.map((domain) => (
              <div
                className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 p-4"
                key={domain.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-zinc-200">
                    {domain.wildcard ? '*.' : ''}
                    {domain.domain}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {domain.status} · último evento:{' '}
                    {formatDate(domain.last_seen_at)}
                  </p>
                </div>
                {canManageDomains && !isArchived ? (
                  <form action={removePixelDomainAction}>
                    <input name="pixel_id" type="hidden" value={pixel.id} />
                    <input name="domain_id" type="hidden" value={domain.id} />
                    <button
                      className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10"
                      type="submit"
                    >
                      Remover
                    </button>
                  </form>
                ) : null}
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
              Nenhum domínio cadastrado.
            </p>
          )}
        </div>
      </Card>

      <Card className="mt-5">
        <p className="text-xs font-semibold tracking-[0.16em] text-violet-300 uppercase">
          Configurações
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Pixel</h2>

        {canUpdate && !isArchived ? (
          <form action={updatePixelAction} className="mt-6 flex flex-wrap items-end gap-3">
            <input name="pixel_id" type="hidden" value={pixel.id} />
            <label className="min-w-[280px] flex-1 text-sm font-medium text-zinc-200">
              Nome
              <input
                className={inputClassName}
                defaultValue={pixel.name}
                maxLength={120}
                name="name"
                required
              />
            </label>
            <button
              className="inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
              type="submit"
            >
              Salvar alterações
            </button>
          </form>
        ) : null}

        {!isArchived ? (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-6">
            {canUpdate ? (
              <form action={setPixelStatusAction}>
                <input name="pixel_id" type="hidden" value={pixel.id} />
                <input
                  name="status"
                  type="hidden"
                  value={pixel.status === 'paused' ? 'active' : 'paused'}
                />
                <button
                  className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
                  type="submit"
                >
                  {pixel.status === 'paused' ? 'Reativar Pixel' : 'Pausar Pixel'}
                </button>
              </form>
            ) : null}
            {canArchive ? (
              <form action={setPixelStatusAction}>
                <input name="pixel_id" type="hidden" value={pixel.id} />
                <input name="status" type="hidden" value="archived" />
                <button
                  className="inline-flex h-10 items-center rounded-lg border border-red-400/20 bg-red-400/10 px-4 text-sm font-semibold text-red-200 hover:bg-red-400/15"
                  type="submit"
                >
                  Arquivar Pixel
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            Pixel arquivado. O registro e seu histórico permanecem preservados.
          </p>
        )}
      </Card>
    </main>
  );
}
