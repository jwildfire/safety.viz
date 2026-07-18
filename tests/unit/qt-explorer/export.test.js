import { describe, it, expect } from 'vitest';
import safetyViz, { qtExplorer } from '../../../src/main.js';

describe('qt-explorer module export', () => {
  it('QT-API-001: the public collection exposes the qtExplorer factory', () => {
    expect(typeof qtExplorer).toBe('function');
    expect(typeof safetyViz.qtExplorer).toBe('function');
    expect(safetyViz.qtExplorer).toBe(qtExplorer);
  });
});
