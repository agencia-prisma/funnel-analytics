export const FUNNEL_DEFINITION_VERSION = 1 as const;
export const FUNNEL_MODE_ORDERED = 'ordered' as const;
export const FUNNEL_MIN_STEPS = 2;
export const FUNNEL_MAX_STEPS = 20;
export const FUNNEL_MIN_CONVERSION_WINDOW_SECONDS = 60;
export const FUNNEL_MAX_CONVERSION_WINDOW_SECONDS = 7_776_000;
export const FUNNEL_DEFAULT_CONVERSION_WINDOW_SECONDS = 2_592_000;
export const FUNNEL_MAX_RULE_DEPTH = 5;
export const FUNNEL_MAX_RULE_NODES = 25;

export type FunnelScalar = string | number | boolean | null;

export type FunnelRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'exists'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type FunnelStaticRuleField =
  | 'event_name'
  | 'custom_event_name'
  | 'page_url'
  | 'page_path'
  | 'page_title'
  | 'origin_host'
  | 'referrer_domain'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_content'
  | 'utm_term'
  | 'device_type'
  | 'browser_name'
  | 'os_name'
  | 'language'
  | 'timezone'
  | 'test_mode';

export type FunnelRuleField = FunnelStaticRuleField | `properties.${string}`;

export interface FunnelConditionRuleV1 {
  kind: 'condition';
  field: FunnelRuleField;
  operator: FunnelRuleOperator;
  value?: FunnelScalar | FunnelScalar[];
}

export interface FunnelGroupRuleV1 {
  kind: 'group';
  combinator: 'all' | 'any';
  rules: FunnelRuleV1[];
}

export interface FunnelNotRuleV1 {
  kind: 'not';
  rule: FunnelRuleV1;
}

export type FunnelRuleV1 =
  FunnelConditionRuleV1 | FunnelGroupRuleV1 | FunnelNotRuleV1;

export interface FunnelStepDefinitionV1 {
  step_key: string;
  name: string;
  rule: FunnelRuleV1;
}

export interface FunnelDefinitionV1 {
  definition_version: 1;
  mode: 'ordered';
  conversion_window_seconds: number;
  steps: FunnelStepDefinitionV1[];
}

export interface FunnelEventV1 {
  event_name: string;
  custom_event_name: string | null;
  page_url: string;
  page_path: string;
  page_title: string;
  origin_host: string;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  device_type: string;
  browser_name: string;
  os_name: string;
  language: string | null;
  timezone: string | null;
  test_mode: boolean;
  properties: Record<string, unknown>;
}

export class RuleEngineError extends Error {
  constructor(
    readonly code:
      | 'FUNNEL_DEFINITION_INVALID'
      | 'FUNNEL_RULE_INVALID'
      | 'FUNNEL_RULE_TOO_COMPLEX',
  ) {
    super(code);
    this.name = 'RuleEngineError';
  }
}

const STATIC_FIELDS = new Set<FunnelStaticRuleField>([
  'event_name',
  'custom_event_name',
  'page_url',
  'page_path',
  'page_title',
  'origin_host',
  'referrer_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'device_type',
  'browser_name',
  'os_name',
  'language',
  'timezone',
  'test_mode',
]);

const VALUE_OPERATORS = new Set<FunnelRuleOperator>([
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'ends_with',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
]);

const FORBIDDEN_PROPERTY_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is FunnelScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRuleField(value: unknown): value is FunnelRuleField {
  if (typeof value !== 'string') return false;
  if (STATIC_FIELDS.has(value as FunnelStaticRuleField)) return true;
  if (!value.startsWith('properties.') || value.length > 180) return false;

  const path = value.slice('properties.'.length);
  if (!path || path.startsWith('.') || path.endsWith('.')) return false;

  const segments = path.split('.');
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment.length <= 80 &&
      !FORBIDDEN_PROPERTY_SEGMENTS.has(segment),
  );
}

function validateCondition(
  rule: Record<string, unknown>,
): FunnelConditionRuleV1 {
  if (!isRuleField(rule.field)) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  const operator = rule.operator;
  if (
    typeof operator !== 'string' ||
    ![
      'equals',
      'not_equals',
      'contains',
      'starts_with',
      'ends_with',
      'exists',
      'in',
      'gt',
      'gte',
      'lt',
      'lte',
    ].includes(operator)
  ) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  const typedOperator = operator as FunnelRuleOperator;
  if (typedOperator === 'exists') {
    if ('value' in rule && rule.value !== undefined) {
      throw new RuleEngineError('FUNNEL_RULE_INVALID');
    }

    return {
      kind: 'condition',
      field: rule.field,
      operator: typedOperator,
    };
  }

  if (!VALUE_OPERATORS.has(typedOperator)) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  if (typedOperator === 'in') {
    if (
      !Array.isArray(rule.value) ||
      rule.value.length === 0 ||
      rule.value.length > 50 ||
      !rule.value.every(isScalar)
    ) {
      throw new RuleEngineError('FUNNEL_RULE_INVALID');
    }

    return {
      kind: 'condition',
      field: rule.field,
      operator: typedOperator,
      value: [...rule.value] as FunnelScalar[],
    };
  }

  if (!isScalar(rule.value)) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  if (
    ['contains', 'starts_with', 'ends_with'].includes(typedOperator) &&
    typeof rule.value !== 'string'
  ) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  if (
    ['gt', 'gte', 'lt', 'lte'].includes(typedOperator) &&
    typeof rule.value !== 'number'
  ) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  return {
    kind: 'condition',
    field: rule.field,
    operator: typedOperator,
    value: rule.value,
  };
}

function validateRuleNode(
  input: unknown,
  depth: number,
  counter: { nodes: number },
): FunnelRuleV1 {
  if (!isRecord(input)) {
    throw new RuleEngineError('FUNNEL_RULE_INVALID');
  }

  counter.nodes += 1;
  if (depth > FUNNEL_MAX_RULE_DEPTH || counter.nodes > FUNNEL_MAX_RULE_NODES) {
    throw new RuleEngineError('FUNNEL_RULE_TOO_COMPLEX');
  }

  if (input.kind === 'condition') {
    return validateCondition(input);
  }

  if (input.kind === 'not') {
    return {
      kind: 'not',
      rule: validateRuleNode(input.rule, depth + 1, counter),
    };
  }

  if (input.kind === 'group') {
    if (
      !['all', 'any'].includes(String(input.combinator)) ||
      !Array.isArray(input.rules) ||
      input.rules.length < 1 ||
      input.rules.length > FUNNEL_MAX_RULE_NODES
    ) {
      throw new RuleEngineError('FUNNEL_RULE_INVALID');
    }

    return {
      kind: 'group',
      combinator: input.combinator as 'all' | 'any',
      rules: input.rules.map((rule) =>
        validateRuleNode(rule, depth + 1, counter),
      ),
    };
  }

  throw new RuleEngineError('FUNNEL_RULE_INVALID');
}

export function validateFunnelRule(input: unknown): FunnelRuleV1 {
  return validateRuleNode(input, 1, { nodes: 0 });
}

export function validateFunnelDefinition(input: unknown): FunnelDefinitionV1 {
  if (!isRecord(input)) {
    throw new RuleEngineError('FUNNEL_DEFINITION_INVALID');
  }

  if (
    input.definition_version !== FUNNEL_DEFINITION_VERSION ||
    input.mode !== FUNNEL_MODE_ORDERED ||
    !Number.isInteger(input.conversion_window_seconds) ||
    Number(input.conversion_window_seconds) <
      FUNNEL_MIN_CONVERSION_WINDOW_SECONDS ||
    Number(input.conversion_window_seconds) >
      FUNNEL_MAX_CONVERSION_WINDOW_SECONDS ||
    !Array.isArray(input.steps) ||
    input.steps.length < FUNNEL_MIN_STEPS ||
    input.steps.length > FUNNEL_MAX_STEPS
  ) {
    throw new RuleEngineError('FUNNEL_DEFINITION_INVALID');
  }

  const keys = new Set<string>();
  const steps = input.steps.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new RuleEngineError('FUNNEL_DEFINITION_INVALID');
    }

    const stepKey = candidate.step_key;
    const name = candidate.name;
    if (
      typeof stepKey !== 'string' ||
      !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(stepKey) ||
      stepKey.length > 64 ||
      keys.has(stepKey) ||
      typeof name !== 'string' ||
      name.trim().length < 1 ||
      name.trim().length > 120
    ) {
      throw new RuleEngineError('FUNNEL_DEFINITION_INVALID');
    }

    keys.add(stepKey);
    return {
      step_key: stepKey,
      name: name.trim(),
      rule: validateFunnelRule(candidate.rule),
    };
  });

  return {
    definition_version: FUNNEL_DEFINITION_VERSION,
    mode: FUNNEL_MODE_ORDERED,
    conversion_window_seconds: Number(input.conversion_window_seconds),
    steps,
  };
}

function own(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function propertyValue(
  properties: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = properties;
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = own(current, segment);
  }
  return current;
}

function fieldValue(event: FunnelEventV1, field: FunnelRuleField): unknown {
  if (field.startsWith('properties.')) {
    return propertyValue(event.properties, field.slice('properties.'.length));
  }

  return event[field as FunnelStaticRuleField];
}

function compareScalar(left: unknown, right: FunnelScalar): boolean {
  return isScalar(left) && left === right;
}

function evaluateCondition(
  rule: FunnelConditionRuleV1,
  event: FunnelEventV1,
): boolean {
  const actual = fieldValue(event, rule.field);

  switch (rule.operator) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'equals':
      return compareScalar(actual, rule.value as FunnelScalar);
    case 'not_equals':
      return !compareScalar(actual, rule.value as FunnelScalar);
    case 'contains':
      return (
        typeof actual === 'string' && actual.includes(rule.value as string)
      );
    case 'starts_with':
      return (
        typeof actual === 'string' && actual.startsWith(rule.value as string)
      );
    case 'ends_with':
      return (
        typeof actual === 'string' && actual.endsWith(rule.value as string)
      );
    case 'in':
      return (rule.value as FunnelScalar[]).some((value) =>
        compareScalar(actual, value),
      );
    case 'gt':
      return typeof actual === 'number' && actual > (rule.value as number);
    case 'gte':
      return typeof actual === 'number' && actual >= (rule.value as number);
    case 'lt':
      return typeof actual === 'number' && actual < (rule.value as number);
    case 'lte':
      return typeof actual === 'number' && actual <= (rule.value as number);
  }
}

export function evaluateFunnelRule(
  rule: FunnelRuleV1,
  event: FunnelEventV1,
): boolean {
  if (rule.kind === 'condition') {
    return evaluateCondition(rule, event);
  }

  if (rule.kind === 'not') {
    return !evaluateFunnelRule(rule.rule, event);
  }

  return rule.combinator === 'all'
    ? rule.rules.every((candidate) => evaluateFunnelRule(candidate, event))
    : rule.rules.some((candidate) => evaluateFunnelRule(candidate, event));
}

export function matchingFunnelStepKeys(
  definition: FunnelDefinitionV1,
  event: FunnelEventV1,
): string[] {
  return definition.steps
    .filter((step) => evaluateFunnelRule(step.rule, event))
    .map((step) => step.step_key);
}
