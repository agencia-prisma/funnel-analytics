import { describe, expect, it } from 'vitest';

import { createWorkspaceSlugCandidate, normalizeWorkspaceSlug } from './slug';

describe('workspace slug', () => {
  it('normalizes accents, spaces and punctuation', () => {
    expect(normalizeWorkspaceSlug('  Prisma Grõup!  ')).toBe('prisma-group');
  });

  it('falls back to a stable base for names without slug characters', () => {
    expect(createWorkspaceSlugCandidate('---')).toBe('workspace');
  });

  it('adds a collision suffix without exceeding the maximum length', () => {
    const slug = createWorkspaceSlugCandidate('A'.repeat(100), 'a1b2c3');
    expect(slug.endsWith('-a1b2c3')).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(72);
  });
});
