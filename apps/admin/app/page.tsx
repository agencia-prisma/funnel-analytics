import { Card } from '@funnel/ui/card';

export default function AdminHomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-violet-300 uppercase">
        Internal Control Plane
      </p>
      <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-white">
        Funnel Analytics Admin
      </h1>
      <p className="mt-5 max-w-2xl leading-7 text-zinc-400">
        Shell técnico preparado. Autenticação interna, RBAC e operações serão
        implementados nos próximos Epics.
      </p>

      <Card className="mt-10 flex items-center justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-white">Service health</p>
          <p className="mt-1 text-sm text-zinc-500">
            Sem dados internos expostos
          </p>
        </div>
        <a
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-white/10"
          href="/api/health"
        >
          Ver endpoint
        </a>
      </Card>
    </main>
  );
}
