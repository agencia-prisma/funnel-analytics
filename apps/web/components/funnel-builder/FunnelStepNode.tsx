'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

export interface FunnelStepNodeData extends Record<string, unknown> {
  position: number;
  name: string;
  stepKey: string;
  ruleSummary: string;
  valid: boolean;
}

export type FunnelStepFlowNode = Node<FunnelStepNodeData, 'funnelStep'>;

export function FunnelStepNode({
  data,
  selected,
}: NodeProps<FunnelStepFlowNode>) {
  return (
    <div
      className={`min-w-56 rounded-2xl border bg-[#13101b] p-4 shadow-xl transition ${
        selected
          ? 'border-violet-400 ring-2 ring-violet-400/20'
          : 'border-white/10'
      }`}
    >
      <Handle
        className="!h-2 !w-2 !border-0 !bg-zinc-600"
        position={Position.Left}
        type="target"
      />
      <div className="flex items-start justify-between gap-4">
        <span className="text-xs font-semibold text-violet-300">
          {String(data.position).padStart(2, '0')}
        </span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${data.valid ? 'bg-emerald-400' : 'bg-rose-400'}`}
          title={data.valid ? 'Etapa válida' : 'Etapa precisa de correção'}
        />
      </div>
      <p className="mt-2 max-w-48 truncate text-sm font-semibold text-white">
        {data.name}
      </p>
      <code className="mt-2 block max-w-48 truncate text-[11px] text-zinc-500">
        {data.stepKey}
      </code>
      <p className="mt-3 max-w-52 text-xs leading-5 text-zinc-400">
        {data.ruleSummary}
      </p>
      <Handle
        className="!h-2 !w-2 !border-0 !bg-violet-400"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}
