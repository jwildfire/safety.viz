import { describe, it, expect } from 'vitest';
import safetyViz, { outlierExplorer } from '../../../src/main.js';

describe('outlier-explorer module export', () => {
  it('SOE-API-001: the public collection exposes the outlierExplorer factory (#24)', () => {
    expect(typeof outlierExplorer).toBe('function');
    expect(typeof safetyViz.outlierExplorer).toBe('function');
  });
});
