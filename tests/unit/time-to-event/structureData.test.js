import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/time-to-event/checkInputs.js';
import { syncSettings } from '../../../src/time-to-event/configure.js';
import {
  applyEventFilters,
  applyFilters,
  deriveObservations,
  DROP_REASON_COLUMN,
  structureData,
  unique
} from '../../../src/time-to-event/structureData.js';

// Data reduction for the time-to-event module (#128, design §4 as revised by the
// sv#131 review): filtered event rows + population rows → one time-to-first-
// qualifying-event observation per participant → km.js estimates, with every
// exclusion counted and named. TTE-DERIV-*, TTE-DATA-*, TTE-FILT-*.

const settings = syncSettings({});

const event = ({ id, day = '10', soc = 'SKIN', pt = 'RASH', ser = 'N', sev = 'MILD' } = {}) => ({
  USUBJID: id,
  ASTDY: day,
  AEBODSYS: soc,
  AEDECOD: pt,
  AESER: ser,
  AESEV: sev
});

const participant = ({ id, arm = 'Placebo', eosdy = '30', eosstt = 'COMPLETED' } = {}) => ({
  USUBJID: id,
  ARM: arm,
  EOSDY: eosdy,
  EOSSTT: eosstt
});

describe('checkInputs', () => {
  it('throws naming every missing required column per dataset in one error (TTE-DATA-001, #128)', () => {
    expect(() =>
      checkInputs({ events: [{ USUBJID: 'a' }], population: [{ ARM: 'Placebo' }] }, settings)
    ).toThrow(
      /Required variable\(s\) missing: events\.ASTDY, population\.USUBJID, population\.EOSDY/
    );
  });

  it('throws when either dataset is missing entirely (TTE-DATA-001, #128)', () => {
    expect(() => checkInputs({ events: [event({ id: 'a' })] }, settings)).toThrow(/population/i);
    expect(() => checkInputs([], settings)).toThrow(/events/i);
  });

  it('passes when the event day and population id + follow-up day are present; group stays optional (#128)', () => {
    expect(() =>
      checkInputs(
        {
          events: [{ USUBJID: 'a', ASTDY: '5' }],
          population: [{ USUBJID: 'a', EOSDY: '30' }]
        },
        settings
      )
    ).not.toThrow();
  });
});

describe('applyEventFilters', () => {
  const events = [
    event({ id: 'a', soc: 'SKIN' }),
    event({ id: 'b', soc: 'CARDIAC', ser: 'Y' }),
    event({ id: 'c', soc: 'SKIN', sev: 'SEVERE' })
  ];

  it('keeps every row when no filter has an active selection (TTE-FILT-002, #128)', () => {
    expect(applyEventFilters(events, {})).toHaveLength(3);
    expect(applyEventFilters(events, { AEBODSYS: null })).toHaveLength(3);
  });

  it('keeps rows whose value is in the selected set — multiselect semantics (TTE-FILT-001, #128)', () => {
    expect(applyEventFilters(events, { AEBODSYS: ['SKIN'] }).map((r) => r.USUBJID)).toEqual([
      'a',
      'c'
    ]);
    expect(
      applyEventFilters(events, { AEBODSYS: ['SKIN', 'CARDIAC'], AESER: ['Y'] }).map(
        (r) => r.USUBJID
      )
    ).toEqual(['b']);
  });

  it('an empty selection qualifies no events (#128)', () => {
    expect(applyEventFilters(events, { AEBODSYS: [] })).toHaveLength(0);
  });
});

describe('deriveObservations', () => {
  it('takes each participant’s first qualifying event by day, ties broken by input order (TTE-DERIV-001, #128)', () => {
    const { observations } = deriveObservations(
      [
        event({ id: 'a', day: '12', pt: 'LATER RASH' }),
        event({ id: 'a', day: '4', pt: 'FIRST RASH' }),
        event({ id: 'a', day: '4', pt: 'TIED SECOND' })
      ],
      [participant({ id: 'a' })],
      settings
    );
    expect(observations).toEqual([
      expect.objectContaining({ id: 'a', time: 4, event: true, eventDesc: 'FIRST RASH' })
    ]);
  });

  it('censors event-free participants at the follow-up day with the population censor description (TTE-DERIV-002, #128)', () => {
    const { observations } = deriveObservations(
      [],
      [participant({ id: 'a', eosdy: '42', eosstt: 'DISCONTINUED' })],
      settings
    );
    expect(observations).toEqual([
      expect.objectContaining({ id: 'a', time: 42, event: false, censorDesc: 'DISCONTINUED' })
    ]);
  });

  it('drops event rows with a missing, non-numeric or non-positive day, with a named reason (TTE-DATA-002, #128)', () => {
    const { observations, droppedEvents } = deriveObservations(
      [
        event({ id: 'a', day: '' }),
        event({ id: 'a', day: 'NA' }),
        event({ id: 'a', day: '0' }),
        event({ id: 'a', day: '-3' }),
        event({ id: 'a', day: '7' })
      ],
      [participant({ id: 'a' })],
      settings
    );
    expect(observations[0]).toEqual(expect.objectContaining({ id: 'a', time: 7, event: true }));
    expect(droppedEvents).toHaveLength(4);
    for (const dropped of droppedEvents) expect(dropped[DROP_REASON_COLUMN]).toBeTruthy();
  });

  it('drops event rows whose participant is not in the population data (TTE-DATA-002, #128)', () => {
    const { droppedEvents } = deriveObservations(
      [event({ id: 'ghost' })],
      [participant({ id: 'a' })],
      settings
    );
    expect(droppedEvents).toHaveLength(1);
    expect(droppedEvents[0][DROP_REASON_COLUMN]).toMatch(/not in the population/i);
  });

  it('drops population rows with a missing id or duplicate participant, keeping the first (TTE-DATA-003, #128)', () => {
    const { observations, droppedPopulation } = deriveObservations(
      [],
      [
        participant({ id: '' }),
        participant({ id: 'a', eosdy: '10' }),
        participant({ id: 'a', eosdy: '20' })
      ],
      settings
    );
    expect(observations).toHaveLength(1);
    expect(observations[0].time).toBe(10);
    expect(droppedPopulation).toHaveLength(2);
    expect(droppedPopulation[1][DROP_REASON_COLUMN]).toMatch(/duplicate/i);
  });

  it('drops event-free participants with an unusable follow-up day, with a named reason (TTE-DERIV-002, #128)', () => {
    const { observations, droppedPopulation } = deriveObservations(
      [event({ id: 'a', day: '5' })],
      [participant({ id: 'a', eosdy: '' }), participant({ id: 'b', eosdy: 'NA' })],
      settings
    );
    // A qualifying event does not need the follow-up day; an event-free participant does.
    expect(observations).toEqual([expect.objectContaining({ id: 'a', event: true })]);
    expect(droppedPopulation).toHaveLength(1);
    expect(droppedPopulation[0][DROP_REASON_COLUMN]).toMatch(/follow-up/i);
  });
});

describe('structureData', () => {
  const population = [
    participant({ id: 'p1' }),
    participant({ id: 'p2' }),
    participant({ id: 'p3', eosdy: '25' }),
    participant({ id: 'h1', arm: 'High' }),
    participant({ id: 'h2', arm: 'High', eosdy: '9' })
  ];
  const events = [
    event({ id: 'p1', day: '2' }),
    event({ id: 'p2', day: '4' }),
    event({ id: 'h1', day: '3' })
  ];

  it('splits participants by group, in population order, and estimates each (TTE-STAT-001, #128)', () => {
    const structured = structureData(events, population, settings);
    expect(structured.groups.map((g) => g.name)).toEqual(['Placebo', 'High']);
    const placebo = structured.groups[0];
    expect(placebo.estimate.total).toBe(3);
    expect(placebo.estimate.points.map((p) => p.time)).toEqual([2, 4]);
    expect(placebo.estimate.points[1].surv).toBeCloseTo(1 / 3, 12);
    // The largest observed time: p3's censoring at 25 — participants with an
    // event contribute their event day, not their follow-up day.
    expect(structured.maxTime).toBe(25);
  });

  it('falls back to one pooled group when the population has no group column (TTE-DATA-004, #128)', () => {
    const bare = [
      { USUBJID: 'a', EOSDY: '30' },
      { USUBJID: 'b', EOSDY: '20' }
    ];
    const structured = structureData([{ USUBJID: 'a', ASTDY: '5' }], bare, settings);
    expect(structured.groups.map((g) => g.name)).toEqual(['All participants']);
    expect(structured.groups[0].estimate.total).toBe(2);
  });

  it('reports the drop accounting for both datasets (#128)', () => {
    const structured = structureData(
      [...events, event({ id: 'p3', day: 'NA' })],
      [...population, participant({ id: 'x', eosdy: '' })],
      settings
    );
    expect(structured.droppedEvents).toHaveLength(1);
    expect(structured.droppedPopulation).toHaveLength(1);
    expect(structured.total).toBe(5);
  });
});

describe('applyFilters', () => {
  it('keeps rows matching every active filter and ignores null filters (#128)', () => {
    const rows = [participant({ id: 'a' }), participant({ id: 'b', arm: 'High' })];
    expect(applyFilters(rows, { ARM: null })).toHaveLength(2);
    expect(applyFilters(rows, { ARM: 'High' }).map((r) => r.USUBJID)).toEqual(['b']);
  });
});

describe('unique', () => {
  it('preserves first-seen order (#128)', () => {
    expect(unique(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});
