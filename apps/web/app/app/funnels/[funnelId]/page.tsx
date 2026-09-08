import { validateFunnelDefinition } from '@funnel/rule-engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FormMessage } from '@/components/auth-card';
import { FunnelBuilder } from '@/components/funnel-builder/FunnelBuilder';
import { getCurrentWorkspaceFunnel } from '@/lib/funnels';
import {
  hasWorkspacePermission,
  requireCurrentWorkspace,
} from '@/lib/workspaces';

export default async function FunnelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const workspace = await requireCurrentWorkspace();
  const { funnelId } = await params;
  const query = await searchParams;

  let funnel;
  try {
    funnel = await getCurrentWorkspaceFunnel(funnelId);
  } catch (error) {
    if (error instanceof Error && error.message.includes('FUNNEL_NOT_FOUND')) {
      notFound();
    }
    throw error;
  }

  const canManage = await hasWorkspacePermission(workspace.id, 'funnels.manage');
  if (!funnel.current_version) notFound();

  const definition = validateFunnelDefinition({
    definition_version: funnel.current_version.definition_version,
    mode: funnel.current_version.mode,
    conversion_window_seconds: funnel.current_version.conversion_window_seconds,
    steps: funnel.current_version.steps.map((step) => ({
      step_key: step.step_key,
      name: step.name,
      rule: step.rule,
    })),
  });

  return (
    <main className="mx-auto w-full max-w-[1600px] px-6 py-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
              Funnel Builder
            </p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400">
              {funnel.status}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {funnel.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Versão ativa {funnel.current_version.version} · {funnel.current_version.steps.length} etapas
          </p>
        </div>
        <Link className="text-sm text-zinc-400 hover:text-white" href="/app/funnels">
          ← Voltar para Funnels
        </Link>
      </div>

      <div className="mb-5">
        <FormMessage error={query.error} message={query.message} />
      </div>

      <FunnelBuilder
        archived={funnel.status === 'archived'}
        currentVersion={funnel.current_version.version}
        definition={definition}
        description={funnel.description}
        funnelId={funnel.id}
        name={funnel.name}
        readOnly={!canManage}
        workspaceId={workspace.id}
      />
    </main>
  );
}
