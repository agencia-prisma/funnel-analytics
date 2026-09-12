'use client';

import { useMemo, useState } from 'react';
import type {
  FunnelConditionRuleV1,
  FunnelRuleField,
  FunnelRuleOperator,
  FunnelRuleV1,
  FunnelScalar,
} from '@funnel/rule-engine';

import { RULE_FIELDS, RULE_OPERATORS, defaultRule } from './builder-model';

const inputClass =
  'h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:border-violet-400';

const SIMPLE_EVENTS = [
  { value: 'page_view', label: 'Visualizar uma página' },
  { value: 'click', label: 'Clicar em um elemento' },
  { value: 'form_submit', label: 'Enviar um formulário' },
  { value: 'checkout_started', label: 'Iniciar o checkout' },
  { value: 'purchase', label: 'Realizar uma compra' },
  { value: '__custom__', label: 'Outro evento' },
] as const;

const SIMPLE_CONDITIONS: ReadonlyArray<{
  value: FunnelRuleField;
  label: string;
  defaultOperator: FunnelRuleOperator;
  placeholder: string;
}> = [
  {
    value: 'page_path',
    label: 'URL da página',
    defaultOperator: 'contains',
    placeholder: '/oferta',
  },
  {
    value: 'utm_source',
    label: 'Origem da campanha',
    defaultOperator: 'equals',
    placeholder: 'instagram',
  },
  {
    value: 'utm_campaign',
    label: 'Nome da campanha',
    defaultOperator: 'equals',
    placeholder: 'black-friday',
  },
  {
    value: 'referrer_domain',
    label: 'Site de origem',
    defaultOperator: 'contains',
    placeholder: 'google.com',
  },
  {
    value: 'device_type',
    label: 'Dispositivo',
    defaultOperator: 'equals',
    placeholder: 'mobile',
  },
];

function valueForInput(rule: FunnelConditionRuleV1): string {
  if (rule.operator === 'exists' || rule.value === undefined) return '';
  if (Array.isArray(rule.value)) return rule.value.map(String).join(', ');
  if (rule.value === null) return 'null';
  return String(rule.value);
}

function parseValue(
  operator: FunnelRuleOperator,
  raw: string,
): FunnelScalar | FunnelScalar[] | undefined {
  if (operator === 'exists') return undefined;
  if (operator === 'in') {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }
  return raw;
}

function condition(
  field: FunnelRuleField,
  operator: FunnelRuleOperator,
  value?: FunnelScalar | FunnelScalar[],
): FunnelConditionRuleV1 {
  return {
    kind: 'condition',
    field,
    operator,
    ...(value === undefined ? {} : { value }),
  };
}

function simpleParts(rule: FunnelRuleV1): {
  event: FunnelConditionRuleV1 | null;
  conditions: FunnelConditionRuleV1[];
} | null {
  if (rule.kind === 'condition') {
    if (rule.field === 'event_name' && rule.operator === 'equals') {
      return { event: rule, conditions: [] };
    }
    return null;
  }

  if (rule.kind !== 'group' || rule.combinator !== 'all') return null;
  if (rule.rules.some((child) => child.kind !== 'condition')) return null;

  const items = rule.rules as FunnelConditionRuleV1[];
  const event =
    items.find(
      (item) => item.field === 'event_name' && item.operator === 'equals',
    ) ?? null;
  if (!event) return null;

  return {
    event,
    conditions: items.filter((item) => item !== event),
  };
}

function buildSimpleRule(
  event: FunnelConditionRuleV1,
  conditions: FunnelConditionRuleV1[],
): FunnelRuleV1 {
  if (conditions.length === 0) return event;
  return { kind: 'group', combinator: 'all', rules: [event, ...conditions] };
}

function SimpleRuleBuilder({
  rule,
  disabled,
  onChange,
  onOpenAdvanced,
}: {
  rule: FunnelRuleV1;
  disabled: boolean;
  onChange: (rule: FunnelRuleV1) => void;
  onOpenAdvanced: () => void;
}) {
  const parts = simpleParts(rule);

  if (!parts || !parts.event) {
    return (
      <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
        <p className="text-sm font-medium text-zinc-100">
          Esta etapa usa uma regra avançada.
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Abra o modo avançado para editar grupos, exceções ou condições mais
          técnicas sem perder a configuração existente.
        </p>
        <button
          className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          type="button"
          onClick={onOpenAdvanced}
        >
          Abrir modo avançado
        </button>
      </div>
    );
  }

  const eventValue = String(parts.event.value ?? '');
  const knownEvent = SIMPLE_EVENTS.some((item) => item.value === eventValue);
  const selectedEvent = knownEvent ? eventValue : '__custom__';

  function updateEvent(value: string) {
    const nextValue = value === '__custom__' ? eventValue || 'custom_event' : value;
    onChange(
      buildSimpleRule(
        condition('event_name', 'equals', nextValue),
        parts!.conditions,
      ),
    );
  }

  function updateCondition(index: number, next: FunnelConditionRuleV1) {
    const nextConditions = [...parts!.conditions];
    nextConditions[index] = next;
    onChange(buildSimpleRule(parts!.event!, nextConditions));
  }

  function removeCondition(index: number) {
    onChange(
      buildSimpleRule(
        parts!.event!,
        parts!.conditions.filter((_, itemIndex) => itemIndex !== index),
      ),
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <label className="grid gap-2 text-sm font-medium text-zinc-200">
          Quando a pessoa...
          <select
            aria-label="Ação da etapa"
            className={inputClass}
            disabled={disabled}
            value={selectedEvent}
            onChange={(event) => updateEvent(event.target.value)}
          >
            {SIMPLE_EVENTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {selectedEvent === '__custom__' ? (
          <label className="mt-3 grid gap-2 text-xs font-medium text-zinc-400">
            Nome do evento
            <input
              aria-label="Nome do evento"
              className={inputClass}
              disabled={disabled}
              value={eventValue}
              placeholder="meu_evento"
              onChange={(event) =>
                onChange(
                  buildSimpleRule(
                    condition('event_name', 'equals', event.target.value),
                    parts.conditions,
                  ),
                )
              }
            />
          </label>
        ) : null}
      </div>

      {parts.conditions.length > 0 ? (
        <div className="grid gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">E também...</p>
            <p className="mt-1 text-xs text-zinc-500">
              Use estas condições somente quando quiser restringir a etapa.
            </p>
          </div>

          {parts.conditions.map((item, index) => {
            const preset = SIMPLE_CONDITIONS.find(
              (option) => option.value === item.field,
            );
            return (
              <div
                className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 lg:grid-cols-[1fr_0.8fr_1.2fr_auto] lg:items-end"
                key={`${item.field}-${index}`}
              >
                <label className="grid gap-2 text-xs font-medium text-zinc-400">
                  Condição
                  <select
                    aria-label={`Condição ${index + 1}`}
                    className={inputClass}
                    disabled={disabled}
                    value={preset ? item.field : '__advanced__'}
                    onChange={(event) => {
                      if (event.target.value === '__advanced__') {
                        onOpenAdvanced();
                        return;
                      }
                      const nextPreset = SIMPLE_CONDITIONS.find(
                        (option) => option.value === event.target.value,
                      );
                      if (!nextPreset) return;
                      updateCondition(
                        index,
                        condition(
                          nextPreset.value,
                          nextPreset.defaultOperator,
                          valueForInput(item),
                        ),
                      );
                    }}
                  >
                    {SIMPLE_CONDITIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value="__advanced__">Outra condição…</option>
                  </select>
                </label>

                <label className="grid gap-2 text-xs font-medium text-zinc-400">
                  Como comparar
                  <select
                    aria-label={`Comparação ${index + 1}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.operator}
                    onChange={(event) => {
                      const operator = event.target.value as FunnelRuleOperator;
                      updateCondition(
                        index,
                        condition(
                          item.field,
                          operator,
                          parseValue(operator, valueForInput(item)),
                        ),
                      );
                    }}
                  >
                    {RULE_OPERATORS.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                </label>

                {item.operator === 'exists' ? (
                  <div className="pb-3 text-xs text-zinc-500">
                    Nenhum valor necessário.
                  </div>
                ) : (
                  <label className="grid gap-2 text-xs font-medium text-zinc-400">
                    Valor
                    <input
                      aria-label={`Valor da condição ${index + 1}`}
                      className={inputClass}
                      disabled={disabled}
                      value={valueForInput(item)}
                      placeholder={preset?.placeholder ?? 'valor'}
                      onChange={(event) =>
                        updateCondition(
                          index,
                          condition(
                            item.field,
                            item.operator,
                            parseValue(item.operator, event.target.value),
                          ),
                        )
                      }
                    />
                  </label>
                )}

                {!disabled ? (
                  <button
                    aria-label={`Remover condição ${index + 1}`}
                    className="h-10 rounded-lg border border-white/10 px-3 text-xs text-zinc-400 hover:bg-white/5"
                    type="button"
                    onClick={() => removeCondition(index)}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Adicionar condição"
            className={inputClass}
            defaultValue=""
            onChange={(event) => {
              const preset = SIMPLE_CONDITIONS.find(
                (option) => option.value === event.target.value,
              );
              event.currentTarget.value = '';
              if (!preset) return;
              onChange(
                buildSimpleRule(parts.event!, [
                  ...parts.conditions,
                  condition(preset.value, preset.defaultOperator, ''),
                ]),
              );
            }}
          >
            <option value="" disabled>
              + Adicionar condição
            </option>
            {SIMPLE_CONDITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5"
            type="button"
            onClick={onOpenAdvanced}
          >
            Modo avançado
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConditionEditor({
  rule,
  disabled,
  onChange,
}: {
  rule: FunnelConditionRuleV1;
  disabled: boolean;
  onChange: (rule: FunnelRuleV1) => void;
}) {
  const isCustomProperty = rule.field.startsWith('properties.');
  const fieldValue = isCustomProperty ? 'properties.*' : rule.field;

  return (
    <div className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 lg:grid-cols-[1.1fr_1fr_1.2fr]">
      <div className="grid gap-2">
        <label className="text-xs font-medium text-zinc-400">Campo</label>
        <select
          aria-label="Campo"
          className={inputClass}
          disabled={disabled}
          value={fieldValue}
          onChange={(event) => {
            const field =
              event.target.value === 'properties.*'
                ? ('properties.custom' as FunnelRuleField)
                : (event.target.value as FunnelRuleField);
            onChange({ ...rule, field });
          }}
        >
          {RULE_FIELDS.map((field) => (
            <option key={field.value} value={field.value}>
              {field.label}
            </option>
          ))}
          <option value="properties.*">Propriedade customizada</option>
        </select>
        {isCustomProperty ? (
          <input
            aria-label="Caminho da propriedade"
            className={inputClass}
            disabled={disabled}
            value={rule.field.slice('properties.'.length)}
            onChange={(event) =>
              onChange({
                ...rule,
                field: `properties.${event.target.value}` as FunnelRuleField,
              })
            }
            placeholder="product.category"
          />
        ) : null}
      </div>

      <label className="grid content-start gap-2 text-xs font-medium text-zinc-400">
        Operador
        <select
          aria-label="Operador"
          className={inputClass}
          disabled={disabled}
          value={rule.operator}
          onChange={(event) => {
            const operator = event.target.value as FunnelRuleOperator;
            const value = parseValue(operator, valueForInput(rule));
            onChange({
              kind: 'condition',
              field: rule.field,
              operator,
              ...(value === undefined ? {} : { value }),
            });
          }}
        >
          {RULE_OPERATORS.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </select>
      </label>

      {rule.operator === 'exists' ? (
        <div className="flex items-end pb-2 text-xs text-zinc-500">
          Sem valor necessário.
        </div>
      ) : (
        <label className="grid content-start gap-2 text-xs font-medium text-zinc-400">
          {rule.operator === 'in' ? 'Valores separados por vírgula' : 'Valor'}
          <input
            aria-label="Valor"
            className={inputClass}
            disabled={disabled}
            inputMode={
              ['gt', 'gte', 'lt', 'lte'].includes(rule.operator)
                ? 'decimal'
                : 'text'
            }
            value={valueForInput(rule)}
            onChange={(event) => {
              const value = parseValue(rule.operator, event.target.value);
              onChange({
                kind: 'condition',
                field: rule.field,
                operator: rule.operator,
                ...(value === undefined ? {} : { value }),
              });
            }}
          />
        </label>
      )}
    </div>
  );
}

function RuleNode({
  rule,
  disabled,
  depth,
  onChange,
  onRemove,
}: {
  rule: FunnelRuleV1;
  disabled: boolean;
  depth: number;
  onChange: (rule: FunnelRuleV1) => void;
  onRemove?: () => void;
}) {
  if (rule.kind === 'condition') {
    return (
      <div className="grid gap-2">
        <ConditionEditor disabled={disabled} rule={rule} onChange={onChange} />
        {onRemove && !disabled ? (
          <button
            className="justify-self-end text-xs text-rose-300"
            type="button"
            onClick={onRemove}
          >
            Remover condição
          </button>
        ) : null}
      </div>
    );
  }

  if (rule.kind === 'not') {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold tracking-wider text-amber-200">
            NÃO
          </span>
          {onRemove && !disabled ? (
            <button
              className="text-xs text-rose-300"
              type="button"
              onClick={onRemove}
            >
              Remover grupo
            </button>
          ) : null}
        </div>
        <RuleNode
          depth={depth + 1}
          disabled={disabled}
          rule={rule.rule}
          onChange={(next) => onChange({ kind: 'not', rule: next })}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Combinador do grupo"
          className={inputClass}
          disabled={disabled}
          value={rule.combinator}
          onChange={(event) =>
            onChange({
              ...rule,
              combinator: event.target.value as 'all' | 'any',
            })
          }
        >
          <option value="all">Todas as condições</option>
          <option value="any">Qualquer condição</option>
        </select>
        {onRemove && !disabled ? (
          <button
            className="text-xs text-rose-300"
            type="button"
            onClick={onRemove}
          >
            Remover grupo
          </button>
        ) : null}
      </div>

      <div className="grid gap-3">
        {rule.rules.map((child, index) => (
          <RuleNode
            key={`${child.kind}-${index}`}
            depth={depth + 1}
            disabled={disabled}
            rule={child}
            onChange={(next) => {
              const rules = [...rule.rules];
              rules[index] = next;
              onChange({ ...rule, rules });
            }}
            onRemove={
              rule.rules.length > 1
                ? () =>
                    onChange({
                      ...rule,
                      rules: rule.rules.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                : undefined
            }
          />
        ))}
      </div>

      {!disabled && depth < 5 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
            type="button"
            onClick={() =>
              onChange({ ...rule, rules: [...rule.rules, defaultRule()] })
            }
          >
            + Condição
          </button>
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
            type="button"
            onClick={() =>
              onChange({
                ...rule,
                rules: [
                  ...rule.rules,
                  { kind: 'group', combinator: 'all', rules: [defaultRule()] },
                ],
              })
            }
          >
            + Grupo
          </button>
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
            type="button"
            onClick={() =>
              onChange({
                ...rule,
                rules: [...rule.rules, { kind: 'not', rule: defaultRule() }],
              })
            }
          >
            + NÃO
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RuleBuilder({
  rule,
  disabled = false,
  onChange,
}: {
  rule: FunnelRuleV1;
  disabled?: boolean;
  onChange: (rule: FunnelRuleV1) => void;
}) {
  const supportsSimpleMode = useMemo(() => simpleParts(rule) !== null, [rule]);
  const [advanced, setAdvanced] = useState(!supportsSimpleMode);

  if (!advanced) {
    return (
      <SimpleRuleBuilder
        disabled={disabled}
        rule={rule}
        onChange={onChange}
        onOpenAdvanced={() => setAdvanced(true)}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <div>
          <p className="text-xs font-semibold text-zinc-300">Modo avançado</p>
          <p className="text-[11px] text-zinc-600">
            Para regras compostas, grupos, propriedades e operadores técnicos.
          </p>
        </div>
        {supportsSimpleMode ? (
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
            type="button"
            onClick={() => setAdvanced(false)}
          >
            Voltar ao modo simples
          </button>
        ) : null}
      </div>
      <RuleNode depth={1} disabled={disabled} rule={rule} onChange={onChange} />
    </div>
  );
}
