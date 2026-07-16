// Data structuring for the ae-explorer module (#60): the placeholder-row
// denominator model, the SOC → PT incidence roll-up, participant/event
// summary bases, filter semantics, the Wald difference interval, and the
// prevalence/search row predicates — all against the hand-computed numbers
// in fixtures.js (RhoInc/aeexplorer v3.4.1 prepareData/cross/
// calculateDifference behavior).

import { describe, expect, it, vi } from 'vitest';
import { syncSettings } from '../../../src/ae-explorer/configure.js';
import {
  addDifferences,
  calculateDifference,
  crossTab,
  eventData,
  flagPlaceholders,
  groupCounts,
  groupLevels,
  populationData,
  prevalenceVisible,
  rate,
  searchCategories
} from '../../../src/ae-explorer/structureData.js';
import { AE_ROWS, GROUPS } from './fixtures.js';

const settings = syncSettings({});
const flagged = flagPlaceholders(AE_ROWS, settings);

function build({ summarizeBy = 'participant', filterState = {}, overrides = {} } = {}) {
  const merged = syncSettings(overrides);
  const rows = flagPlaceholders(AE_ROWS, merged);
  const groups = groupLevels(rows, merged);
  const population = populationData(rows, merged, groups, merged.filters, filterState);
  const events = eventData(population, merged.filters, filterState);
  const counts = groupCounts(population, events, merged, groups);
  return { table: crossTab(events, merged, groups, counts, summarizeBy), counts, events };
}

const majorByKey = (table, key) => table.majors.find((major) => major.key === key);
const minorByKey = (major, key) => major.minors.find((minor) => minor.key === key);

describe('ae-explorer structureData', () => {
  it('AE-DATA-001: blank and NA System Organ Class rows flag as placeholders (#60)', () => {
    expect(flagged.filter((row) => row.__ae_placeholder).map((row) => row.USUBJID)).toEqual([
      'A4',
      'B2'
    ]);
  });

  it('AE-CFG-005: groups derive sorted from the data, and configured levels missing from the data drop with a warning (#60)', () => {
    expect(groupLevels(flagged, settings)).toEqual(['A', 'B']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(groupLevels(flagged, syncSettings({ groups: ['B', 'Ghost'] }))).toEqual(['B']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ghost'));
    warn.mockRestore();
  });

  it('AE-CFG-005: more groups than max_groups throws (#60)', () => {
    expect(() => groupLevels(flagged, syncSettings({ max_groups: 1 }))).toThrow(/group/i);
  });

  it('AE-DATA-001: placeholder participants count toward group denominators but never as events (#60)', () => {
    const { counts } = build();
    expect(counts).toEqual([
      { key: 'A', n: 4, nEvents: 4 },
      { key: 'B', n: 3, nEvents: 2 }
    ]);
  });

  it('AE-REG-008: participant mode counts distinct participants per category over the group denominator (#60)', () => {
    const { table } = build();
    const cardiac = majorByKey(table, 'Cardiac disorders');
    expect(cardiac.cells.A).toEqual({ n: 2, tot: 4, per: 50 });
    expect(cardiac.cells.B).toEqual({ n: 1, tot: 3, per: 33.3 });
    // A1's two palpitations records are one participant.
    expect(minorByKey(cardiac, 'Palpitations').cells.A).toEqual({ n: 1, tot: 4, per: 25 });
  });

  it('AE-REG-009: event mode counts records over the group event totals (#60)', () => {
    const { table } = build({ summarizeBy: 'event' });
    const cardiac = majorByKey(table, 'Cardiac disorders');
    expect(cardiac.cells.A).toEqual({ n: 3, tot: 4, per: 75 });
    expect(cardiac.cells.B).toEqual({ n: 1, tot: 2, per: 50 });
    expect(minorByKey(cardiac, 'Palpitations').cells.A).toEqual({ n: 2, tot: 4, per: 50 });
  });

  it('AE-USER-012: every group gets a cell — categories absent from a group produce zero-count shells (#60)', () => {
    const { table } = build();
    const arrhythmia = minorByKey(majorByKey(table, 'Cardiac disorders'), 'Arrhythmia');
    expect(arrhythmia.cells.B).toEqual({ n: 0, tot: 3, per: 0 });
  });

  it('AE-USER-006: the overall any-adverse-event summary uses the same participant basis (#60)', () => {
    const { table } = build();
    expect(table.overall.cells.A).toEqual({ n: 3, tot: 4, per: 75 });
    expect(table.overall.cells.B).toEqual({ n: 2, tot: 3, per: 66.7 });
  });

  it('AE-REG-006: event filters narrow the events counted without touching denominators (#60)', () => {
    const { table, counts } = build({ filterState: { AESEV: 'MILD' } });
    expect(counts.map((count) => count.n)).toEqual([4, 3]); // denominators unchanged
    expect(majorByKey(table, 'Cardiac disorders').cells.A).toEqual({ n: 1, tot: 4, per: 25 });
    expect(majorByKey(table, 'Gastrointestinal disorders').cells.B).toEqual({
      n: 0,
      tot: 3,
      per: 0
    });
  });

  it('AE-USER-018: participant filters narrow the population and its denominators — placeholders included (#60)', () => {
    const { table, counts } = build({
      overrides: { filters: [{ value_col: 'SEX', type: 'participant' }] },
      filterState: { SEX: 'F' }
    });
    // A: {A1, A3}; B: {B1, B2 (placeholder)} — B2 stays in the denominator.
    expect(counts).toEqual([
      { key: 'A', n: 2, nEvents: 3 },
      { key: 'B', n: 2, nEvents: 1 }
    ]);
    expect(majorByKey(table, 'Cardiac disorders').cells.A).toEqual({ n: 1, tot: 2, per: 50 });
  });

  it('AE-USER-013: the group difference is the unpooled Wald interval on the difference in proportions (#60)', () => {
    // p1 = 10/50 = .2, p2 = 5/50 = .1: diff 10, CI spans zero.
    const wide = calculateDifference(10, 50, 5, 50);
    expect(wide.diff).toBeCloseTo(10, 5);
    expect(wide.lower).toBeCloseTo(
      10 - 1.96 * Math.sqrt((0.2 * 0.8) / 50 + (0.1 * 0.9) / 50) * 100,
      5
    );
    expect(wide.upper).toBeCloseTo(
      10 + 1.96 * Math.sqrt((0.2 * 0.8) / 50 + (0.1 * 0.9) / 50) * 100,
      5
    );
    expect(wide.sig).toBe(0);
    // p1 = 30/50 = .6, p2 = 10/50 = .2: CI excludes zero → significant.
    const strong = calculateDifference(30, 50, 10, 50);
    expect(strong.diff).toBeCloseTo(40, 5);
    expect(strong.lower).toBeGreaterThan(0);
    expect(strong.sig).toBe(1);
  });

  it('AE-USER-013: one difference per group pair, keyed to both groups (#60)', () => {
    const cells = {
      A: { n: 2, tot: 4, per: 50 },
      B: { n: 1, tot: 3, per: 33.3 },
      C: { n: 0, tot: 5, per: 0 }
    };
    const diffs = addDifferences(cells, ['A', 'B', 'C']);
    expect(diffs.map((diff) => [diff.group1, diff.group2])).toEqual([
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'C']
    ]);
    expect(diffs[0].diff).toBeCloseTo((2 / 4 - 1 / 3) * 100, 5);
  });

  it('AE-USER-001/AE-REG-007: rows hide only when every group rate is below the prevalence threshold (#60)', () => {
    const { table } = build();
    const cardiac = majorByKey(table, 'Cardiac disorders');
    expect(prevalenceVisible(cardiac, 0)).toBe(true);
    expect(prevalenceVisible(cardiac, 40)).toBe(true); // A is at 50%
    expect(prevalenceVisible(cardiac, 60)).toBe(false); // every group below 60%
  });

  it('rows sort by descending peak group prevalence, ties alphabetical (#60)', () => {
    const { table } = build();
    expect(table.majors.map((major) => major.key)).toEqual([
      'Cardiac disorders',
      'Gastrointestinal disorders'
    ]);
    expect(majorByKey(table, 'Cardiac disorders').minors.map((minor) => minor.key)).toEqual([
      'Palpitations',
      'Arrhythmia'
    ]);
  });

  it('AE-USER-007: search matches System Organ Class and Preferred Term labels case-insensitively with a match count (#60)', () => {
    const { table } = build();
    const bySoc = searchCategories(table.majors, 'cardiac');
    expect(bySoc.count).toBe(1);
    expect(bySoc.majorKeys.has('Cardiac disorders')).toBe(true);
    const byPt = searchCategories(table.majors, 'palp');
    expect(byPt.count).toBe(1);
    expect(byPt.minorKeys.has('Cardiac disorders||Palpitations')).toBe(true);
    expect(searchCategories(table.majors, 'zzz').count).toBe(0);
  });

  it('rates round to one decimal the way the original does (#60)', () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(2, 3)).toBe(66.7);
    expect(rate(0, 3)).toBe(0);
  });
});
