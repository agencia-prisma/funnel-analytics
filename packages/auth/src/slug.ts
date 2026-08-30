const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

export function normalizeWorkspaceSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(EDGE_DASHES, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
}

export function createWorkspaceSlugCandidate(
  name: string,
  suffix?: string,
): string {
  const base = normalizeWorkspaceSlug(name) || 'workspace';

  if (!suffix) {
    return base;
  }

  return `${base.slice(0, Math.max(1, 72 - suffix.length - 1))}-${suffix}`;
}
