export function PixelHealth({
  status,
  score,
  lastEventAt,
}: {
  status: 'pending' | 'healthy' | 'warning' | 'critical';
  score: number | null;
  lastEventAt: string | null;
}) {
  if (status === 'pending' && !lastEventAt) {
    return (
      <div>
        <p className="text-sm font-medium text-amber-200">Pendente</p>
        <p className="mt-1 text-xs text-zinc-500">
          Aguardando instalação / primeiro evento.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-zinc-200">{status}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {score === null ? 'Score ainda indisponível' : `Score ${score}/100`}
      </p>
    </div>
  );
}
