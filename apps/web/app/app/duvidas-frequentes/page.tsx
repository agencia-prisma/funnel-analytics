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

      <section className="mt-10">
        <FaqGuide />
      </section>
    </main>
  );
}
