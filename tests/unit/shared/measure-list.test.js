import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveMeasureList } from '../../../src/measure-list.js';

// The shared measure-list resolution (#136, obot.roadmap#33 QW2). Five
// renderers built their Measure control from one identical line — every
// measure in the data, alphabetical — and the legacy trackers asked twice over
// for the two things that line forbids: subset the dropdown (2016) and order
// it by something other than the alphabet (2021). One ordered whitelist
// answers both. This file lives under tests/unit/shared/ (not a registered
// renderer module), so its records route to shared-scaffold evidence.

const PRESENT = [
  { label: 'Sodium (mmol/L)', name: 'Sodium' },
  { label: 'Albumin (g/dL)', name: 'Albumin' },
  { label: 'Creatinine (mg/dL)', name: 'Creatinine' }
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shared: resolveMeasureList', () => {
  it('MEAS-001: an unset whitelist offers every measure in the data, alphabetically (#136)', () => {
    expect(resolveMeasureList(PRESENT, null)).toEqual([
      'Albumin (g/dL)',
      'Creatinine (mg/dL)',
      'Sodium (mmol/L)'
    ]);
    expect(resolveMeasureList(PRESENT, [])).toEqual(resolveMeasureList(PRESENT, null));
    expect(resolveMeasureList(PRESENT, undefined)).toEqual(resolveMeasureList(PRESENT, null));
  });

  it('MEAS-001: a whitelist subsets the control and keeps its own order, not the alphabet (#136)', () => {
    expect(resolveMeasureList(PRESENT, ['Sodium (mmol/L)', 'Albumin (g/dL)'])).toEqual([
      'Sodium (mmol/L)',
      'Albumin (g/dL)'
    ]);
  });

  it('MEAS-001: a whitelist entry matches the bare measure name as well as the displayed label (#136)', () => {
    expect(resolveMeasureList(PRESENT, ['Creatinine', 'Albumin (g/dL)'])).toEqual([
      'Creatinine (mg/dL)',
      'Albumin (g/dL)'
    ]);
  });

  it('MEAS-001: a bare string is accepted as a one-entry whitelist (#136)', () => {
    expect(resolveMeasureList(PRESENT, 'Albumin (g/dL)')).toEqual(['Albumin (g/dL)']);
  });

  it('MEAS-001: a repeated entry is offered once, in its first position (#136)', () => {
    expect(
      resolveMeasureList(PRESENT, ['Sodium (mmol/L)', 'Albumin (g/dL)', 'Sodium (mmol/L)'])
    ).toEqual(['Sodium (mmol/L)', 'Albumin (g/dL)']);
  });

  it('MEAS-002: a configured measure absent from the data is dropped, and named in a warning (#136)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveMeasureList(PRESENT, ['Albumin (g/dL)', 'Bilirubin'])).toEqual([
      'Albumin (g/dL)'
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Bilirubin');
  });

  it('MEAS-002: a whitelist matching nothing falls back to every measure rather than blanking the control (#136)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveMeasureList(PRESENT, ['Bilirubin', 'Platelets'])).toEqual([
      'Albumin (g/dL)',
      'Creatinine (mg/dL)',
      'Sodium (mmol/L)'
    ]);
    expect(warn).toHaveBeenCalled();
  });

  it('MEAS-002: warnings are suppressible so a per-render caller does not spam the console (#136)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveMeasureList(PRESENT, ['Bilirubin'], { warn: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it('MEAS-001: one bare name matching several unit variants offers them all, in that slot (#136)', () => {
    const mixed = [
      { label: 'Glucose (mg/dL)', name: 'Glucose' },
      { label: 'Albumin (g/dL)', name: 'Albumin' },
      { label: 'Glucose (mmol/L)', name: 'Glucose' }
    ];
    expect(resolveMeasureList(mixed, ['Glucose', 'Albumin (g/dL)'])).toEqual([
      'Glucose (mg/dL)',
      'Glucose (mmol/L)',
      'Albumin (g/dL)'
    ]);
  });

  it('MEAS-001: no measures in the data resolves to an empty control, configured or not (#136)', () => {
    expect(resolveMeasureList([], null)).toEqual([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveMeasureList([], ['Albumin'])).toEqual([]);
  });
});
