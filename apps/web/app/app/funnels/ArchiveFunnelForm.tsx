'use client';

import { archiveFunnelAction } from './actions';

export function ArchiveFunnelForm({ funnelId }: { funnelId: string }) {
  return (
    <form
      action={archiveFunnelAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          'Arquivar funil? Ele ficará somente leitura e não aceitará novas versões.',
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input name="funnel_id" type="hidden" value={funnelId} />
      <button
        className="rounded-lg border border-rose-400/20 px-3 py-2 text-sm text-rose-300 hover:bg-rose-400/5"
        type="submit"
      >
        Arquivar
      </button>
    </form>
  );
}
