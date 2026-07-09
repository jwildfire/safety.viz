import { describe, it, expect } from 'vitest';
import safetyViz from '../../src/main.js';

describe('safety.viz scaffold', () => {
  it('src/main.js exports the public module collection (#1)', () => {
    expect(safetyViz).toBeDefined();
    expect(typeof safetyViz).toBe('object');
  });
});
