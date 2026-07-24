import { describe, it, expect } from 'vitest';
import safetyViz, { participantProfile } from '../../../src/main.js';

describe('participant-profile module export (PPRF-CORE-001) (#98)', () => {
  it('PPRF-1: the public collection exposes the participantProfile factory', () => {
    expect(typeof participantProfile).toBe('function');
    expect(typeof safetyViz.participantProfile).toBe('function');
    expect(safetyViz.participantProfile).toBe(participantProfile);
  });
});
