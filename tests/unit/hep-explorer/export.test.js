import { describe, it, expect } from 'vitest';
import safetyViz, { hepExplorer } from '../../../src/main.js';

describe('hep-explorer module export', () => {
  it('HEP-API-001: the public collection exposes the hepExplorer factory (port)', () => {
    expect(typeof hepExplorer).toBe('function');
    expect(typeof safetyViz.hepExplorer).toBe('function');
    expect(safetyViz.hepExplorer).toBe(hepExplorer);
  });
});
