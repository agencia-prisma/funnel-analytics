'use client';

import {
  FUNNEL_DEFAULT_CONVERSION_WINDOW_SECONDS,
  type FunnelDefinitionV1,
  type FunnelRuleV1,
} from '@funnel/rule-engine';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import {
  publishFunnelAction,
  updateFunnelMetadataAction,
} from '@/app/app/funnels/actions';

import {
  builderDraftToDefinition,
  duplicateStep,
  reorderSteps,
} from './builder-adapter';
import {
  CONVERSION_WINDOWS,
  defaultRule,
  slugifyStepKey,
  type BuilderDraft,
  type BuilderStep,
} from './builder-model';
import { validateBuilderDraft } from './builder-validation';
import { FunnelCanvas } from './FunnelCanvas';
import { RuleBuilder } from './RuleBuilder';

const inputClass =
  'mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-60';

const dialogBackdropClass =
  'fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6';

function initialSteps(definition?: FunnelDefinitionV1): BuilderStep[] {
  if (definition) {
    return definition.steps.map((step, index) => ({
      id: step.step_key,
      name: step.name,
      step_key: step.step_key,
      position: index + 1,
      rule: step.rule,
      canvas: { x: 80 + index * 300, y: 160 },
    }));
  }

  return [
    {
      id: 'landing',
      name: 'Landing Page',
      step_key: 'landing',
      position: 1,
      rule: defaultRule(),
      canvas: { x: 80, y: 160 },
    },
    {
      id: 'conversion',
      name: 'Conversão',
      step_key: 'conversion',
      position: 2,
      rule: {
        kind: 'condition',
        field: 'event_name',
        operator: 'equals',
        value: 'purchase',
      },
      canvas: { x: 380, y: 160 },
    },
  ];
}

function createInitialDraft({
  funnelId,
  version,
  name,
  description,
  definition,
}: {
  funnelId: string | null;
  version: number | null;
  name?: string;
  description?: string | null;
  definition?: FunnelDefinitionV1;
}): BuilderDraft {
  return {
    funnelId,
    baseVersion: version,
    name: name ?? 'Novo funil',
    description: description ?? '',
    conversionWindowSeconds:
      definition?.conversion_window_seconds ??
      FUNNEL_DEFAULT_CONVERSION_WINDOW_SECONDS,
    steps: initialSteps(definition),
  };
}

function cloneDraft(draft: BuilderDraft): BuilderDraft {
  return JSON.parse(JSON.stringify(draft)) as BuilderDraft;
}

export function FunnelBuilder({
  workspaceId,
  funnelId = null,
  currentVersion = null,
  name,
  description,
  definition,
  readOnly = false,
  archived = false,
}: {
  workspaceId: string;
  funnelId?: string | null;
  currentVersion?: number | null;
  name?: string;
  description?: string | null;
  definition?: FunnelDefinitionV1;
  readOnly?: boolean;
  archived?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() =>
    createInitialDraft({
      funnelId,
      version: currentVersion,
      name,
      description,
      definition,
    }),
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    draft.steps[0]?.id ?? null,
  );
  const [showStepSettings, setShowStepSettings] = useState(false);
  const [showFunnelSettings, setShowFunnelSettings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [undoStack, setUndoStack] = useState<BuilderDraft[]>([]);
  const [redoStack, setRedoStack] = useState<BuilderDraft[]>([]);
  const storageKey = `funnel-builder:${workspaceId}:${funnelId ?? 'new'}`;
  const effectiveReadOnly = readOnly || archived;

  const validation = useMemo(() => validateBuilderDraft(draft), [draft]);
  const invalidStepIds = useMemo(
    () =>
      new Set(
        validation.issues.flatMap((issue) =>
          issue.stepId ? [issue.stepId] : [],
        ),
      ),
    [validation.issues],
  );
  const selectedStep =
    draft.steps.find((step) => step.id === selectedStepId) ?? null;

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (!stored) return;
        const candidate = JSON.parse(stored) as BuilderDraft;
        if (
          candidate &&
          Array.isArray(candidate.steps) &&
          candidate.baseVersion === currentVersion &&
          candidate.funnelId === funnelId
        ) {
          setDraft(candidate);
          setSelectedStepId(candidate.steps[0]?.id ?? null);
          setMessage('Rascunho local restaurado.');
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [currentVersion, funnelId, storageKey]);

  useEffect(() => {
    if (effectiveReadOnly) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, effectiveReadOnly, storageKey]);

  useEffect(() => {
    if (!showStepSettings && !showFunnelSettings && !showPublish) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setShowStepSettings(false);
      setShowFunnelSettings(false);
      setShowPublish(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFunnelSettings, showPublish, showStepSettings]);

  function mutate(recipe: (current: BuilderDraft) => BuilderDraft) {
    if (effectiveReadOnly) return;
    setUndoStack([...undoStack.slice(-49), cloneDraft(draft)]);
    setRedoStack([]);
    setDraft(recipe(draft));
    setMessage(null);
    setError(null);
  }

  function updateStep(stepId: string, changes: Partial<BuilderStep>) {
    mutate((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === stepId ? { ...step, ...changes } : step,
      ),
    }));
  }

  function openStepSettings(stepId: string) {
    setSelectedStepId(stepId);
    setShowStepSettings(true);
  }

  function addStep() {
    const nextPosition = draft.steps.length + 1;
    const base = `etapa_${nextPosition}`;
    const used = new Set(draft.steps.map((step) => step.step_key));
    let key = base;
    let suffix = 2;
    while (used.has(key)) key = `${base}_${suffix++}`;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${key}-${Date.now()}`;

    mutate((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id,
          name: `Etapa ${nextPosition}`,
          step_key: key,
          position: nextPosition,
          rule: defaultRule(),
          canvas: { x: 80 + (nextPosition - 1) * 300, y: 160 },
        },
      ],
    }));
    setSelectedStepId(id);
    setShowStepSettings(true);
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack([...redoStack, cloneDraft(draft)]);
    setDraft(previous);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack([...undoStack, cloneDraft(draft)].slice(-50));
    setDraft(next);
  }

  function saveDraft() {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    setMessage('Rascunho salvo neste navegador. Nenhuma versão foi publicada.');
  }

  function publish() {
    const result = validateBuilderDraft(draft);
    if (!result.valid || !result.definition) {
      setError(
        result.issues[0]?.message ?? 'Corrija o funil antes de publicar.',
      );
      setShowPublish(false);
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await publishFunnelAction({
        funnelId: draft.funnelId,
        expectedCurrentVersion: draft.baseVersion,
        name: draft.name,
        description: draft.description,
        definitionJson: JSON.stringify(result.definition),
      });
      if (!response.ok || !response.funnelId) {
        setError(response.error ?? 'Não foi possível publicar o funil.');
        setShowPublish(false);
        return;
      }

      window.localStorage.removeItem(storageKey);
      setShowPublish(false);
      router.push(
        `/app/funnels/${response.funnelId}?message=${encodeURIComponent(`Versão ${response.version} publicada.`)}`,
      );
      router.refresh();
    });
  }

  function saveMetadata() {
    if (!draft.funnelId) {
      setShowFunnelSettings(false);
      return;
    }

    startTransition(async () => {
      const response = await updateFunnelMetadataAction({
        funnelId: draft.funnelId!,
        name: draft.name,
        description: draft.description,
      });
      if (!response.ok) {
        setError(
          response.error ?? 'Não foi possível salvar os dados do funil.',
        );
        return;
      }

      setMessage('Nome e descrição atualizados.');
      setShowFunnelSettings(false);
    });
  }

  function removeSelectedStep() {
    if (!selectedStep) return;
    if (
      !window.confirm('Remover etapa? A sequência visual será reorganizada.')
    )
      return;

    const nextSelectedId =
      draft.steps.find((step) => step.id !== selectedStep.id)?.id ?? null;
    mutate((current) => ({
      ...current,
      steps: current.steps
        .filter((step) => step.id !== selectedStep.id)
        .map((step, index) => ({ ...step, position: index + 1 })),
    }));
    setSelectedStepId(nextSelectedId);
    setShowStepSettings(false);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-200">
            BUILD
          </span>
          <button
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500"
            disabled
            type="button"
          >
            ANALYZE · próximo EPIC
          </button>
          {draft.baseVersion ? (
            <span className="text-xs text-zinc-500">
              Base v{draft.baseVersion}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
            type="button"
            onClick={() => setShowFunnelSettings(true)}
          >
            Configurar funil
          </button>
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
            disabled={effectiveReadOnly || undoStack.length === 0}
            type="button"
            onClick={undo}
          >
            Desfazer
          </button>
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 disabled:opacity-40"
            disabled={effectiveReadOnly || redoStack.length === 0}
            type="button"
            onClick={redo}
          >
            Refazer
          </button>
          {!effectiveReadOnly ? (
            <button
              className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/5"
              type="button"
              onClick={saveDraft}
            >
              Salvar rascunho
            </button>
          ) : null}
          {!effectiveReadOnly ? (
            <button
              className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
              disabled={isPending}
              type="button"
              onClick={() => setShowPublish(true)}
            >
              Publicar
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      ) : null}
      {effectiveReadOnly ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
          Modo somente leitura. Sua permissão permite visualizar o funil, mas
          não publicar alterações.
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Etapas</h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                Clique para configurar
              </p>
            </div>
            {!effectiveReadOnly ? (
              <button
                className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15"
                type="button"
                onClick={addStep}
              >
                + Adicionar
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2">
            {[...draft.steps]
              .sort((a, b) => a.position - b.position)
              .map((step, index) => (
                <button
                  className={`rounded-xl border p-3 text-left transition ${selectedStepId === step.id ? 'border-violet-400/50 bg-violet-400/10' : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5'}`}
                  key={step.id}
                  type="button"
                  onClick={() => openStepSettings(step.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-violet-300">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-sm font-medium text-zinc-200">
                      {step.name}
                    </span>
                  </div>
                  <code className="mt-1 block truncate text-[10px] text-zinc-600">
                    {step.step_key}
                  </code>
                </button>
              ))}
          </div>
        </aside>

        <div className="grid gap-3">
          <FunnelCanvas
            invalidStepIds={invalidStepIds}
            readOnly={effectiveReadOnly}
            selectedStepId={selectedStepId}
            steps={draft.steps}
            onSelect={openStepSettings}
            onMove={(stepId, canvas) => updateStep(stepId, { canvas })}
          />
          <p className="px-1 text-xs text-zinc-500">
            Clique em qualquer card do fluxo para visualizar e editar suas
            configurações.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Validação</h2>
            <p className="mt-1 text-xs text-zinc-500">
              A publicação usa o mesmo Rule Engine canônico no cliente e
              novamente no servidor.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${validation.valid ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}
          >
            {validation.valid
              ? 'Pronto para publicar'
              : `${validation.issues.length} problema(s)`}
          </span>
        </div>
        {!validation.valid ? (
          <ul className="mt-3 grid gap-1 text-sm text-rose-200">
            {validation.issues.map((issue, index) => (
              <li key={`${issue.stepId ?? 'funnel'}-${index}`}>
                • {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {showFunnelSettings ? (
        <div
          className={dialogBackdropClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="funnel-settings-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowFunnelSettings(false);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#120f19] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="funnel-settings-title"
                  className="text-xl font-semibold text-white"
                >
                  Configurações do funil
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Ajuste as informações gerais sem sair do canvas.
                </p>
              </div>
              <button
                aria-label="Fechar configurações do funil"
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/5"
                type="button"
                onClick={() => setShowFunnelSettings(false)}
              >
                ✕
              </button>
            </div>

            <label className="mt-6 block text-xs font-medium text-zinc-400">
              Nome
              <input
                className={inputClass}
                disabled={effectiveReadOnly}
                maxLength={120}
                value={draft.name}
                onChange={(event) =>
                  mutate((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-zinc-400">
              Descrição
              <textarea
                className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-100 outline-none focus:border-violet-400 disabled:opacity-60"
                disabled={effectiveReadOnly}
                maxLength={2000}
                value={draft.description}
                onChange={(event) =>
                  mutate((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-zinc-400">
              Janela de conversão
              <select
                className={inputClass}
                disabled={effectiveReadOnly}
                value={draft.conversionWindowSeconds}
                onChange={(event) =>
                  mutate((current) => ({
                    ...current,
                    conversionWindowSeconds: Number(event.target.value),
                  }))
                }
              >
                {CONVERSION_WINDOWS.map((window) => (
                  <option key={window.value} value={window.value}>
                    {window.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-5">
              <button
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
                type="button"
                onClick={() => setShowFunnelSettings(false)}
              >
                Fechar
              </button>
              {!effectiveReadOnly ? (
                <button
                  className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
                  disabled={isPending}
                  type="button"
                  onClick={saveMetadata}
                >
                  {draft.funnelId ? 'Salvar configurações' : 'Concluir'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showStepSettings && selectedStep ? (
        <div
          className={dialogBackdropClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="step-settings-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowStepSettings(false);
          }}
        >
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#120f19] p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-300">
                    {String(selectedStep.position).padStart(2, '0')}
                  </span>
                  <h2
                    id="step-settings-title"
                    className="text-xl font-semibold text-white"
                  >
                    Configurar {selectedStep.name}
                  </h2>
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Os valores abaixo refletem a configuração atual deste card.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {!effectiveReadOnly ? (
                  <>
                    <button
                      aria-label="Mover etapa para a esquerda"
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 disabled:opacity-30"
                      disabled={selectedStep.position <= 1}
                      type="button"
                      onClick={() =>
                        mutate((current) => ({
                          ...current,
                          steps: reorderSteps(
                            current.steps,
                            selectedStep.position - 1,
                            selectedStep.position - 2,
                          ),
                        }))
                      }
                    >
                      ←
                    </button>
                    <button
                      aria-label="Mover etapa para a direita"
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 disabled:opacity-30"
                      disabled={selectedStep.position >= draft.steps.length}
                      type="button"
                      onClick={() =>
                        mutate((current) => ({
                          ...current,
                          steps: reorderSteps(
                            current.steps,
                            selectedStep.position - 1,
                            selectedStep.position,
                          ),
                        }))
                      }
                    >
                      →
                    </button>
                    <button
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
                      type="button"
                      onClick={() =>
                        mutate((current) => ({
                          ...current,
                          steps: duplicateStep(current.steps, selectedStep.id),
                        }))
                      }
                    >
                      Duplicar
                    </button>
                    <button
                      className="rounded-lg border border-rose-400/20 px-3 py-2 text-sm text-rose-300 hover:bg-rose-400/5"
                      type="button"
                      onClick={removeSelectedStep}
                    >
                      Remover
                    </button>
                  </>
                ) : null}
                <button
                  aria-label="Fechar configurações da etapa"
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/5"
                  type="button"
                  onClick={() => setShowStepSettings(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-medium text-zinc-400">
                Nome da etapa
                <input
                  className={inputClass}
                  disabled={effectiveReadOnly}
                  maxLength={120}
                  value={selectedStep.name}
                  onChange={(event) => {
                    const nameValue = event.target.value;
                    const changes: Partial<BuilderStep> = { name: nameValue };
                    if (
                      !selectedStep.step_key ||
                      selectedStep.step_key.startsWith('etapa_')
                    )
                      changes.step_key =
                        slugifyStepKey(nameValue) || selectedStep.step_key;
                    updateStep(selectedStep.id, changes);
                  }}
                />
              </label>
              <label className="text-xs font-medium text-zinc-400">
                Step key
                <input
                  className={inputClass}
                  disabled={effectiveReadOnly}
                  maxLength={64}
                  value={selectedStep.step_key}
                  onChange={(event) =>
                    updateStep(selectedStep.id, {
                      step_key: event.target.value.toLowerCase(),
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold tracking-wider text-violet-200 uppercase">
                    Regra
                  </h3>
                  <p className="mt-1 text-xs text-zinc-600">
                    Defina quando esta etapa deve ser considerada atingida.
                  </p>
                </div>
                <span className="text-xs text-zinc-600">AST canônico v1</span>
              </div>
              <RuleBuilder
                disabled={effectiveReadOnly}
                rule={selectedStep.rule}
                onChange={(rule: FunnelRuleV1) =>
                  updateStep(selectedStep.id, { rule })
                }
              />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
              <p className="text-xs text-zinc-500">
                As alterações ficam no rascunho até a publicação de uma nova
                versão.
              </p>
              <button
                className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                type="button"
                onClick={() => setShowStepSettings(false)}
              >
                {effectiveReadOnly ? 'Fechar' : 'Concluir edição'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPublish ? (
        <div
          className={dialogBackdropClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#120f19] p-6 shadow-2xl">
            <h2 id="publish-title" className="text-xl font-semibold text-white">
              Publicar nova versão?
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              A versão publicada ficará imutável.{' '}
              {draft.baseVersion
                ? `Será criada a versão ${draft.baseVersion + 1}.`
                : 'Será criada a versão 1 e o funil ficará ativo.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"
                disabled={isPending}
                type="button"
                onClick={() => setShowPublish(false)}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={isPending}
                type="button"
                onClick={publish}
              >
                {isPending ? 'Publicando…' : 'Confirmar publicação'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function definitionFromDraftForTesting(draft: BuilderDraft) {
  return builderDraftToDefinition(draft);
}
