'use client';

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

function valueForInput(rule: FunnelConditionRuleV1): string {
  if (rule.operator === 'exists' || rule.value === undefined) return '';
  if (Array.isArray(rule.value)) return rule.value.map(String).join(', ');
  if (rule.value === null) return 'null';
  return String(rule.value);
}

function parseValue(operator: FunnelRuleOperator, raw: string): FunnelScalar | FunnelScalar[] | undefined {
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
        <div className="flex items-end pb-2 text-xs text-zinc-500">Sem valor necessário.</div>
      ) : (
        <label className="grid content-start gap-2 text-xs font-medium text-zinc-400">
          {rule.operator === 'in' ? 'Valores separados por vírgula' : 'Valor'}
          <input
            className={inputClass}
            disabled={disabled}
            inputMode={['gt', 'gte', 'lt', 'lte'].includes(rule.operator) ? 'decimal' : 'text'}
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
          <button className="justify-self-end text-xs text-rose-300" type="button" onClick={onRemove}>
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
          <span className="text-xs font-semibold tracking-wider text-amber-200">NOT</span>
          {onRemove && !disabled ? (
            <button className="text-xs text-rose-300" type="button" onClick={onRemove}>
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
          <option value="all">ALL · todas</option>
          <option value="any">ANY · qualquer</option>
        </select>
        {onRemove && !disabled ? (
          <button className="text-xs text-rose-300" type="button" onClick={onRemove}>
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
                      rules: rule.rules.filter((_, itemIndex) => itemIndex !== index),
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
            onClick={() => onChange({ ...rule, rules: [...rule.rules, defaultRule()] })}
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
            + NOT
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
  return <RuleNode depth={1} disabled={disabled} rule={rule} onChange={onChange} />;
}
