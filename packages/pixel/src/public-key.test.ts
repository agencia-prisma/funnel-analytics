import { describe, expect, it } from 'vitest';

import { generatePixelPublicKey, isPixelPublicKey } from './public-key';

describe('pixel public key', () => {
  it('generates a friendly key with strong random material', () => {
    const first = generatePixelPublicKey();
    const second = generatePixelPublicKey();

    expect(first).not.toBe(second);
    expect(isPixelPublicKey(first)).toBe(true);
    expect(first).toHaveLength(43);
  });
});
