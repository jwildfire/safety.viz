import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/hep-waterfall/configure.js';
import {
  applyFilters,
  boxSpecs,
  buildWaterfall,
  orderWaterfall,
  prepareData,
  waterfallDatasets
} from '../../../src/hep-waterfall/structureData.js';
import { boxStats } from '../../../src/hep-core/stats.js';
import { ARM_SETTINGS, TB_ULN, makeRows } from './fixture.js';

// Cohort, ordering, datasets and box specs for the modified ALT waterfall
// (Amirzadegan 2025, Fig 5; safety.viz#93). Requirement groups HWF-DATA-*,
// HWF-ORDER-*, HWF-BAR-* (the dataset half) and HWF-BOX-003/004.

function build(overrides = {}) {
  const settings = syncSettings({ ...ARM_SETTINGS, ...overrides });
  const { rows, removed } = prepareData(makeRows(), settings);
  return { settings, removed, ...buildWaterfall(rows, settings) };
}

const byId = (waterfall) => new Map(waterfall.ordered.map((subject) => [subject.id, subject]));

describe('hep-waterfall structureData.buildWaterfall', () => {
  it('HWF-DATA-001: every plotted participant carries a baseline and an on-treatment maximum in absolute units (#93)', () => {
    const waterfall = build();
    const subjects = byId(waterfall);
    expect([...subjects.keys()].sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P7']);
    // Absolute U/L, not xULN and not xBaseline: P1's baseline is 50 U/L at a
    // 40 U/L reference range, which would read 1.25 on either ratio scale.
    expect(subjects.get('P1').baseline).toBe(50);
    expect(subjects.get('P1').peak).toBe(80);
    expect(subjects.get('P1').peakDay).toBe(30);
    expect(subjects.get('P1').uln).toBe(40);
    waterfall.ordered.forEach((subject) => {
      expect(Number.isFinite(subject.baseline)).toBe(true);
      expect(Number.isFinite(subject.peak)).toBe(true);
    });
  });

  it('HWF-DATA-001: the reduction is the shared hep-core one, so ALT matches buildHepSubjects (#93)', () => {
    const waterfall = build();
    waterfall.ordered.forEach((subject) => {
      expect(subject.baseline).toBe(subject.baselineAlt);
      expect(subject.peak).toBe(subject.peakAlt);
    });
  });

  it('HWF-DATA-002: the on-treatment maximum excludes the baseline record BY IDENTITY (#93)', () => {
    const subjects = byId(build());
    // P2's baseline (100) is their highest value; the peak must fall below it.
    expect(subjects.get('P2').baseline).toBe(100);
    expect(subjects.get('P2').peak).toBe(80);
    expect(subjects.get('P2').peak).toBeLessThan(subjects.get('P2').baseline);
    // P7 carries NO day-0 record: their baseline falls back to the day-3 draw,
    // which a bare `day > 0` test would have counted as on-treatment and so
    // could never have produced a bar below the baseline trace.
    expect(subjects.get('P7').baseline).toBe(70);
    expect(subjects.get('P7').peak).toBe(55);
    expect(subjects.get('P7').peak).toBeLessThan(subjects.get('P7').baseline);
  });

  it('HWF-DATA-003: baseline-bilirubin exclusions are counted and reported separately (#93)', () => {
    const waterfall = build();
    // P5 alone carries a 2xULN baseline total bilirubin (paper Table 1).
    expect(waterfall.excluded.bilirubin).toBe(1);
    expect(waterfall.ordered.some((subject) => subject.id === 'P5')).toBe(false);
    expect(waterfall.notes.some((note) => /baseline bilirubin/i.test(note.text))).toBe(true);
    // Turning the cohort rule off admits them, with the note stating so.
    const off = build({ apply_tb_cohort: false });
    expect(off.excluded.bilirubin).toBe(0);
    expect(off.ordered.some((subject) => subject.id === 'P5')).toBe(true);
  });

  it('HWF-DATA-004: new-onset jaundice needs a normal baseline AND an on-treatment exceedance (#93)', () => {
    const subjects = byId(build());
    expect(subjects.get('P3').newOnsetJaundice).toBe(true);
    expect(subjects.get('P1').newOnsetJaundice).toBe(false);
    // Raising the threshold above P3's on-treatment peak (3.0 / 1.2 = 2.5xULN)
    // clears the flag.
    const raised = byId(build({ jaundice_uln: 3 }));
    expect(raised.get('P3').newOnsetJaundice).toBe(false);
    // P5's baseline TB is already above the threshold: with the cohort rule off
    // they are plotted, but they are NOT new-onset — the first clause fails.
    const admitted = byId(build({ apply_tb_cohort: false }));
    expect(admitted.get('P5').baselineBiliULN).toBeCloseTo(2.6 / TB_ULN, 10);
    expect(admitted.get('P5').baselineBiliULN).toBeGreaterThan(2);
    expect(admitted.get('P5').newOnsetJaundice).toBe(false);
  });

  it('HWF-DATA-005: undesignated arms are excluded and counted apart from the bilirubin rule (#93)', () => {
    const waterfall = build();
    expect(waterfall.excluded.arm).toBe(1);
    expect(waterfall.ordered.some((subject) => subject.id === 'P6')).toBe(false);
    const armNote = waterfall.notes.find((note) => /not designated/i.test(note.text));
    const biliNote = waterfall.notes.find((note) => /baseline bilirubin/i.test(note.text));
    expect(armNote.text).toMatch(/^1 participant/);
    expect(biliNote.text).toMatch(/^1 participant/);
    expect(armNote.text).not.toBe(biliNote.text);
    // Pooling every non-placebo arm active admits them.
    const pooled = build({ active_arms: null });
    expect(pooled.excluded.arm).toBe(0);
    expect(pooled.ordered.some((subject) => subject.id === 'P6')).toBe(true);
  });

  it('HWF-DATA-008: records dropped for a missing reference range are reported, not dropped silently (#93)', () => {
    const settings = syncSettings(ARM_SETTINGS);
    const rows = makeRows();
    rows[0] = { ...rows[0], STNRHI: '' };
    const { removed } = prepareData(rows, settings);
    expect(removed).toBe(1);
    const waterfall = buildWaterfall(prepareData(rows, settings).rows, settings, { removed });
    expect(waterfall.notes.some((note) => /reference range/i.test(note.text))).toBe(true);
  });
});

describe('hep-waterfall structureData.orderWaterfall', () => {
  it('HWF-ORDER-001: placebo participants run left to right by ascending baseline (#93)', () => {
    const { placebo } = build();
    expect(placebo.map((subject) => subject.id)).toEqual(['P1', 'P7', 'P2']);
    expect(placebo.map((subject) => subject.baseline)).toEqual([50, 70, 100]);
  });

  it('HWF-ORDER-002: active participants follow by descending baseline, meeting at the seam (#93)', () => {
    const { ordered, placebo, active } = build();
    expect(active.map((subject) => subject.id)).toEqual(['P3', 'P4']);
    expect(active.map((subject) => subject.baseline)).toEqual([200, 150]);
    expect(ordered.map((subject) => subject.id)).toEqual([...placebo, ...active].map((s) => s.id));
    // The two highest baselines of the two arms are adjacent at the boundary.
    expect(ordered[placebo.length - 1].baseline).toBe(Math.max(...placebo.map((s) => s.baseline)));
    expect(ordered[placebo.length].baseline).toBe(Math.max(...active.map((s) => s.baseline)));
  });

  it('HWF-ORDER-003: the baseline trace is unimodal with its mode at the arm boundary (#93)', () => {
    const { ordered, placebo } = build();
    const values = ordered.map((subject) => subject.baseline);
    const boundary = placebo.length;
    for (let i = 1; i < boundary; i += 1) {
      expect(values[i], `placebo span decreased at ${i}`).toBeGreaterThanOrEqual(values[i - 1]);
    }
    for (let i = boundary + 1; i < values.length; i += 1) {
      expect(values[i], `active span increased at ${i}`).toBeLessThanOrEqual(values[i - 1]);
    }
    // One mode, and it sits at the seam: exactly one of the two boundary
    // positions holds the cohort maximum.
    const max = Math.max(...values);
    const modeIndex = values.indexOf(max);
    expect([boundary - 1, boundary]).toContain(modeIndex);
  });

  it('HWF-ORDER-004: ties break on participant id, so repeated renders order identically (#93)', () => {
    const tied = [
      { id: 'B', side: 'placebo', baseline: 40 },
      { id: 'A', side: 'placebo', baseline: 40 },
      { id: 'D', side: 'active', baseline: 90 },
      { id: 'C', side: 'active', baseline: 90 }
    ];
    const once = orderWaterfall(tied).map((subject) => subject.id);
    const again = orderWaterfall([...tied].reverse()).map((subject) => subject.id);
    expect(once).toEqual(['A', 'B', 'C', 'D']);
    expect(again).toEqual(once);
  });
});

describe('hep-waterfall structureData.waterfallDatasets', () => {
  it('HWF-BAR-001: one floating bar per participant, spanning baseline to on-treatment maximum (#93)', () => {
    const { ordered } = build();
    const [bars] = waterfallDatasets(ordered, { measure: 'ALT' });
    expect(bars.type).toBe('bar');
    expect(bars.data).toHaveLength(ordered.length);
    bars.data.forEach((pair, index) => {
      expect(pair).toEqual([ordered[index].baseline, ordered[index].peak]);
    });
    // A dense comb: no per-category padding between neighbouring bars.
    expect(bars.barPercentage).toBe(1);
    expect(bars.categoryPercentage).toBe(1);
  });

  it('HWF-BAR-002: bars point up on a rise and down on a fall (#93)', () => {
    const { ordered } = build();
    const [bars] = waterfallDatasets(ordered, { measure: 'ALT' });
    const pairFor = (id) => bars.data[ordered.findIndex((subject) => subject.id === id)];
    expect(pairFor('P1')[1]).toBeGreaterThan(pairFor('P1')[0]);
    expect(pairFor('P2')[1]).toBeLessThan(pairFor('P2')[0]);
    expect(pairFor('P7')[1]).toBeLessThan(pairFor('P7')[0]);
  });

  it('HWF-BAR-003: one continuous black line traces every participant baseline (#93)', () => {
    const { ordered } = build();
    const [, trace] = waterfallDatasets(ordered, { measure: 'ALT' });
    expect(trace.type).toBe('line');
    expect(trace.data).toEqual(ordered.map((subject) => subject.baseline));
    expect(trace.borderColor).toBe('#111827');
    expect(trace.pointRadius).toBe(0);
    expect(trace.tension).toBe(0);
    expect(trace.spanGaps).not.toBe(false);
  });

  it('HWF-BAR-004: the trace is drawn above the bars (#93)', () => {
    const { ordered } = build();
    const [bars, trace] = waterfallDatasets(ordered, { measure: 'ALT' });
    // Chart.js draws its sorted datasets in reverse, so the LOWER order value
    // is painted last and therefore on top (mixed-chart drawing order).
    expect(trace.order).toBeLessThan(bars.order);
  });
});

describe('hep-waterfall structureData.boxSpecs', () => {
  it('HWF-BOX-003: baseline_peak stages a baseline box and a peak box per arm (#93)', () => {
    const { placebo } = build();
    const specs = boxSpecs(placebo, { summary: 'baseline_peak', color: '#1f78b4' });
    expect(specs.map((spec) => spec.label)).toEqual(['Baseline', 'Peak']);
    expect(specs.map((spec) => spec.x)).toEqual([0, 1]);
    specs.forEach((spec) => expect(spec.color).toBe('#1f78b4'));
    expect(specs[0].stats.n).toBe(placebo.length);
    // summary: 'peak' gives the single-box reading (open call O2).
    const single = boxSpecs(placebo, { summary: 'peak', color: '#1f78b4' });
    expect(single).toHaveLength(1);
    expect(single[0].label).toBe('Peak');
    expect(single[0].x).toBe(0);
  });

  it('HWF-BOX-004: box statistics are the shared R-7 interpolated quantiles (#93)', () => {
    const { active } = build();
    const specs = boxSpecs(active, { summary: 'baseline_peak', color: '#b5651d' });
    expect(specs[0].stats).toEqual(boxStats(active.map((subject) => subject.baseline)));
    expect(specs[1].stats).toEqual(boxStats(active.map((subject) => subject.peak)));
    // Empty arms stage empty statistics rather than throwing; drawBoxWhisker
    // skips an n of 0.
    expect(boxSpecs([], { summary: 'baseline_peak', color: '#000' })[0].stats.n).toBe(0);
  });
});

describe('hep-waterfall structureData.applyFilters', () => {
  it('HWF-CTRL-003: an active filter restricts the plotted cohort (#93)', () => {
    const { ordered } = build({ filters: ['SEX'] });
    expect(applyFilters(ordered, {}).map((subject) => subject.id)).toEqual(
      ordered.map((subject) => subject.id)
    );
    const females = applyFilters(ordered, { SEX: 'F' });
    expect(females.map((subject) => subject.id)).toEqual(['P1', 'P3']);
  });
});
