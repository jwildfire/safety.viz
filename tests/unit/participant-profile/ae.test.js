import { describe, it, expect } from 'vitest';
import {
  syncAeSettings,
  cleanAeRecords,
  participantEvents,
  summarizeAe,
  aeDomain,
  unionDomain,
  timelineGeometry,
  axisTicks
} from '../../../src/participant-profile/ae.js';
import { makeAeRecords } from './fixture.js';

const settings = syncAeSettings({});

describe('syncAeSettings — the AE data contract (PPRF-AE-001)', () => {
  it('defaults to the ae-timelines / ae-explorer column names rather than a third vocabulary', () => {
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.term_col).toBe('AETERM');
    expect(settings.minor_col).toBe('AEDECOD');
    expect(settings.major_col).toBe('AEBODSYS');
    expect(settings.stdy_col).toBe('ASTDY');
    expect(settings.endy_col).toBe('AENDY');
    expect(settings.color.value_col).toBe('AESEV');
    expect(settings.color.values).toEqual(['MILD', 'MODERATE', 'SEVERE']);
    expect(settings.highlight.value_col).toBe('AESER');
    expect(settings.highlight.value).toBe('Y');
  });

  it('deep-merges a partial color override onto the defaults', () => {
    const custom = syncAeSettings({ color: { value_col: 'AETOXGR' } });
    expect(custom.color.value_col).toBe('AETOXGR');
    expect(custom.color.values).toEqual(['MILD', 'MODERATE', 'SEVERE']);
  });

  it('accepts a severity scale of any length and derives labels from the values', () => {
    const graded = syncAeSettings({ color: { value_col: 'AETOXGR', values: ['1', '2', '3', '4'] } });
    expect(graded.color.values).toHaveLength(4);
    expect(graded.color.labels).toEqual(['1', '2', '3', '4']);
  });

  it('takes explicit labels when given', () => {
    const custom = syncAeSettings({ color: { labels: ['Low', 'Mid', 'High'] } });
    expect(custom.color.labels).toEqual(['Low', 'Mid', 'High']);
  });

  it('disables the serious highlight when highlight is null', () => {
    expect(syncAeSettings({ highlight: null }).highlight).toBeNull();
  });
});

describe('cleanAeRecords — one ingest, explicit rules (PPRF-AE-002)', () => {
  const { events, removed } = cleanAeRecords(makeAeRecords(), settings);

  it('drops records with no participant id and counts them', () => {
    expect(events.every((event) => event.__ae_id !== '')).toBe(true);
    expect(removed).toBe(1);
  });

  it('ranks severity by position in color.values, one-based', () => {
    const mild = events.find((event) => event.__ae_term === 'headache');
    const severe = events.find((event) => event.__ae_term === 'hepatic failure');
    expect(mild.__ae_severity).toMatchObject({ key: 'MILD', label: 'Mild', rank: 1 });
    expect(severe.__ae_severity).toMatchObject({ key: 'SEVERE', label: 'Severe', rank: 3 });
  });

  it('files an unmapped severity as not recorded rather than inventing a rank', () => {
    const unmapped = events.find((event) => event.__ae_term === 'unknown grade event');
    expect(unmapped.__ae_severity).toMatchObject({ key: null, label: 'Not recorded', rank: 0 });
  });

  it('flags serious events from highlight.value', () => {
    expect(events.find((event) => event.__ae_term === 'hepatic failure').__ae_serious).toBe(true);
    expect(events.find((event) => event.__ae_term === 'headache').__ae_serious).toBe(false);
  });

  it('treats a blank stop day as open-ended, not as a zero-length event', () => {
    const ongoing = events.find((event) => event.__ae_term === 'fatigue');
    expect(ongoing.__ae_open).toBe(true);
    expect(ongoing.__ae_end).toBeNull();
  });

  it('treats a stop day before the start day as missing', () => {
    const reversed = events.find((event) => event.__ae_term === 'reversed dates');
    expect(reversed.__ae_open).toBe(true);
    expect(reversed.__ae_end).toBeNull();
  });

  it('retains a record with no usable start day but marks it unplaceable', () => {
    const noStart = events.find((event) => event.__ae_term === 'no start day');
    expect(noStart).toBeDefined();
    expect(noStart.__ae_placeable).toBe(false);
    expect(noStart.__ae_start).toBeNull();
  });

  it('prefers the preferred term for the row label and keeps the verbatim term', () => {
    const event = events.find((event) => event.__ae_term === 'headache');
    expect(event.__ae_term).toBe('headache');
    expect(event.__ae_verbatim).toBe('HEADACHE NOS');
  });

  it('falls back to the verbatim term when no preferred term is present', () => {
    const event = events.find((event) => event.__ae_verbatim === 'ONLY VERBATIM');
    expect(event.__ae_term).toBe('only verbatim');
  });
});

describe('participantEvents — worst-first within a participant (PPRF-AE-003)', () => {
  const { events } = cleanAeRecords(makeAeRecords(), settings);

  it('returns only the profiled participant’s events', () => {
    expect(participantEvents(events, 'P1').every((event) => event.__ae_id === 'P1')).toBe(true);
  });

  it('orders by severity descending, then onset ascending', () => {
    const ordered = participantEvents(events, 'P1').map((event) => event.__ae_term);
    expect(ordered[0]).toBe('hepatic failure');
    expect(ordered.indexOf('nausea')).toBeLessThan(ordered.indexOf('headache'));
  });

  it('sorts unplaceable events last so the plot rows stay contiguous', () => {
    const ordered = participantEvents(events, 'P1').map((event) => event.__ae_term);
    expect(ordered[ordered.length - 1]).toBe('no start day');
  });

  it('returns an empty list for a participant with no events', () => {
    expect(participantEvents(events, 'NOBODY')).toEqual([]);
  });
});

describe('summarizeAe — four figures, a mix and a rollup (PPRF-AESUM-001)', () => {
  const { events } = cleanAeRecords(makeAeRecords(), settings);
  const summary = summarizeAe(participantEvents(events, 'P1'), settings);

  it('counts events, serious events and events with no end date', () => {
    expect(summary.total).toBe(8);
    expect(summary.serious).toBe(1);
    // fatigue (blank stop), reversed dates (stop before start) and the
    // unplaceable row all read as "no end date".
    expect(summary.openEnded).toBe(3);
  });

  it('reports the highest severity reached', () => {
    expect(summary.worst.label).toBe('Severe');
  });

  it('builds the severity mix worst-first, dropping empty levels', () => {
    expect(summary.mix.map((entry) => [entry.label, entry.count])).toEqual([
      ['Severe', 1],
      ['Moderate', 2],
      ['Mild', 4],
      ['Not recorded', 1]
    ]);
  });

  it('rolls events up by body system, descending by count then name', () => {
    expect(summary.bodySystems[0]).toMatchObject({ name: 'Gastrointestinal disorders', count: 3 });
  });

  it('reports zeroes rather than throwing on an empty cohort', () => {
    const empty = summarizeAe([], settings);
    expect(empty).toMatchObject({ total: 0, serious: 0, openEnded: 0 });
    expect(empty.mix).toEqual([]);
  });
});

describe('aeDomain / unionDomain — the shared study-day axis (PPRF-AXIS-001)', () => {
  const { events } = cleanAeRecords(makeAeRecords(), settings);
  const mine = participantEvents(events, 'P1');

  it('spans the earliest onset to the latest stop day', () => {
    expect(aeDomain(mine)).toEqual([2, 90]);
  });

  it('ignores unplaceable events', () => {
    expect(aeDomain([{ __ae_placeable: false, __ae_start: null, __ae_end: null }])).toBeNull();
  });

  it('unions the lab domain with the AE domain so late events stay visible', () => {
    expect(unionDomain([1, 60], [2, 90])).toEqual([1, 90]);
  });

  it('falls back to whichever domain exists', () => {
    expect(unionDomain([1, 60], null)).toEqual([1, 60]);
    expect(unionDomain(null, [2, 90])).toEqual([2, 90]);
    expect(unionDomain(null, null)).toBeNull();
  });

  it('pads a zero-width domain so a single-day participant still plots', () => {
    expect(unionDomain([7, 7], null)).toEqual([6, 8]);
  });
});

describe('timelineGeometry — bars as percentages of the shared domain (PPRF-AETL-001)', () => {
  it('places a bar by its start and stop day', () => {
    const [bar] = timelineGeometry(
      [{ __ae_placeable: true, __ae_start: 25, __ae_end: 75, __ae_open: false }],
      [0, 100]
    );
    expect(bar.left).toBeCloseTo(25);
    expect(bar.width).toBeCloseTo(50);
    expect(bar.clipped).toBe(false);
  });

  it('runs an open-ended event to the end of the domain and says so', () => {
    const [bar] = timelineGeometry(
      [{ __ae_placeable: true, __ae_start: 50, __ae_end: null, __ae_open: true }],
      [0, 100]
    );
    expect(bar.left).toBeCloseTo(50);
    expect(bar.width).toBeCloseTo(50);
    expect(bar.open).toBe(true);
  });

  it('gives a same-day event a visible minimum width', () => {
    const [bar] = timelineGeometry(
      [{ __ae_placeable: true, __ae_start: 40, __ae_end: 40, __ae_open: false }],
      [0, 100]
    );
    expect(bar.width).toBeGreaterThan(0);
  });

  it('clamps and flags an event running past the domain', () => {
    const [bar] = timelineGeometry(
      [{ __ae_placeable: true, __ae_start: 90, __ae_end: 200, __ae_open: false }],
      [0, 100]
    );
    expect(bar.left + bar.width).toBeLessThanOrEqual(100);
    expect(bar.clipped).toBe(true);
  });

  it('returns no geometry for an unplaceable event', () => {
    expect(
      timelineGeometry([{ __ae_placeable: false, __ae_start: null, __ae_end: null }], [0, 100])
    ).toEqual([null]);
  });
});

describe('axisTicks — a readable ruler under the timeline (PPRF-AETL-002)', () => {
  it('returns round day values inside the domain, as percentages', () => {
    const ticks = axisTicks([0, 100]);
    expect(ticks[0]).toMatchObject({ value: 0, position: 0 });
    expect(ticks[ticks.length - 1].value).toBeLessThanOrEqual(100);
    expect(ticks.every((tick) => tick.position >= 0 && tick.position <= 100)).toBe(true);
  });

  it('picks a coarser step for a long study', () => {
    const short = axisTicks([0, 30]);
    const long = axisTicks([0, 900]);
    expect(long[1].value - long[0].value).toBeGreaterThan(short[1].value - short[0].value);
  });

  it('never returns a single tick for a real domain', () => {
    expect(axisTicks([1, 14]).length).toBeGreaterThan(1);
  });
});
