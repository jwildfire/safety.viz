import { describe, it, expect } from 'vitest';
import { availableDisplays, groupOrder } from '../../../src/hep-explorer/availability.js';
import { GROUP_COLORS, paletteColor } from '../../../src/hep-explorer/getPlugins.js';

// Three of the v1.2 follow-ups (#55): offering only the display modes the data
// can support, ordering the legend by a numeric companion column, and not
// handing two groups the same colour once the palette runs out.
// Requirement groups HEP-DISPLAY-006, HEP-CTRL-015, HEP-CTRL-016.

const row = (over = {}) => ({ __hep_uln: 40, __hep_baseline: 30, ...over });

describe('hep-explorer display availability (HEP-DISPLAY-006)', () => {
  it('HEP-DISPLAY-006: both modes are offered when the data supports both (#55)', () => {
    const available = availableDisplays([row(), row()]);
    expect(available.modes).toEqual(['relative_uln', 'relative_baseline']);
    expect(available.note).toBe('');
  });

  it('HEP-DISPLAY-006: the baseline mode is withdrawn, with a reason, when nothing has one (#55)', () => {
    const available = availableDisplays([row({ __hep_baseline: NaN }), row({ __hep_baseline: 0 })]);
    expect(available.modes).toEqual(['relative_uln']);
    expect(available.note).toMatch(/baseline/i);
    // A single participant with a baseline is enough to keep the mode: the
    // control is about what the data CAN do, not about how much of it does.
    expect(availableDisplays([row({ __hep_baseline: NaN }), row()]).modes).toContain(
      'relative_baseline'
    );
  });

  it('HEP-DISPLAY-006: no reference range withdraws the eDISH mode instead (#55)', () => {
    const available = availableDisplays([row({ __hep_uln: NaN }), row({ __hep_uln: 0 })]);
    expect(available.modes).toEqual(['relative_baseline']);
    expect(available.note).toMatch(/reference range|upper limit/i);
  });

  it('HEP-DISPLAY-006: neither is an error the caller can render, not an empty plot (#55)', () => {
    const available = availableDisplays([row({ __hep_uln: NaN, __hep_baseline: NaN })]);
    expect(available.modes).toEqual([]);
    expect(available.note).toMatch(/neither/i);
    expect(availableDisplays([]).modes).toEqual([]);
  });
});

describe('hep-explorer legend ordering (HEP-CTRL-015)', () => {
  const points = [
    { group: 'High dose', raw: { TRTN: '3' } },
    { group: 'Placebo', raw: { TRTN: '1' } },
    { group: 'Low dose', raw: { TRTN: '2' } }
  ];

  it('HEP-CTRL-015: a numeric companion column orders the groups by dose, not by spelling (#55)', () => {
    expect(groupOrder(['High dose', 'Low dose', 'Placebo'], points, 'TRTN')).toEqual([
      'Placebo',
      'Low dose',
      'High dose'
    ]);
  });

  it('HEP-CTRL-015: without a companion column the groups stay alphabetical (#55)', () => {
    expect(groupOrder(['High dose', 'Low dose', 'Placebo'], points, null)).toEqual([
      'High dose',
      'Low dose',
      'Placebo'
    ]);
    // A companion column that is absent or non-numeric for a group sorts that
    // group last, alphabetically among its peers, rather than anywhere.
    const partial = [
      { group: 'B', raw: { TRTN: '2' } },
      { group: 'A', raw: {} },
      { group: 'C', raw: { TRTN: '1' } }
    ];
    expect(groupOrder(['A', 'B', 'C'], partial, 'TRTN')).toEqual(['C', 'B', 'A']);
  });
});

describe('hep-explorer palette beyond the base colours (HEP-CTRL-016)', () => {
  it('HEP-CTRL-016: the first groups take the base palette unchanged (#55)', () => {
    GROUP_COLORS.forEach((color, index) => expect(paletteColor(index)).toBe(color));
  });

  it('HEP-CTRL-016: past the palette, groups get shaded variants rather than repeats (#55)', () => {
    const many = Array.from({ length: GROUP_COLORS.length * 3 }, (_, index) => paletteColor(index));
    expect(new Set(many).size).toBe(many.length);
    many.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
    // Only once all three tiers are exhausted does the cycle begin again.
    expect(paletteColor(GROUP_COLORS.length * 3)).toBe(paletteColor(0));
  });
});
