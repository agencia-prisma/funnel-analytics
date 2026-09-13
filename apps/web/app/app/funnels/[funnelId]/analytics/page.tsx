import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getFunnelAnalytics,
  type AnalyticsMetricComparison,
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

function comparisonLabel(comparison?: AnalyticsMetricComparison) {
  if (!comparison) return undefined;
  if (comparison.changePct === null) {
    return comparison.current > 0 && comparison.previous === 0
      ? 'Novo no período'
      : 'Sem base comparável';
  }
  const prefix = comparison.changePct > 0 ? '+' : '';
  return `${prefix}${comparison.changePct.toFixed(2)}% vs. período anterior`;
}

function MetricCard({
  label,
  value,
  helper,
  comparison,
}: {
  label: string;
  value: string;
  helper?: string;
  comparison?: AnalyticsMetricComparison;
}) {
  const trend = comparisonLabel(comparison);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {helper ? <p className="mt-2 text-xs text-zinc-500">{helper}</p> : null}
      {trend ? (
        <p
          className={`mt-2 text-xs ${comparison?.changePct !== null && (comparison?.changePct ?? 0) > 0 ? 'text-emerald-300' : comparison?.changePct !== null && (comparison?.changePct ?? 0) < 0 ? 'text-rose-300' : 'text-zinc-500'}`}
        >
          {trend}
        </p>
      ) : null}
    </div>
  );
}

function AnalyticsUnavailable({ funnelId }: { funnelId: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6">
      <p className="text-sm font-semibold text-amber-100">
        Analytics temporariamente indisponível
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
        Não foi possível consultar o ClickHouse agora. O Funnel continua ativo e
        nenhum dado foi alterado. Tente novamente em alguns instantes ou confirme
        as credenciais de leitura do Analytics no ambiente da aplicação.
      </p>
      <div className="mt-4 flex gap-2">
        <Link
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
          href={`/app/funnels/${funnelId}/analytics`}
        >
          Tentar novamente
        </Link>
        <Link
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
          href={`/app/funnels/${funnelId}`}
        >
          Voltar ao BUILD
        </Link>
      </div>
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

  let analytics;
  try {
    analytics = await getFunnelAnalytics(funnelId, rangeDays);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('ANALYTICS_CLICKHOUSE_') ||
        error.message.includes('fetch failed'))
    ) {
      return (
        <main className="mx-auto w-full max-w-[1500px] px-6 py-10">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
              Funnel Analytics
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {funnel.name}
            </h1>
          </div>
          <AnalyticsUnavailable funnelId={funnelId} />
        </main>
      );
    }
    throw error;
  }

  const maxSeries = Math.max(
    1,
    ...analytics.timeSeries.flatMap((point) => [point.entrants, point.conversions]),
  );

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

      {!analytics.entrants && !analytics.sessions && !analytics.orders ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="font-medium text-white">Ainda não há dados neste período.</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            O ANALYZE começará a preencher automaticamente quando a versão ativa
            do funil receber eventos de produção. Eventos em test_mode não entram
            nos relatórios.
          </p>
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Entradas no funil"
          value={String(analytics.entrants)}
          comparison={analytics.comparison.entrants}
        />
        <MetricCard
          label="Conversões"
          value={String(analytics.conversions)}
          helper={`${analytics.completionRatePct.toFixed(2)}% de conclusão`}
          comparison={analytics.comparison.conversions}
        />
        <MetricCard
          label="Sessões"
          value={String(analytics.sessions)}
          comparison={analytics.comparison.sessions}
        />
        <MetricCard label="Page views" value={String(analytics.pageViews)} />
        <MetricCard
          label="Checkouts"
          value={String(analytics.checkouts)}
          comparison={analytics.comparison.checkouts}
        />
        <MetricCard
          label="Pedidos"
          value={String(analytics.orders)}
          comparison={analytics.comparison.orders}
        />
        <MetricCard
          label="Receita líquida"
          value={formatMoney(analytics.revenueMinor, analytics.currency)}
          comparison={analytics.comparison.revenueMinor}
        />
        <MetricCard
          label="AOV"
          value={formatMoney(analytics.aovMinor, analytics.currency)}
          comparison={analytics.comparison.aovMinor}
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

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Evolução no período</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Entradas, conversões e receita líquida por dia.
            </p>
          </div>
          <span className="text-xs text-zinc-600">Últimos {rangeDays} dias</span>
        </div>

        {analytics.timeSeries.length ? (
          <div className="mt-5 grid gap-3">
            {analytics.timeSeries.map((point) => (
              <div
                className="grid gap-2 rounded-xl border border-white/5 bg-black/20 p-3 md:grid-cols-[100px_minmax(0,1fr)_120px] md:items-center"
                key={point.date}
              >
                <span className="text-xs text-zinc-500">
                  {new Date(`${point.date}T12:00:00Z`).toLocaleDateString('pt-BR')}
                </span>
                <div className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded-full bg-violet-400/70"
                      style={{ width: `${Math.max(2, (point.entrants / maxSeries) * 100)}%` }}
                    />
                    <span className="whitespace-nowrap text-[11px] text-zinc-500">
                      {point.entrants} entradas
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded-full bg-emerald-400/60"
                      style={{ width: `${Math.max(2, (point.conversions / maxSeries) * 100)}%` }}
                    />
                    <span className="whitespace-nowrap text-[11px] text-zinc-500">
                      {point.conversions} conversões
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium text-zinc-200 md:text-right">
                  {formatMoney(point.revenueMinor, analytics.currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-zinc-500">
            Nenhum ponto de série temporal disponível neste período.
          </p>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="font-semibold text-white">Progressão por etapa</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tentativas únicas que alcançaram cada etapa da versão ativa do funil.
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
                    Este funil ainda não possui uma versão publicada para análise.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="font-semibold text-white">Atribuição</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Receita atribuída por modelo, canal, origem e campanha para pedidos
            vinculados às jornadas deste funil.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs text-zinc-500 uppercase">
              <tr>
                <th className="px-5 py-3">Modelo</th>
                <th className="px-5 py-3">Canal</th>
                <th className="px-5 py-3">Origem</th>
                <th className="px-5 py-3">Campanha</th>
                <th className="px-5 py-3">Pedidos</th>
                <th className="px-5 py-3">Participação</th>
                <th className="px-5 py-3">Receita atribuída</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {analytics.attribution.map((row, index) => (
                <tr
                  key={`${row.attributionModel}-${row.channel}-${row.source}-${row.campaign ?? 'none'}-${index}`}
                >
                  <td className="px-5 py-4 text-zinc-400">{row.attributionModel}</td>
                  <td className="px-5 py-4 font-medium text-zinc-200">{row.channel}</td>
                  <td className="px-5 py-4 text-zinc-300">{row.source}</td>
                  <td className="px-5 py-4 text-zinc-400">{row.campaign ?? '—'}</td>
                  <td className="px-5 py-4 text-zinc-300">{row.orders}</td>
                  <td className="px-5 py-4 text-zinc-300">
                    {row.sharePct.toFixed(2)}%
                  </td>
                  <td className="px-5 py-4 font-medium text-white">
                    {formatMoney(row.attributedRevenueMinor, analytics.currency)}
                  </td>
                </tr>
              ))}
              {!analytics.attribution.length ? (
                <tr>
                  <td className="px-5 py-8 text-center text-zinc-500" colSpan={7}>
                    Ainda não existem fatos de atribuição para os pedidos deste
                    funil no período selecionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-zinc-600">
        Atualizado em {new Date(analytics.generatedAt).toLocaleString('pt-BR')}.
        Os números consideram somente a versão ativa e excluem eventos em modo de
        teste. A comparação usa o período imediatamente anterior com a mesma
        duração.
      </p>
    </main>
  );
}
