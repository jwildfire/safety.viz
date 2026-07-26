import { describe, it, expect } from 'vitest';
import safetyViz, { hepWaterfall } from '../../../src/main.js';

describe('hep-waterfall module export', () => {
  it('HWF-API-001: the public collection exposes the hepWaterfall factory (#93)', () => {
    expect(typeof hepWaterfall).toBe('function');
    expect(typeof safetyViz.hepWaterfall).toBe('function');
    expect(safetyViz.hepWaterfall).toBe(hepWaterfall);
  });
});
