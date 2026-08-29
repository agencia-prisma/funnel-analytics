export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold tracking-[0.2em] text-violet-300 uppercase">
          404
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-white">
          Página não encontrada
        </h1>
        <a
          className="mt-6 inline-block text-sm text-zinc-400 underline underline-offset-4 hover:text-white"
          href="/"
        >
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
