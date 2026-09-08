'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
} from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import '@xyflow/react/dist/style.css';

import type { FunnelRuleV1 } from '@funnel/rule-engine';

import type { BuilderStep } from './builder-model';
import { FunnelStepNode, type FunnelStepFlowNode } from './FunnelStepNode';

function ruleSummary(rule: FunnelRuleV1): string {
  if (rule.kind === 'condition') {
    const value =
      rule.value === undefined
        ? ''
        : ` ${Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value)}`;
    return `${rule.field} · ${rule.operator}${value}`;
  }
  if (rule.kind === 'not') return `NOT · ${ruleSummary(rule.rule)}`;
  return `${rule.combinator.toUpperCase()} · ${rule.rules.length} regras`;
}

function toNodes(
  steps: BuilderStep[],
  invalidIds: Set<string>,
): FunnelStepFlowNode[] {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .map((step) => ({
      id: step.id,
      type: 'funnelStep',
      position: step.canvas,
      data: {
        position: step.position,
        name: step.name || 'Etapa sem nome',
        stepKey: step.step_key || 'chave_pendente',
        ruleSummary: ruleSummary(step.rule),
        valid: !invalidIds.has(step.id),
      },
    }));
}

function toEdges(steps: BuilderStep[]): Edge[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  return ordered.slice(0, -1).map((step, index) => ({
    id: `ordered-${step.id}-${ordered[index + 1]?.id ?? index}`,
    source: step.id,
    target: ordered[index + 1]!.id,
    type: 'smoothstep',
    animated: false,
  }));
}

const nodeTypes = { funnelStep: FunnelStepNode };

export function FunnelCanvas({
  steps,
  selectedStepId,
  invalidStepIds,
  readOnly,
  onSelect,
  onMove,
}: {
  steps: BuilderStep[];
  selectedStepId: string | null;
  invalidStepIds: Set<string>;
  readOnly: boolean;
  onSelect: (stepId: string) => void;
  onMove: (stepId: string, position: { x: number; y: number }) => void;
}) {
  const desiredNodes = useMemo(
    () => toNodes(steps, invalidStepIds),
    [steps, invalidStepIds],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<FunnelStepFlowNode>(desiredNodes);
  const edges = useMemo(() => toEdges(steps), [steps]);

  useEffect(() => {
    setNodes(
      desiredNodes.map((node) => ({
        ...node,
        selected: node.id === selectedStepId,
      })),
    );
  }, [desiredNodes, selectedStepId, setNodes]);

  return (
    <div className="h-[560px] min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#09070e]">
      <ReactFlow
        colorMode="dark"
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodes={nodes}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        nodesDraggable={!readOnly}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDragStop={(_, node) => onMove(node.id, node.position)}
        onNodesChange={onNodesChange}
        panOnDrag
        selectionOnDrag
      >
        <MiniMap pannable zoomable />
        <Controls showInteractive={!readOnly} />
        <Background gap={22} size={1} />
      </ReactFlow>
    </div>
  );
}
