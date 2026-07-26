import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/participant-profile/configure.js';
import { rankParticipants } from '../../../src/participant-profile/structureData.js';
import { cleanData, deriveBaseline } from '../../../src/hep-core/rows.js';
import { makeRows } from './fixture.js';

const settings = syncSettings({});
const rows = deriveBaseline(cleanData(makeRows(), settings).rows, settings);

describe('rankParticipants — worst-first cohort ordering (PPRF-5, PPRF-STEP-002)', () => {
  it("orders by on-treatment quadrant severity: Hy's Law > Temple's Corollary > Normal", () => {
    // P1 Hy's Law, P2 Temple's Corollary, P3 Normal & NN (via buildHepSubjects).
    expect(rankParticipants(rows, ['P3', 'P2', 'P1'], settings)).toEqual(['P1', 'P2', 'P3']);
  });

  it('breaks a quadrant tie by peak ALT xULN, descending', () => {
    // P6 and P1 are both Hy's Law; P6 peaks at 6 xULN vs P1's 4 xULN.
    expect(rankParticipants(rows, ['P1', 'P6'], settings)).toEqual(['P6', 'P1']);
  });

  it('falls back to peak severity for ids the reduction excludes, after ranked ids', () => {
    // P4/P5 carry no TB rows so buildHepSubjects excludes them; their fallback
    // scores are peak ALT xULN / cut = 5/3 and 2/3, so P4 outranks P5, and both
    // sort after every quadrant-ranked id.
    expect(rankParticipants(rows, ['P5', 'P4', 'P3', 'P1'], settings)).toEqual([
      'P1',
      'P3',
      'P4',
      'P5'
    ]);
  });

  it('breaks remaining ties by id ascending, deterministically', () => {
    // P7 is P3's exact twin (same quadrant, same peak ALT).
    expect(rankParticipants(rows, ['P7', 'P3'], settings)).toEqual(['P3', 'P7']);
    expect(rankParticipants(rows, ['P3', 'P7'], settings)).toEqual(['P3', 'P7']);
  });

  it('returns ids untouched by rank when the list has one entry', () => {
    expect(rankParticipants(rows, ['P2'], settings)).toEqual(['P2']);
  });
});
