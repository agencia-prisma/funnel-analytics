import { describe, expect, it } from 'vitest';

import { analyticsChangePct } from './analytics-math';

describe('analyticsChangePct', () => {
  it('calculates positive and negative changes', () => {
    expect(analyticsChangePct(120, 100)).toBe(20);
    expect(analyticsChangePct(75, 100)).toBe(-25);
  });

  it('returns zero when both periods are zero', () => {
    expect(analyticsChangePct(0, 0)).toBe(0);
  });

  it('returns null when the current period has data without a previous baseline', () => {
    expect(analyticsChangePct(10, 0)).toBeNull();
  });

  it('keeps two decimal places of precision', () => {
    expect(analyticsChangePct(2, 3)).toBe(-33.33);
  });
});
