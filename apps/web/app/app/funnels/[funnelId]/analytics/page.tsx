import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getFunnelAnalytics,
  type AnalyticsRangeDays,
} from '@/lib/analytics';
import { getCurrentWorkspaceFunnel } from '@/lib/funnels';

function parseRange(value?: string): AnalyticsRangeDays {
  if (value === '7') return 7;
  if (value === '90') return 90;
  return 30;
}

function formatMoney(valueMinor: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(valueMinor / 100);
}

function formatDuration(ms: number) {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}min`;
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {helper ? <p className="mt-2 text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}

export default async function FunnelAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { funnelId } = await params;
  const { range } = await searchParams;
  const rangeDays = parseRange(range);

  let funnel;
  try {
    funnel = await getCurrentWorkspaceFunnel(funnelId);
  } catch (error) {
    if (error instanceof Error && error.message.includes('FUNNEL_NOT_FOUND')) {
      notFound();
    }
    throw error;
  }

  const analytics = await getFunnelAnalytics(funnelId, rangeDays);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
            Funnel Analytics
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {funnel.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Versão ativa {analytics.funnelVersion ?? '—'} · dados de produção ·
            testes excluídos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              href={`/app/funnels/${funnelId}/analytics?range=${days}`}
              className={`rounded-lg border px-3 py-2 text-sm ${rangeDays === days ? 'border-violet-400/40 bg-violet-400/10 text-violet-200' : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              {days} dias
            </Link>
          ))}
          <Link
            className="ml-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
            href={`/app/funnels/${funnelId}`}
          >
            BUILD
          </Link>
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Entradas no funil" value={String(analytics.entrants)} />
        <MetricCard
          label="Conversões"
          value={String(analytics.conversions)}
          helper={`${analytics.completionRatePct.toFixed(2)}% de conclusão`}
        />
        <MetricCard label="Sessões" value={String(analytics.sessions)} />
        <MetricCard label="Page views" value={String(analytics.pageViews)} />
        <MetricCard label="Checkouts" value={String(analytics.checkouts)} />
        <MetricCard label="Pedidos" value={String(analytics.orders)} />
        <MetricCard
          label="Receita líquida"
          value={formatMoney(analytics.revenueMinor, analytics.currency)}
        />
        <MetricCard
          label="AOV"
          value={formatMoney(analytics.aovMinor, analytics.currency)}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <MetricCard
          label="Tempo mediano até conversão"
          value={formatDuration(analytics.medianConversionMs)}
        />
        <MetricCard
          label="Tempo médio até conversão"
          value={formatDuration(analytics.averageConversionMs)}
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="font-semibold text-white">Progressão por etapa</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tentativas únicas que alcançaram cada etapa da versão ativa do
            funil.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3">Etapa</th>
                <th className="px-5 py-3">Atingiram</th>
                <th className="px-5 py-3">Conversão anterior</th>
                <th className="px-5 py-3">Drop-off</th>
                <th className="px-5 py-3">Tempo mediano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {analytics.steps.map((step, index) => (
                <tr key={step.stepKey}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-violet-300">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="font-medium text-zinc-200">
                          {funnel.current_version?.steps[index]?.name ?? step.stepKey}
                        </p>
                        <code className="text-[11px] text-zinc-600">
                          {step.stepKey}
                        </code>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium text-white">
                    {step.reachedAttempts}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {step.conversionFromPreviousPct === null
                      ? 'Entrada'
                      : `${step.conversionFromPreviousPct.toFixed(2)}%`}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {step.dropOffFromPreviousPct === null
                      ? '—'
                      : `${step.dropOffFromPreviousPct.toFixed(2)}%`}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {formatDuration(step.medianElapsedMs)}
                  </td>
                </tr>
              ))}
              {!analytics.steps.length ? (
                <tr>
                  <td className="px-5 py-8 text-center text-zinc-500" colSpan={5}>
                    Este funil ainda não possui uma versão publicada para
                    análise.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-zinc-600">
        Atualizado em {new Date(analytics.generatedAt).toLocaleString('pt-BR')}.
        Os números consideram somente a versão ativa e excluem eventos em modo
        de teste.
      </p>
    </main>
  );
}
