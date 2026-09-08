import { redirect } from 'next/navigation';

import { FunnelBuilder } from '@/components/funnel-builder/FunnelBuilder';
import {
  hasWorkspacePermission,
  requireCurrentWorkspace,
} from '@/lib/workspaces';

export default async function NewFunnelPage() {
  const workspace = await requireCurrentWorkspace();
  const canManage = await hasWorkspacePermission(
    workspace.id,
    'funnels.manage',
  );

  if (!canManage) {
    redirect(
      '/app/funnels?error=' +
        encodeURIComponent('Você não tem permissão para criar funis.'),
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-10">
      <div className="mb-7">
        <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
          Funnel Builder
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Novo Funnel
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          O rascunho permanece no editor até que você publique a primeira
          versão.
        </p>
      </div>
      <FunnelBuilder workspaceId={workspace.id} />
    </main>
  );
}
