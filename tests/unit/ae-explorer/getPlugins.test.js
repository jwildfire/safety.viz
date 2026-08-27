// Presentation helpers for the ae-explorer module (#60): the group color
// scale, hover text builders, and the validation-mode summarized-data CSV.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, syncSettings } from '../../../src/ae-explorer/configure.js';
import {
  cellTitle,
  colorScale,
  csvName,
  diffTitle,
  dotTitle,
  emptyState,
  NO_MATCH_MESSAGE,
  summaryCsv
} from '../../../src/ae-explorer/getPlugins.js';
import { flagPlaceholders } from '../../../src/ae-explorer/structureData.js';
import { AE_ROWS } from './fixtures.js';

describe('ae-explorer getPlugins', () => {
  it('AE-CFG-006: groups color in configured order and the Total column always renders gray (#60)', () => {
    const color = colorScale(['A', 'B'], ['#111111', '#222222']);
    expect(color('A')).toBe('#111111');
    expect(color('B')).toBe('#222222');
    expect(color('Total')).toBe('#777');
  });

  it('AE-REG-040: the default palette carries no yellow for any group position (#60)', () => {
    DEFAULT_SETTINGS.colors.forEach((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      // Yellow reads as high red + high green + low blue.
      expect(r > 200 && g > 200 && b < 120).toBe(false);
    });
  });

  it('AE-USER-010/AE-REG-015: group cells title with numerator over denominator (#60)', () => {
    expect(cellTitle({ n: 2, tot: 4, per: 50 })).toBe('2/4');
  });

  it('AE-REG-016: rate dots title with the group and its percentage (#60)', () => {
    expect(dotTitle('Placebo', { n: 1, tot: 3, per: 33.3 })).toBe('Placebo: 33.3%');
  });

  it('AE-USER-011/AE-REG-017: difference marks title with both groups compared and the difference (#60)', () => {
    const title = diffTitle(
      { group1: 'A', group2: 'B', diff: 16.7, lower: -55.8, upper: 89.1, sig: 0 },
      { A: { n: 2, tot: 4, per: 50 }, B: { n: 1, tot: 3, per: 33.3 } }
    );
    expect(title).toContain('A: 50.0% (2/4)');
    expect(title).toContain('B: 33.3% (1/3)');
    expect(title).toContain('16.7');
  });

  it('AE-REG-027/AE-REG-028/AE-REG-029: the CSV downloads as major-minor-summary basis (#60)', () => {
    expect(csvName(syncSettings({}))).toBe('AEBODSYS-AEDECOD-participant.csv');
    expect(csvName(syncSettings({ summarize_by: 'event' }))).toBe('AEBODSYS-AEDECOD-event.csv');
  });

  it('AE-USER-020/AE-REG-030: the summarized CSV carries one row per category per group as currently summarized (#60)', () => {
    const majors = [
      {
        key: 'Cardiac disorders',
        cells: { A: { n: 2, tot: 4, per: 50 } },
        minors: [{ key: 'Palpitations', cells: { A: { n: 1, tot: 4, per: 25 } } }]
      }
    ];
    const csv = summaryCsv(majors, ['A']);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('major,minor,group,n,total,percent');
    expect(lines).toContain('"Cardiac disorders","","A",2,4,50');
    expect(lines).toContain('"Cardiac disorders","Palpitations","A",1,4,25');
    expect(lines).toHaveLength(3);
  });

  // An empty summary table used to say one thing for three different
  // clinical situations (RhoInc/aeexplorer#153: "Currently can't distinguish
  // between the absence of AEs and the absence of subjects.").
  describe('empty states', () => {
    const settings = syncSettings({});
    const flagged = flagPlaceholders(AE_ROWS, settings);
    const placeholders = flagged.filter((row) => row.__ae_placeholder);
    const recorded = flagged.filter((row) => !row.__ae_placeholder);

    it('AE-USER-021: a table with events to draw is not an empty state (#136)', () => {
      expect(
        emptyState({ populationRows: flagged, eventRows: recorded, allRows: flagged }, settings)
      ).toBeNull();
    });

    it('AE-USER-021: an empty population reports no matching participants against the full denominator (#136)', () => {
      const empty = emptyState({ populationRows: [], eventRows: [], allRows: flagged }, settings);
      expect(empty.kind).toBe('no-participants');
      expect(empty.text).toBe(
        'No participants are in the current selection: none of the 7 participants in the data match the participant filters. Widen a participant filter to see results.'
      );
    });

    it('AE-USER-022: a population of placeholder rows only reports an event-free study (#136)', () => {
      const empty = emptyState(
        { populationRows: placeholders, eventRows: [], allRows: placeholders },
        settings
      );
      expect(empty.kind).toBe('no-events-in-study');
      expect(empty.text).toBe(
        'No adverse events have been recorded in this study: all 2 participants are event-free.'
      );
    });

    it('AE-USER-022: a filtered selection of AE-free participants reports its own participant count (#136)', () => {
      const one = emptyState(
        { populationRows: placeholders.slice(0, 1), eventRows: [], allRows: flagged },
        settings
      );
      expect(one.kind).toBe('no-events-for-selection');
      expect(one.text).toBe(
        'No adverse events have been recorded for the 1 participant in the current selection.'
      );
      const two = emptyState(
        { populationRows: placeholders, eventRows: [], allRows: flagged },
        settings
      );
      expect(two.kind).toBe('no-events-for-selection');
      expect(two.text).toBe(
        'No adverse events have been recorded for the 2 participants in the current selection.'
      );
    });

    it('AE-REG-014: events excluded by the active event filters keep the original wording (#136)', () => {
      const empty = emptyState(
        { populationRows: flagged, eventRows: [], allRows: flagged },
        settings
      );
      expect(empty.kind).toBe('filtered-out');
      expect(empty.text).toBe(NO_MATCH_MESSAGE);
      expect(NO_MATCH_MESSAGE).toBe(
        'Error: No AEs found for the current filters. Update the filters to see results.'
      );
    });
  });
});
