import { describe, it, expect } from 'vitest';
import SafetyViz, { resultsOverTime } from '../../../src/main.js';

// The module registers itself in the public collection (#27), mirroring the
// histogram export (SROT-API, module scheme).

describe('results-over-time export', () => {
  it('SROT-API: main.js exports the resultsOverTime factory (#27)', () => {
    expect(typeof resultsOverTime).toBe('function');
    expect(typeof SafetyViz.resultsOverTime).toBe('function');
  });
});
