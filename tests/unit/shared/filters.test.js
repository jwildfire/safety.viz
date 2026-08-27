// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  ALL_VALUE,
  filterMatches,
  initFilterState,
  normalizeFilterSpec,
  renderFilterControl
} from '../../../src/filters.js';

// The shared filter contract (#136, obot.roadmap#33 QW1). In 2021 the
// maintainer of the original renderers filed the same issue against six of
// them: "webcharts supports start/all/multiple but the filters in most of the
// safety explorer modules are hard coded with only the value_col and label
// properties - even if other properties are specified." Five years on it was
// still true of the port. This module is the one place that decides what a
// filter spec means, so declaring one is the same act in every renderer.
//
// The warning that came with the original request is a test here, not a
// comment: `all` must never be truthiness-tested, because false is the value
// that does something.

describe('shared: normalizeFilterSpec', () => {
  it('FILT-001: a bare column name is a filter with an All option and one selection (#136)', () => {
    expect(normalizeFilterSpec('SEX')).toEqual({
      value_col: 'SEX',
      label: 'SEX',
      start: null,
      all: true,
      multiple: false
    });
    expect(normalizeFilterSpec('SEX', 'Sex').label).toBe('Sex');
  });

  it('FILT-001: a spec object keeps its extra keys and defaults the label to the column (#136)', () => {
    const spec = normalizeFilterSpec({ value_col: 'ARM', type: 'participant' });
    expect(spec.label).toBe('ARM');
    expect(spec.type).toBe('participant');
  });

  it('FILT-002: a start value is the opening selection, and suppresses All unless All is asked for (#136)', () => {
    const started = normalizeFilterSpec({ value_col: 'ARM', start: 'Placebo' });
    expect(started.start).toBe('Placebo');
    expect(started.all).toBe(false);
    expect(normalizeFilterSpec({ value_col: 'ARM', start: 'Placebo', all: true }).all).toBe(true);
  });

  it('FILT-002: a start of 0 or false is a real column value, not an absent start (#136)', () => {
    expect(normalizeFilterSpec({ value_col: 'N', start: 0 }).start).toBe('0');
    expect(normalizeFilterSpec({ value_col: 'FLAG', start: false }).start).toBe('false');
    expect(normalizeFilterSpec({ value_col: 'N', start: 0 }).all).toBe(false);
  });

  it('FILT-002: an empty string, null or empty array is no start at all (#136)', () => {
    expect(normalizeFilterSpec({ value_col: 'ARM', start: '' }).start).toBe(null);
    expect(normalizeFilterSpec({ value_col: 'ARM', start: null }).start).toBe(null);
    expect(normalizeFilterSpec({ value_col: 'ARM', start: [], multiple: true }).start).toBe(null);
    expect(normalizeFilterSpec({ value_col: 'ARM', start: '' }).all).toBe(true);
  });

  it('FILT-003: all:false is honoured — it is never truthiness-tested (#136)', () => {
    expect(normalizeFilterSpec({ value_col: 'ARM', all: false }).all).toBe(false);
    expect(normalizeFilterSpec({ value_col: 'ARM', all: true }).all).toBe(true);
    expect(normalizeFilterSpec({ value_col: 'ARM' }).all).toBe(true);
  });

  it('FILT-004: multiple takes an array start, and a scalar start becomes a one-value array (#136)', () => {
    expect(
      normalizeFilterSpec({ value_col: 'SOC', multiple: true, start: ['A', 'B'] }).start
    ).toEqual(['A', 'B']);
    expect(normalizeFilterSpec({ value_col: 'SOC', multiple: true, start: 'A' }).start).toEqual([
      'A'
    ]);
    expect(normalizeFilterSpec({ value_col: 'SOC', multiple: true }).multiple).toBe(true);
  });

  it('FILT-004: a single-value filter given an array start takes the first entry (#136)', () => {
    expect(normalizeFilterSpec({ value_col: 'ARM', start: ['Placebo', 'Drug'] }).start).toBe(
      'Placebo'
    );
  });
});

describe('shared: initFilterState', () => {
  it('FILT-002: the opening state is the start values, and null where there is no start (#136)', () => {
    const specs = [
      normalizeFilterSpec({ value_col: 'ARM', start: 'Placebo' }),
      normalizeFilterSpec('SEX'),
      normalizeFilterSpec({ value_col: 'SOC', multiple: true, start: ['A'] })
    ];
    expect(initFilterState(specs)).toEqual({ ARM: 'Placebo', SEX: null, SOC: ['A'] });
  });

  it('FILT-002: no specs is an empty state, and a nullish spec list does not throw (#136)', () => {
    expect(initFilterState([])).toEqual({});
    expect(initFilterState(null)).toEqual({});
  });
});

describe('shared: filterMatches', () => {
  it('FILT-005: no selection places no restriction — null, undefined and empty string all pass (#136)', () => {
    expect(filterMatches('F', null)).toBe(true);
    expect(filterMatches('F', undefined)).toBe(true);
    expect(filterMatches('F', '')).toBe(true);
  });

  it('FILT-005: a scalar selection compares as a string, so 1 matches "1" (#136)', () => {
    expect(filterMatches(1, '1')).toBe(true);
    expect(filterMatches('M', 'F')).toBe(false);
  });

  it('FILT-005: an array selection is membership, and an empty array matches nothing (#136)', () => {
    expect(filterMatches('B', ['A', 'B'])).toBe(true);
    expect(filterMatches('C', ['A', 'B'])).toBe(false);
    expect(filterMatches('A', [])).toBe(false);
  });
});

describe('shared: renderFilterControl', () => {
  const values = ['Drug', 'Placebo'];

  it('FILT-001: a plain filter renders a select whose first option is All (#136)', () => {
    const control = renderFilterControl({
      spec: normalizeFilterSpec('ARM'),
      values,
      selected: null,
      onChange: () => {}
    });
    expect(control.tagName).toBe('SELECT');
    expect([...control.options].map((node) => node.textContent)).toEqual([
      'All',
      'Drug',
      'Placebo'
    ]);
    expect(control.value).toBe(ALL_VALUE);
  });

  it('FILT-003: all:false renders the same select with no All option (#136)', () => {
    const control = renderFilterControl({
      spec: normalizeFilterSpec({ value_col: 'ARM', all: false }),
      values,
      selected: 'Drug',
      onChange: () => {}
    });
    expect([...control.options].map((node) => node.textContent)).toEqual(['Drug', 'Placebo']);
    expect(control.value).toBe('Drug');
  });

  it('FILT-001: choosing All reports no selection, and choosing a value reports it (#136)', () => {
    const onChange = vi.fn();
    const control = renderFilterControl({
      spec: normalizeFilterSpec('ARM'),
      values,
      selected: null,
      onChange
    });
    control.value = 'Placebo';
    control.onchange();
    expect(onChange).toHaveBeenLastCalledWith('Placebo');
    control.value = ALL_VALUE;
    control.onchange();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('FILT-004: a multiple filter renders the shared multiselect and reports an array (#136)', () => {
    const onChange = vi.fn();
    const control = renderFilterControl({
      spec: normalizeFilterSpec({ value_col: 'ARM', multiple: true }),
      values,
      selected: null,
      onChange
    });
    expect(control.classList.contains('sv-multiselect')).toBe(true);
    const boxes = [...control.querySelectorAll('.sv-ms-option:not(.sv-ms-all) input')];
    expect(boxes.map((box) => box.value)).toEqual(values);
    expect(boxes.every((box) => box.checked)).toBe(true);
    boxes[0].checked = false;
    boxes[0].onchange();
    expect(onChange).toHaveBeenLastCalledWith(['Placebo']);
  });

  it('FILT-004: a multiple filter opens on its start values (#136)', () => {
    const control = renderFilterControl({
      spec: normalizeFilterSpec({ value_col: 'ARM', multiple: true, start: ['Drug'] }),
      values,
      selected: ['Drug'],
      onChange: () => {}
    });
    const boxes = [...control.querySelectorAll('.sv-ms-option:not(.sv-ms-all) input')];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
  });
});
