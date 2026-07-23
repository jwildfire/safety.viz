import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/hep-waterfall/configure.js';
import {
  axisTitle,
  flankScales,
  formatNumber,
  mirroredScales,
  resolveUnit,
  waterfallDomain
} from '../../../src/hep-waterfall/getScales.js';
import { buildWaterfall, prepareData } from '../../../src/hep-waterfall/structureData.js';
import { ARM_SETTINGS, makeRows } from './fixture.js';

// The absolute-U/L domain, the mirrored left/right axes and the unit
// resolution for the modified ALT waterfall (#93). Requirement groups
// HWF-AXIS-001/002/003 and HWF-DATA-006/007.

const settings = syncSettings(ARM_SETTINGS);
const { rows } = prepareData(makeRows(), settings);
const waterfall = buildWaterfall(rows, settings);
const values = waterfall.ordered.flatMap((subject) => [subject.baseline, subject.peak]);

describe('hep-waterfall getScales.waterfallDomain', () => {
  it('HWF-AXIS-001: the domain is in the absolute measurement units (#93)', () => {
    const [min, max] = waterfallDomain(values);
    // The fixture's extremes are 55 and 400 U/L. A xULN axis would top out
    // near 10 and a xBaseline axis near 2 — neither can contain 400.
    expect(max).toBeGreaterThanOrEqual(400);
    expect(max).toBeLessThan(500);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(min).toBeLessThanOrEqual(55);
  });

  it('HWF-AXIS-001: the reference range is kept inside the domain (#93)', () => {
    const [min, max] = waterfallDomain([200, 300], [40, 600]);
    expect(min).toBeLessThanOrEqual(40);
    expect(max).toBeGreaterThanOrEqual(600);
  });

  it('HWF-AXIS-001: an empty or non-finite sample still yields a usable domain (#93)', () => {
    const [min, max] = waterfallDomain([]);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(min);
    expect(waterfallDomain([NaN, undefined, 'x']).every(Number.isFinite)).toBe(true);
    // A single-valued cohort must not collapse to a zero-height axis.
    const [flatMin, flatMax] = waterfallDomain([40, 40, 40]);
    expect(flatMax).toBeGreaterThan(flatMin);
  });
});

describe('hep-waterfall getScales.mirroredScales', () => {
  it('HWF-AXIS-002: the right axis takes its min and max from the same domain call (#93)', () => {
    const domain = waterfallDomain(values);
    const { y, y1 } = mirroredScales(domain, 'ALT (U/L)');
    expect(y1.min).toBe(y.min);
    expect(y1.max).toBe(y.max);
    expect(y.min).toBe(domain[0]);
    expect(y.max).toBe(domain[1]);
    expect(y.position).toBe('left');
    expect(y1.position).toBe('right');
    // The mirrored axis carries no dataset, so it must not double-draw the grid.
    expect(y1.grid.drawOnChartArea).toBe(false);
  });

  it('HWF-AXIS-003: both axis titles name the measure and its unit (#93)', () => {
    const { y, y1 } = mirroredScales(waterfallDomain(values), axisTitle('ALT', 'U/L'));
    expect(y.title.text).toBe('ALT (U/L)');
    expect(y1.title.text).toBe('ALT (U/L)');
    expect(y.title.display).toBe(true);
    expect(y1.title.display).toBe(true);
    // Absolute units, never a ratio suffix.
    expect(y.title.text).not.toMatch(/×|xULN|Baseline/);
    expect(axisTitle('AST', 'IU/L')).toBe('AST (IU/L)');
  });

  it('HWF-BOX-002: the flanking panels share the main chart vertical domain (#93)', () => {
    const domain = waterfallDomain(values);
    const flank = flankScales(domain, 2);
    expect(flank.y.min).toBe(domain[0]);
    expect(flank.y.max).toBe(domain[1]);
    expect(flank.y.display).toBe(false);
    expect(flank.x.min).toBeLessThan(0);
    expect(flank.x.max).toBeGreaterThan(1);
    expect(flankScales(domain, 1).x.max).toBeLessThan(flank.x.max);
  });
});

describe('hep-waterfall getScales.resolveUnit', () => {
  it('HWF-DATA-006: the axis unit is the modal unit of the plotted measure (#93)', () => {
    const mixedRows = makeRows({ altUnit: (id) => (id === 'P4' ? 'IU/L' : 'U/L') });
    const prepared = prepareData(mixedRows, settings).rows;
    const resolved = resolveUnit(prepared, settings, 'ALT');
    expect(resolved.unit).toBe('U/L');
    // Total bilirubin carries its own unit; the resolution is per measure.
    expect(resolveUnit(prepared, settings, 'TB').unit).toBe('mg/dL');
  });

  it('HWF-DATA-006: an unmapped or empty unit column falls back to U/L (#93)', () => {
    const unitless = prepareData(
      makeRows(),
      syncSettings({ ...ARM_SETTINGS, unit_col: null })
    ).rows;
    expect(
      resolveUnit(unitless, syncSettings({ ...ARM_SETTINGS, unit_col: null }), 'ALT').unit
    ).toBe('U/L');
    expect(resolveUnit([], settings, 'ALT').unit).toBe('U/L');
  });

  it('HWF-DATA-007: mixed units across participants are reported as mixed (#93)', () => {
    expect(resolveUnit(rows, settings, 'ALT').mixed).toBe(false);
    const mixedRows = makeRows({ altUnit: (id) => (id === 'P4' ? 'IU/L' : 'U/L') });
    const resolved = resolveUnit(prepareData(mixedRows, settings).rows, settings, 'ALT');
    expect(resolved.mixed).toBe(true);
    expect(resolved.units.sort()).toEqual(['IU/L', 'U/L']);
  });
});

describe('hep-waterfall getScales.formatNumber', () => {
  it('HWF-AXIS-003: values format without spurious precision (#93)', () => {
    expect(formatNumber(40)).toBe('40');
    expect(formatNumber(40.257)).toBe('40.3');
    expect(formatNumber(NaN)).toBe('');
  });
});
