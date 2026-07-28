import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/nep-explorer/configure.js';
import {
  STAGE_COLORS,
  markStyles,
  pointTooltip,
  selectionBorders,
  stageZones
} from '../../../src/nep-explorer/getPlugins.js';

// Zone geometry, mark styling and tooltip text for the KDIGO scatter (#120).
// Requirement groups: NEP-ZONE-* (geometry, paint order, colour and labelling)
// and NEP-SCAT-* (marks, tooltip, selection).

const SETTINGS = syncSettings({});
const CUTS = SETTINGS.stages.fold;
const X = [0, 3.5];
const Y = [-0.8, 3.0];

const zonesFor = (cuts = CUTS, trigger = 0.3) => stageZones(cuts, trigger, X, Y);

describe('nep-explorer stage zones', () => {
  it('NEP-ZONE-001: the zones are the L-shaped KDIGO geometry, not four nested rectangles (#120)', () => {
    // D4. Under the KDIGO ladder the zone under a point is the WORSE of the two
    // axes: Stage 1 is everything at or above 0.3 mg/dL up to 2× fold, PLUS the
    // 1.5-2× band at any delta; the no-stage box is the one region where both
    // criteria are clear (design §3.1).
    const zones = zonesFor();
    const stage3 = zones.filter((zone) => zone.stage === 3);
    const stage2 = zones.filter((zone) => zone.stage === 2);
    const stage1 = zones.filter((zone) => zone.stage === 1);

    expect(stage3).toHaveLength(1);
    expect(stage3[0]).toMatchObject({ x0: 3, x1: 3.5, y0: -0.8, y1: 3.0 });
    expect(stage2).toHaveLength(1);
    expect(stage2[0]).toMatchObject({ x0: 2, x1: 3, y0: -0.8, y1: 3.0 });
    // Stage 1 is two regions: the fold band at any change, and the low-fold
    // area above the absolute trigger — that is the L.
    expect(stage1).toHaveLength(2);
    expect(stage1[0]).toMatchObject({ x0: 1.5, x1: 2, y0: -0.8, y1: 3.0 });
    expect(stage1[1]).toMatchObject({ x0: 0, x1: 1.5, y0: 0.3, y1: 3.0 });
    // The no-stage box is left unpainted rather than filled white over the grid.
    expect(zones.some((zone) => zone.stage === 0)).toBe(false);
  });

  it('NEP-ZONE-002: zones paint worst-stage-first so points are always drawn on top (#120)', () => {
    expect(zonesFor().map((zone) => zone.stage)).toEqual([3, 2, 1, 1]);
  });

  it('NEP-ZONE-003: every zone is labelled once and colour is never the only cue (#120)', () => {
    const zones = zonesFor();
    const labels = zones.map((zone) => zone.label).filter(Boolean);
    expect(labels).toEqual(['Stage 3', 'Stage 2', 'Stage 1']);
    // The second Stage-1 region shares the label rather than repeating it.
    expect(zones[3].label).toBe(null);
    zones.forEach((zone) => {
      expect(STAGE_COLORS[zone.stage]).toBeTypeOf('string');
      expect(zone.fill).toContain('rgba(');
    });
    // Severity is ordinal, so the ramp has to be ordered, not categorical.
    expect(new Set(Object.values(STAGE_COLORS)).size).toBe(4);
  });

  it('NEP-ZONE-001: a custom ladder moves the zone boundaries with it (#120)', () => {
    const zones = stageZones([2, 2.5, 4], 0.5, [0, 5], [0, 2]);
    expect(zones[0]).toMatchObject({ stage: 3, x0: 4, x1: 5 });
    expect(zones[1]).toMatchObject({ stage: 2, x0: 2.5, x1: 4 });
    expect(zones[2]).toMatchObject({ stage: 1, x0: 2, x1: 2.5 });
    expect(zones[3]).toMatchObject({ stage: 1, x0: 0, x1: 2, y0: 0.5 });
  });

  it('NEP-ZONE-001: zones clip to the visible domain and vanish when it excludes them (#120)', () => {
    const zoomed = stageZones(CUTS, 0.3, [0, 2.4], [0, 1]);
    // The Stage-3 band starts past the right edge, so it is not drawn at all.
    expect(zoomed.some((zone) => zone.stage === 3)).toBe(false);
    expect(zoomed.find((zone) => zone.stage === 2)).toMatchObject({ x0: 2, x1: 2.4 });
  });

  it('NEP-UNIT-003: with the unit unresolved the absolute trigger is not drawn (#120)', () => {
    // Suppression reaches the geometry: with no mg/dL contract there is no
    // 0.3 mg/dL line to draw, so the low-fold Stage-1 region goes with it and
    // only the fold bands remain (design §4).
    const zones = stageZones(CUTS, null, X, Y);
    expect(zones.map((zone) => zone.stage)).toEqual([3, 2, 1]);
    expect(zones[2]).toMatchObject({ x0: 1.5, x1: 2 });
  });
});

describe('nep-explorer marks and tooltip', () => {
  const point = {
    id: 'AKI-9027',
    baseline: 2.71,
    max: 4.6,
    fold: 1.7,
    delta: 1.89,
    foldStage: 1,
    deltaStage: 1,
    stage: 3,
    absoluteRule: true,
    baselineVisit: 'Baseline',
    maxVisit: 'Week 8',
    maxDay: 56,
    unit: 'mg/dL',
    arm: 'AKI: Study Drug'
  };

  it('NEP-SCAT-002: the tooltip carries the source lines, in the source order (#120)', () => {
    const lines = pointTooltip(point, SETTINGS, 'Creatinine');
    expect(lines[0]).toBe('Participant: AKI-9027');
    expect(lines[1]).toBe('KDIGO stage: Stage 3');
    expect(lines[2]).toBe('Fold change: 1.7× baseline (Stage 1)');
    expect(lines[3]).toBe('Absolute change: +1.89 mg/dL (Stage 1)');
    expect(lines[4]).toBe('Baseline Creatinine: 2.71 mg/dL (Baseline)');
    expect(lines[5]).toBe('Maximum Creatinine: 4.6 mg/dL (Week 8)');
    expect(lines[6]).toBe('Maximum on study day: 56');
    // NEP-STAGE-003: the >= 4.0 mg/dL rule is invisible in the point's POSITION,
    // so it has to be said in words — otherwise a reviewer reads the Stage-1
    // zone under the mark and stops there.
    expect(lines[7]).toBe('Maximum reached 4 mg/dL: Stage 3 by the absolute-value rule');
  });

  it('NEP-SCAT-003: the study-day line degrades away rather than rendering blank (#120)', () => {
    // adbds.csv carries no DY column, so this is the demo's own path.
    const lines = pointTooltip({ ...point, maxDay: null }, SETTINGS, 'Creatinine');
    expect(lines.some((line) => /study day/.test(line))).toBe(false);
    expect(lines).toHaveLength(7);
  });

  it('NEP-UNIT-003: a suppressed delta stage is reported as unstageable, not as Stage 0 (#120)', () => {
    const lines = pointTooltip(
      { ...point, deltaStage: null, absoluteRule: false, stage: 1, unit: 'arb. units' },
      SETTINGS,
      'Creatinine'
    );
    expect(lines[3]).toBe('Absolute change: +1.89 arb. units (not staged — unit not recognized)');
    expect(lines.some((line) => /absolute-value rule/.test(line))).toBe(false);
  });

  it('NEP-SCAT-002: a negative change keeps its sign and stays Stage 0 (#120)', () => {
    const lines = pointTooltip(
      {
        ...point,
        delta: -0.3,
        fold: 0.89,
        foldStage: 0,
        deltaStage: 0,
        stage: 0,
        absoluteRule: false
      },
      SETTINGS,
      'Creatinine'
    );
    expect(lines[1]).toBe('KDIGO stage: No stage');
    expect(lines[3]).toBe('Absolute change: −0.3 mg/dL (No stage)');
  });

  it('NEP-SCAT-001: the >= 4.0 mg/dL rule gets a distinct mark, and the selected point a border (#120)', () => {
    const points = [
      { stage: 0, absoluteRule: false },
      { stage: 3, absoluteRule: true },
      { stage: 2, absoluteRule: false }
    ];
    const styles = markStyles(points, 1);
    // A ringed, larger mark for the rule (D5) — a property of the participant,
    // never a shift in the point's position.
    expect(styles.pointStyle[1]).not.toBe(styles.pointStyle[0]);
    expect(styles.radius[1]).toBeGreaterThan(styles.radius[0]);
    expect(styles.radius[2]).toBe(styles.radius[0]);
    // Stage drives the fill, so the cloud reads by severity without the zones.
    expect(styles.background[0]).not.toBe(styles.background[2]);
  });

  it('NEP-SCAT-004: selection styling thickens exactly one point (#120)', () => {
    const borders = selectionBorders(3, 1);
    expect(borders.widths).toEqual([1, 3, 1]);
    expect(borders.colors[1]).not.toBe(borders.colors[0]);
    const none = selectionBorders(3, -1);
    expect(none.widths).toEqual([1, 1, 1]);
  });
});
