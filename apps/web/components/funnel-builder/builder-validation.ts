import { RuleEngineError, validateFunnelDefinition } from '@funnel/rule-engine';

import { builderDraftToDefinition } from './builder-adapter';
import type {
  BuilderDraft,
  BuilderValidationIssue,
  BuilderValidationResult,
} from './builder-model';

export function validateBuilderDraft(
  draft: BuilderDraft,
): BuilderValidationResult {
  const issues: BuilderValidationIssue[] = [];

  if (!draft.name.trim() || draft.name.trim().length > 120) {
    issues.push({
      message: 'Informe um nome de funil com até 120 caracteres.',
    });
  }

  if (draft.description.length > 2000) {
    issues.push({
      message: 'A descrição deve ter no máximo 2.000 caracteres.',
    });
  }

  const keys = new Set<string>();
  for (const step of draft.steps) {
    if (!step.name.trim()) {
      issues.push({ stepId: step.id, message: 'A etapa precisa de um nome.' });
    }
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(step.step_key)) {
      issues.push({
        stepId: step.id,
        message:
          'A chave deve usar apenas letras minúsculas, números e underscore.',
      });
    }
    if (keys.has(step.step_key)) {
      issues.push({
        stepId: step.id,
        message: 'A chave da etapa está duplicada.',
      });
    }
    keys.add(step.step_key);
  }

  if (issues.length) return { valid: false, issues };

  try {
    const definition = validateFunnelDefinition(
      builderDraftToDefinition(draft),
    );
    return { valid: true, issues: [], definition };
  } catch (error) {
    const message =
      error instanceof RuleEngineError &&
      error.code === 'FUNNEL_RULE_TOO_COMPLEX'
        ? 'Uma regra ultrapassou o limite de profundidade ou quantidade de condições.'
        : error instanceof RuleEngineError &&
            error.code === 'FUNNEL_RULE_INVALID'
          ? 'Uma ou mais regras possuem campo, operador ou valor inválido.'
          : 'O funil precisa ter entre 2 e 20 etapas e uma janela de conversão válida.';
    return { valid: false, issues: [{ message }] };
  }
}
