export const DOMAIN_ERROR_CODES = [
  'AUTH_REQUIRED',
  'WORKSPACE_NOT_FOUND',
  'WORKSPACE_ACCESS_DENIED',
  'WORKSPACE_MEMBER_NOT_FOUND',
  'WORKSPACE_INVALID',
  'INSUFFICIENT_PERMISSION',
  'INVITATION_INVALID',
  'INVITATION_EXPIRED',
  'INVITATION_ALREADY_USED',
  'INVITATION_ALREADY_MEMBER',
  'INVITATION_DUPLICATE',
  'INVITATION_EMAIL_MISMATCH',
  'LAST_OWNER_PROTECTION',
  'PIXEL_NOT_FOUND',
  'PIXEL_ACCESS_DENIED',
  'PIXEL_INVALID_NAME',
  'PIXEL_ARCHIVED',
  'PIXEL_IMMUTABLE_FIELD',
  'DOMAIN_INVALID',
  'DOMAIN_DUPLICATE',
  'DOMAIN_NOT_FOUND',
  'FUNNEL_NOT_FOUND',
  'FUNNEL_ARCHIVED',
  'FUNNEL_INVALID',
  'FUNNEL_STEPS_INVALID',
  'FUNNEL_STEP_KEY_DUPLICATE',
  'FUNNEL_VERSION_CONFLICT',
  'FUNNEL_DEFINITION_INVALID',
  'FUNNEL_RULE_INVALID',
  'FUNNEL_RULE_TOO_COMPLEX',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

const DOMAIN_MESSAGES: Record<DomainErrorCode, string> = {
  AUTH_REQUIRED: 'Faça login para continuar.',
  WORKSPACE_NOT_FOUND: 'Workspace não encontrado.',
  WORKSPACE_ACCESS_DENIED: 'Você não tem acesso a este Workspace.',
  WORKSPACE_MEMBER_NOT_FOUND: 'Membro não encontrado neste Workspace.',
  WORKSPACE_INVALID: 'Revise os dados do Workspace e tente novamente.',
  INSUFFICIENT_PERMISSION: 'Você não tem permissão para realizar esta ação.',
  INVITATION_INVALID: 'Este convite é inválido ou não está mais disponível.',
  INVITATION_EXPIRED: 'Este convite expirou.',
  INVITATION_ALREADY_USED: 'Este convite já foi utilizado.',
  INVITATION_ALREADY_MEMBER: 'Este e-mail já pertence ao Workspace.',
  INVITATION_DUPLICATE: 'Já existe um convite pendente para este e-mail.',
  INVITATION_EMAIL_MISMATCH: 'Entre com o mesmo e-mail que recebeu o convite.',
  LAST_OWNER_PROTECTION:
    'O Workspace precisa manter pelo menos um Owner ativo.',
  PIXEL_NOT_FOUND: 'Pixel não encontrado.',
  PIXEL_ACCESS_DENIED: 'Você não tem acesso a este Pixel.',
  PIXEL_INVALID_NAME: 'Informe um nome válido para o Pixel.',
  PIXEL_ARCHIVED: 'Este Pixel está arquivado e não pode ser alterado.',
  PIXEL_IMMUTABLE_FIELD: 'A identidade do Pixel não pode ser alterada.',
  DOMAIN_INVALID: 'Informe um domínio válido.',
  DOMAIN_DUPLICATE: 'Este domínio já está cadastrado no Pixel.',
  DOMAIN_NOT_FOUND: 'Domínio não encontrado.',
  FUNNEL_NOT_FOUND: 'Funil não encontrado neste Workspace.',
  FUNNEL_ARCHIVED: 'Este funil está arquivado e não pode ser alterado.',
  FUNNEL_INVALID: 'Revise os dados do funil e tente novamente.',
  FUNNEL_STEPS_INVALID: 'Revise as etapas antes de publicar.',
  FUNNEL_STEP_KEY_DUPLICATE: 'Cada etapa precisa ter uma chave única.',
  FUNNEL_VERSION_CONFLICT:
    'Uma versão mais recente deste funil foi publicada. Recarregue antes de continuar.',
  FUNNEL_DEFINITION_INVALID: 'A definição do funil não é válida.',
  FUNNEL_RULE_INVALID: 'Uma ou mais regras do funil são inválidas.',
  FUNNEL_RULE_TOO_COMPLEX: 'Uma regra ultrapassou o limite de complexidade.',
};

export function extractDomainErrorCode(error: unknown): DomainErrorCode | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error ?? '');

  return DOMAIN_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

export function domainErrorMessage(error: unknown): string {
  const code = extractDomainErrorCode(error);

  if (code) {
    return DOMAIN_MESSAGES[code];
  }

  return 'Não foi possível concluir a ação. Tente novamente.';
}
