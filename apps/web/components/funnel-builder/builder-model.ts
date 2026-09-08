import type {
  FunnelDefinitionV1,
  FunnelRuleField,
  FunnelRuleOperator,
  FunnelRuleV1,
} from '@funnel/rule-engine';

export interface BuilderPosition {
  x: number;
  y: number;
}

export interface BuilderStep {
  id: string;
  name: string;
  step_key: string;
  position: number;
  rule: FunnelRuleV1;
  canvas: BuilderPosition;
}

export interface BuilderDraft {
  funnelId: string | null;
  baseVersion: number | null;
  name: string;
  description: string;
  conversionWindowSeconds: number;
  steps: BuilderStep[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface BuilderValidationIssue {
  stepId?: string;
  message: string;
}

export interface BuilderValidationResult {
  valid: boolean;
  issues: BuilderValidationIssue[];
  definition?: FunnelDefinitionV1;
}

export const RULE_FIELDS: ReadonlyArray<{
  value: FunnelRuleField;
  label: string;
}> = [
  { value: 'event_name', label: 'Evento' },
  { value: 'custom_event_name', label: 'Evento customizado' },
  { value: 'page_url', label: 'URL da página' },
  { value: 'page_path', label: 'Caminho da página' },
  { value: 'page_title', label: 'Título da página' },
  { value: 'origin_host', label: 'Host de origem' },
  { value: 'referrer_domain', label: 'Domínio de referência' },
  { value: 'utm_source', label: 'UTM Source' },
  { value: 'utm_medium', label: 'UTM Medium' },
  { value: 'utm_campaign', label: 'UTM Campaign' },
  { value: 'utm_content', label: 'UTM Content' },
  { value: 'utm_term', label: 'UTM Term' },
  { value: 'device_type', label: 'Dispositivo' },
  { value: 'browser_name', label: 'Navegador' },
  { value: 'os_name', label: 'Sistema operacional' },
  { value: 'language', label: 'Idioma' },
  { value: 'timezone', label: 'Timezone' },
  { value: 'test_mode', label: 'Modo de teste' },
];

export const RULE_OPERATORS: ReadonlyArray<{
  value: FunnelRuleOperator;
  label: string;
}> = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'não é igual a' },
  { value: 'contains', label: 'contém' },
  { value: 'starts_with', label: 'começa com' },
  { value: 'ends_with', label: 'termina com' },
  { value: 'exists', label: 'existe' },
  { value: 'in', label: 'está em' },
  { value: 'gt', label: 'maior que' },
  { value: 'gte', label: 'maior ou igual a' },
  { value: 'lt', label: 'menor que' },
  { value: 'lte', label: 'menor ou igual a' },
];

export const CONVERSION_WINDOWS = [
  { value: 1800, label: '30 minutos' },
  { value: 3600, label: '1 hora' },
  { value: 86400, label: '24 horas' },
  { value: 604800, label: '7 dias' },
  { value: 2592000, label: '30 dias' },
  { value: 7776000, label: '90 dias' },
] as const;

export function defaultRule(): FunnelRuleV1 {
  return {
    kind: 'condition',
    field: 'event_name',
    operator: 'equals',
    value: 'page_view',
  };
}

export function slugifyStepKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}
