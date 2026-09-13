import { FaqGuide } from '@/components/faq/FaqGuide';

export default function FrequentlyAskedQuestionsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
          Central de ajuda
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Dúvidas frequentes
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
          Encontre respostas sobre Workspaces, Pixels, rastreamento, Funnels,
          Analytics, regras, publicação, versões, membros, permissões e
          configurações. A ideia desta página é permitir que qualquer usuário
          consiga operar a plataforma com segurança, mesmo sem conhecimento
          técnico.
        </p>
      </div>

      <aside className="mt-8 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-5">
        <p className="text-sm font-semibold text-violet-200">
          A Public Key do Pixel pode ficar visível?
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Sim. A chave iniciada por <code>px_pub_</code> identifica somente o
          Pixel correspondente e foi criada para ser usada no navegador. Ela
          não concede acesso ao Workspace, membros, configurações ou outros
          Pixels. O Collector também valida domínio, status do Pixel, conteúdo
          do evento e limites de uso antes de aceitar dados. Eventos financeiros
          confiáveis devem usar integrações de servidor e não dependem somente
          dessa chave pública.
        </p>
      </aside>

      <aside className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm font-semibold text-white">
          Como funciona o modo ANALYZE do Funnel?
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Abra um Funnel publicado e clique em <strong>ANALYZE</strong>. A tela
          mostra os resultados da versão ativa para 7, 30 ou 90 dias, incluindo
          entradas, conversões, taxa de conclusão, sessões, page views,
          checkouts, pedidos, receita, AOV e progressão por etapa. Eventos com
          <code> test_mode: true</code> são excluídos da análise.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Os principais indicadores também são comparados com o período
          imediatamente anterior de mesma duração. Por exemplo, ao selecionar 30
          dias, o sistema compara os últimos 30 dias com os 30 dias anteriores.
          Quando o período anterior é zero e o atual possui dados, o painel
          informa que o indicador é novo em vez de exibir uma variação infinita.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          A seção “Evolução no período” organiza entradas, conversões e receita
          por dia. A progressão respeita a ordem das etapas do funil. “Conversão
          anterior” mostra quantas tentativas que chegaram à etapa anterior
          também alcançaram a etapa atual; “drop-off” mostra a parcela que não
          avançou.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          A seção de atribuição mostra receita atribuída por modelo, canal,
          origem e campanha. O percentual de participação é calculado dentro de
          cada modelo de atribuição, evitando misturar modelos diferentes em uma
          única base. Receita e AOV usam a moeda principal do Workspace e somente
          pedidos vinculados a jornadas que alcançaram o funil analisado.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Se o ClickHouse ficar temporariamente indisponível, o ANALYZE exibe um
          estado de indisponibilidade e não altera o Funnel nem seus dados. Se o
          período ainda não tiver dados de produção, a tela mostra um estado
          vazio em vez de tratar isso como erro.
        </p>
      </aside>

      <section className="mt-10">
        <FaqGuide />
      </section>
    </main>
  );
}
