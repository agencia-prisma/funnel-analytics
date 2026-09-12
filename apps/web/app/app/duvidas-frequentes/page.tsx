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
          regras, publicação, versões, membros, permissões e configurações. A
          ideia desta página é permitir que qualquer usuário consiga operar a
          plataforma com segurança, mesmo sem conhecimento técnico.
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

      <section className="mt-10">
        <FaqGuide />
      </section>
    </main>
  );
}
