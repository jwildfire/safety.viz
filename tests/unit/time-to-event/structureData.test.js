import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/time-to-event/checkInputs.js';
import { syncSettings } from '../../../src/time-to-event/configure.js';
import {
  applyFilters,
  cleanData,
  DROP_REASON_COLUMN,
  paramsPresent,
  structureData,
  unique
} from '../../../src/time-to-event/structureData.js';

// Data reduction for the time-to-event module (#128, design §4): ADTTE rows →
// per-group observation arrays → km.js estimates, with every exclusion counted and
// named. TTE-DATA-*.

const settings = syncSettings({});

const row = ({
  id,
  arm = 'Placebo',
  paramcd = 'TTDE',
  param = 'Time to First Dermatologic Event',
  aval = '10',
  cnsr = '0',
  evnt = 'RASH',
  cnsdt = ''
} = {}) => ({
  USUBJID: id,
  ARM: arm,
  PARAMCD: paramcd,
  PARAM: param,
  AVAL: aval,
  CNSR: cnsr,
  EVNTDESC: evnt,
  CNSDTDSC: cnsdt
});

describe('checkInputs', () => {
  it('throws naming every missing required column in one error (TTE-DATA-001, #128)', () => {
    expect(() => checkInputs([{ USUBJID: 'a' }], settings)).toThrow(
      /Required variable\(s\) missing: AVAL, CNSR/
    );
  });

  it('passes when id, time and censor columns are present; group and endpoint stay optional (#128)', () => {
    expect(() => checkInputs([{ USUBJID: 'a', AVAL: '5', CNSR: '0' }], settings)).not.toThrow();
  });
});

describe('paramsPresent', () => {
  it('lists distinct endpoints in data order (#128)', () => {
    const rows = [
      row({ id: 'a', paramcd: 'TTDE', param: 'Time to First Dermatologic Event' }),
      row({ id: 'a', paramcd: 'TTAE', param: 'Time to First TEAE' }),
      row({ id: 'b', paramcd: 'TTDE', param: 'Time to First Dermatologic Event' })
    ];
    expect(paramsPresent(rows, settings)).toEqual([
      { paramcd: 'TTDE', param: 'Time to First Dermatologic Event' },
      { paramcd: 'TTAE', param: 'Time to First TEAE' }
    ]);
  });

  it('treats a dataset with no endpoint columns as one unnamed endpoint (#128)', () => {
    const rows = [{ USUBJID: 'a', AVAL: '5', CNSR: '0' }];
    expect(paramsPresent(rows, settings)).toEqual([{ paramcd: null, param: 'Time to event' }]);
  });
});

describe('cleanData', () => {
  it('parses usable rows: positive numeric time, ADaM censor semantics (0 = event, ≥1 = censored) (#128)', () => {
    const { observations } = cleanData(
      [row({ id: 'a', aval: '10', cnsr: '0' }), row({ id: 'b', aval: '21.0', cnsr: '2' })],
      settings
    );
    expect(observations).toEqual([
      expect.objectContaining({ id: 'a', time: 10, event: true }),
      expect.objectContaining({ id: 'b', time: 21, event: false })
    ]);
  });

  it('drops and names rows with missing id, unusable time, or unparseable censor (TTE-DATA-002, #128)', () => {
    const { observations, droppedRows } = cleanData(
      [
        row({ id: '', aval: '5' }),
        row({ id: 'b', aval: '0' }),
        row({ id: 'c', aval: '-3' }),
        row({ id: 'd', aval: 'NA' }),
        row({ id: 'e', cnsr: 'maybe' }),
        row({ id: 'f', cnsr: '-1' }),
        row({ id: 'ok' })
      ],
      settings
    );
    expect(observations.map((o) => o.id)).toEqual(['ok']);
    expect(droppedRows).toHaveLength(6);
    for (const dropped of droppedRows) expect(dropped[DROP_REASON_COLUMN]).toBeTruthy();
  });

  it('keeps one row per participant, dropping later duplicates with a named reason (TTE-DATA-003, #128)', () => {
    const { observations, droppedRows } = cleanData(
      [row({ id: 'a', aval: '10' }), row({ id: 'a', aval: '20' })],
      settings
    );
    expect(observations).toHaveLength(1);
    expect(observations[0].time).toBe(10);
    expect(droppedRows).toHaveLength(1);
    expect(droppedRows[0][DROP_REASON_COLUMN]).toMatch(/duplicate/i);
  });
});

describe('structureData', () => {
  const rows = [
    // Placebo: events at 2 and 4, censored at 6.
    row({ id: 'p1', aval: '2' }),
    row({ id: 'p2', aval: '4' }),
    row({ id: 'p3', aval: '6', cnsr: '1', evnt: '', cnsdt: 'END OF STUDY' }),
    // High dose: event at 3, censored at 9.
    row({ id: 'h1', arm: 'High', aval: '3' }),
    row({ id: 'h2', arm: 'High', aval: '9', cnsr: '1', evnt: '', cnsdt: 'END OF STUDY' }),
    // A second endpoint that must not leak into TTDE.
    row({ id: 'p1', paramcd: 'TTAE', param: 'Time to First TEAE', aval: '1' })
  ];

  it('splits the selected endpoint by group, in data order, and estimates each (TTE-STAT-001, #128)', () => {
    const structured = structureData(rows, settings, 'TTDE');
    expect(structured.groups.map((g) => g.name)).toEqual(['Placebo', 'High']);
    const placebo = structured.groups[0];
    expect(placebo.estimate.total).toBe(3);
    expect(placebo.estimate.points.map((p) => p.time)).toEqual([2, 4]);
    expect(placebo.estimate.points[1].surv).toBeCloseTo(1 / 3, 12);
    expect(structured.maxTime).toBe(9);
  });

  it('falls back to one pooled group when the group column is absent (TTE-DATA-004, #128)', () => {
    const bare = [
      { USUBJID: 'a', AVAL: '5', CNSR: '0' },
      { USUBJID: 'b', AVAL: '8', CNSR: '1' }
    ];
    const structured = structureData(bare, settings, null);
    expect(structured.groups.map((g) => g.name)).toEqual(['All participants']);
    expect(structured.groups[0].estimate.total).toBe(2);
  });

  it('carries the per-observation descriptors for tooltips (#128)', () => {
    const structured = structureData(rows, settings, 'TTDE');
    const p1 = structured.groups[0].observations.find((o) => o.id === 'p1');
    expect(p1.eventDesc).toBe('RASH');
    const p3 = structured.groups[0].observations.find((o) => o.id === 'p3');
    expect(p3.censorDesc).toBe('END OF STUDY');
  });

  it('reports the drop accounting across the selected endpoint (#128)', () => {
    const withBad = [...rows, row({ id: 'bad', aval: 'NA' })];
    const structured = structureData(withBad, settings, 'TTDE');
    expect(structured.droppedRows).toHaveLength(1);
    expect(structured.total).toBe(5);
  });
});

describe('applyFilters', () => {
  it('keeps rows matching every active filter and ignores null filters (#128)', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', arm: 'High' })];
    expect(applyFilters(rows, { ARM: null })).toHaveLength(2);
    expect(applyFilters(rows, { ARM: 'High' }).map((r) => r.USUBJID)).toEqual(['b']);
  });
});

describe('unique', () => {
  it('preserves first-seen order (#128)', () => {
    expect(unique(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});
