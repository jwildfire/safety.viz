// @vitest-environment jsdom
// The lane plan and the drawing rule of the patient-journey-explorer module
// (#142, design §6.1, §6.8, D21): the three empty states a lane must not
// confuse, the footers that name what is kept but not drawn, the closed-bar
// drawing rule against the padded shared domain, and the group-header height
// the fit arithmetic assumes. Chart.js is stubbed as in events.test.js; nothing
// here builds a chart. PJE-LANE-006/007/008/009, PJE-DATA-003.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('chart.js', () => ({ Chart: class {} }));

const { syncSettings } = await import('../../../src/patient-journey-explorer/configure.js');
const { normalizeInput } = await import('../../../src/patient-journey-explorer/normalize.js');
const { structureData } = await import('../../../src/patient-journey-explorer/structureData.js');
const { GROUP_HEADER_PX, laneDatasets, planLanes } =
  await import('../../../src/patient-journey-explorer/lanes.js');
const { PJE_PALETTE } = await import('../../../src/patient-journey-explorer/palette.js');

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const settings = (overrides = {}) => syncSettings(overrides);
const ex = { USUBJID: 'P1', EXTRT: 'DRUG', EXDOSE: 50, EXDOSU: 'mg', ASTDY: 1, AENDY: 20 };
const plan = (data, s = settings(), state = {}) => {
  const structured = structureData(normalizeInput(data, s).domains, s, {
    subject: null,
    filters: {},
    lanes: {},
    ...state
  });
  const groups = planLanes(structured, s, { lanes: state.lanes || {}, groups: {} });
  const lanes = Object.fromEntries(groups.flatMap((g) => g.lanes).map((lane) => [lane.key, lane]));
  return { structured, groups, lanes };
};

describe('planLanes empty states (PJE-LANE-007, PJE-LANE-008)', () => {
  it('PJE-LANE-007: a participant with no records in a lane reads "No <domain> recorded", with no footer (#142)', () => {
    const { lanes } = plan({ ex: [ex], ae: [{ USUBJID: 'P2', AETERM: 'X', ASTDY: 3 }] });
    expect(lanes.adverseEvents.kind).toBe('empty');
    expect(lanes.adverseEvents.emptyText).toBe('No adverse events recorded for this participant.');
    expect(lanes.adverseEvents.footers).toEqual([]);
  });

  it('PJE-LANE-008: a lane whose every record has no usable day does NOT say "no records" — it says no record has a usable day, and the footer names them (#142)', () => {
    const { lanes } = plan({
      ex: [ex],
      cm: [
        { USUBJID: 'P1', CMTRT: 'ASPIRIN', ASTDY: '', AENDY: '' },
        { USUBJID: 'P1', CMTRT: 'TEA', ASTDY: 'NA' }
      ],
      lb: [
        {
          USUBJID: 'P1',
          LBTEST: 'Alanine Aminotransferase',
          LBSTRESN: 20,
          LBSTRESU: 'U/L',
          LBDY: ''
        },
        {
          USUBJID: 'P1',
          LBTEST: 'Alanine Aminotransferase',
          LBSTRESN: 50,
          LBSTRESU: 'U/L',
          LBDY: 'NA'
        }
      ]
    });
    expect(lanes.conMeds.kind).toBe('empty');
    expect(lanes.conMeds.emptyText).toBe('No con-med has a usable study day; see below.');
    expect(lanes.conMeds.footers).toEqual([
      'No start day recorded, so not on the timeline: ASPIRIN, TEA.'
    ]);
    // Labs are named by test, not by their value label.
    expect(lanes.labs.kind).toBe('empty');
    expect(lanes.labs.emptyText).toBe('No lab result has a usable study day; see below.');
    expect(lanes.labs.footers).toContain(
      'No start day recorded, so not on the timeline: Alanine Aminotransferase.'
    );
  });

  it('PJE-LANE-008: a record whose only day is 0 is named as such in the footer, apart from the blank-day records (#142)', () => {
    const { lanes, structured } = plan({
      ex: [ex],
      ae: [
        { USUBJID: 'P1', AETERM: 'ZERO', ASTDY: 0, AENDY: 5 },
        { USUBJID: 'P1', AETERM: 'BLANK', ASTDY: '' },
        { USUBJID: 'P1', AETERM: 'TEN', ASTDY: 10 }
      ]
    });
    expect(structured.unplaceableCounts.byLane.adverseEvents).toBe(2);
    expect(structured.lanes.adverseEvents.drawn.map((e) => e.label)).toEqual(['TEN']);
    expect(lanes.adverseEvents.footers).toEqual([
      'No start day recorded, so not on the timeline: BLANK.',
      'Study day 0 is not a valid day, so not on the timeline: ZERO.'
    ]);
  });

  it('PJE-LANE-007: records that exist but were all filtered out read "No records match the current filters" (#142)', () => {
    const s = settings();
    const { lanes } = plan(
      { ex: [ex], ae: [{ USUBJID: 'P1', AETERM: 'X', ASTDY: 3, AESER: 'N' }] },
      s,
      { filters: { AESER: 'Y' } }
    );
    expect(lanes.adverseEvents.emptyText).toBe('No records match the current filters.');
  });

  it('PJE-DATA-003: labs for tests outside lb_tests are named in the footer when the lane draws, and in the empty text when it does not (#142)', () => {
    const glucose = { USUBJID: 'P1', LBTEST: 'Glucose', LBTESTCD: 'GLUC', LBSTRESN: 5, LBDY: 3 };
    const alt = {
      USUBJID: 'P1',
      LBTEST: 'Alanine Aminotransferase',
      LBTESTCD: 'ALT',
      LBSTRESN: 20,
      LBDY: 3
    };
    const only = plan({ ex: [ex], lb: [glucose, { ...glucose, LBDY: 8 }] });
    expect(only.lanes.labs.kind).toBe('empty');
    expect(only.lanes.labs.emptyText).toBe(
      'No records for the configured tests; 2 other lab results are in Source records.'
    );
    expect(only.structured.counts.LB).toBe(2);
    expect(only.structured.labTestsMissing).toHaveLength(4);
    const mixed = plan({ ex: [ex], lb: [alt, glucose] });
    const labLanes = mixed.groups.flatMap((g) => g.lanes).filter((lane) => lane.key === 'labs');
    expect(labLanes.map((lane) => lane.kind)).toEqual(['chart']);
    expect(labLanes[0].footers).toContain(
      '1 lab result for tests not in lb_tests is not drawn — see Source records.'
    );
    expect(labLanes[0].sublabel).toBe('ALT');
    expect(labLanes[0].title).toBe('Alanine Aminotransferase');
  });
});

describe('the drawing rule and the fit arithmetic (PJE-LANE-006, PJE-LANE-009)', () => {
  it('PJE-LANE-006: a closed bar drawn through the end of its end day never leaves the padded shared domain (#142)', () => {
    const s = settings();
    const data = {
      ex: [ex],
      ae: [
        { USUBJID: 'P1', AETERM: 'RASH', ASTDY: 10, AENDY: 20 },
        { USUBJID: 'P1', AETERM: 'SAME', ASTDY: 20, AENDY: 20 }
      ]
    };
    const structured = structureData(normalizeInput(data, s).domains, s, {
      subject: null,
      filters: {},
      lanes: {}
    });
    expect(structured.domain).toEqual([-14, 20]);
    expect(structured.extent).toEqual([-14, 20]);
    for (const lane of ['exposure', 'adverseEvents']) {
      const datasets = laneDatasets(lane, structured.lanes[lane].drawn, {
        domain: structured.domain,
        settings: s,
        theme: PJE_PALETTE.light
      });
      for (const dataset of datasets) {
        for (const point of dataset.data) {
          expect(point.x[1]).toBeLessThanOrEqual(structured.domain[1]);
          expect(point.x[1]).toBeGreaterThan(point.x[0]);
        }
      }
    }
    const same = laneDatasets('adverseEvents', structured.lanes.adverseEvents.drawn, {
      domain: structured.domain,
      settings: s,
      theme: PJE_PALETTE.light
    })
      .flatMap((d) => d.data)
      .find((p) => p.event.label === 'SAME');
    expect(same.x).toEqual([19, 20]);
  });

  it('PJE-LANE-009: the group-header estimate is the rendered header height, 35px, so the fit does not miss by a few pixels per group (#142)', () => {
    expect(GROUP_HEADER_PX).toBe(35);
  });
});
