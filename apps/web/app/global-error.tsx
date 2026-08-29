'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-center text-white">
        <div>
          <p className="text-sm text-violet-300">Funnel Analytics</p>
          <h1 className="mt-3 text-3xl font-semibold">
            Não foi possível carregar a aplicação
          </h1>
          <button
            className="mt-6 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold"
            onClick={reset}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
