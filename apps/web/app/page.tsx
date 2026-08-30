import { PRODUCT_NAME, PRODUCT_VERSION } from '@funnel/config';
import { Card } from '@funnel/ui/card';
import Link from 'next/link';

const foundationItems = [
  ['Identity', 'Supabase Auth'],
  ['Tenancy', 'Workspace + RLS'],
  ['Authorization', 'RBAC + overrides'],
  ['Status', 'EPIC 01 em validação'],
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 lg:px-10">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] text-violet-200 uppercase">
          Funnel Analytics · Access Layer
        </div>
        <div className="flex gap-3">
          <Link
            className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
            href="/login"
          >
            Entrar
          </Link>
          <Link
            className="inline-flex h-10 items-center rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-400"
            href="/sign-up"
          >
            Criar conta
          </Link>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
        <section>
          <p className="mb-4 text-sm font-medium text-violet-300">
            Prisma Group
          </p>
          <h1 className="max-w-3xl text-5xl leading-[0.98] font-semibold tracking-[-0.05em] text-white sm:text-7xl">
            {PRODUCT_NAME}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400">
            A camada de acesso multi-tenant para conectar usuários, Workspaces e
            permissões antes dos módulos de analytics.
          </p>
        </section>

        <Card className="grid gap-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <span className="text-sm text-zinc-400">Runtime</span>
            <span className="text-sm font-medium text-emerald-300">
              operacional
            </span>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Versão</dt>
              <dd className="font-mono text-zinc-200">{PRODUCT_VERSION}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Health</dt>
              <dd>
                <a className="text-violet-300 hover:underline" href="/api/health">
                  /api/health
                </a>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <section
        aria-label="Fundação de acesso"
        className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4"
      >
        {foundationItems.map(([label, value]) => (
          <div className="bg-[#0b0911] p-5" key={label}>
            <p className="text-xs tracking-[0.16em] text-zinc-600 uppercase">
              {label}
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-200">{value}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
