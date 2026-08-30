import { describe, expect, it } from 'vitest';

import { TEST_NOW, validBatch } from './test-fixtures';
import { validateEventBatch } from './validation';

describe('Collector performance smoke', () => {
  it('validates 500 small batches without a gross regression', () => {
    const startedAt = performance.now();

    for (let index = 0; index < 500; index += 1) {
      const batch = validBatch();
      batch.events[0].event_id =
        `018bcfe5-6800-7000-8000-${String(index + 1).padStart(12, '0')}`;

      validateEventBatch(batch, TEST_NOW);
    }

    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });
});
