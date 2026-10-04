// @vitest-environment jsdom
// The histogram's normality screen is deprecated (#188; @jwildfire,
// 2026-10-03): `test_normality` computes an approximate p-value in
// JavaScript, and safety.viz is to compute no statistical test there. In
// this release the setting still works and says, in the chart and once in
// the console, that it is deprecated and will be removed; the release after
// removes it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.destroyed = false;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.built = [];
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: histogram } = await import('../../../src/histogram.js');
const { NORMALITY_DEPRECATED, COMPARISON_DEPRECATED } =
  await import('../../../src/histogram/configure.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

let warn;
beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const build = (settings = {}) => {
  const instance = histogram(document.querySelector('#host'), {
    start_value: `${ALT_TEST} (U/L)`,
    ...settings
  });
  instance.init(makeRows());
  return instance;
};
const deprecations = () => warn.mock.calls.filter(([message]) => /test_normality/.test(message));

describe('the deprecated normality screen', () => {
  it('SH-CHART-006: with test_normality the chart says the screen is deprecated and will be removed, beside the screen, and the console says so once (#188)', () => {
    expect(NORMALITY_DEPRECATED).toBe(
      'safety.viz histogram: `test_normality` is deprecated and will be removed in a later release. ' +
        'Its normality screen is an approximation computed in JavaScript, and safety.viz is to compute no statistical test there.'
    );
    const instance = build({ test_normality: true });
    const note = instance.mainAnnotation.querySelector('.sv-deprecation');
    expect(note).not.toBeNull();
    expect(note.textContent).toBe(
      'Deprecated: this normality screen (test_normality) will be removed in a later release.'
    );
    // The screen itself is still drawn in this release.
    expect(instance.mainAnnotation.textContent).toMatch(/Normality: p=/);
    expect(deprecations()).toEqual([[NORMALITY_DEPRECATED]]);
    // Drawn again, it does not say so again in the console.
    instance.render();
    instance.setSettings({ bins: 12 });
    expect(deprecations()).toHaveLength(1);
    expect(instance.mainAnnotation.querySelector('.sv-deprecation')).not.toBeNull();
    // The settings reference says so: it is generated from this JSDoc.
    // jsdom replaces the global URL, so the path is built with node:path.
    const source = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../src/histogram/configure.js'
      ),
      'utf8'
    );
    expect(source).toMatch(
      /@property \{boolean\} \[test_normality=false\] Deprecated, and to be removed in a later release \(#188\)\./
    );
  });

  it('SH-CHART-006: without it, nothing is said; turned on later, it is said then (#188)', () => {
    const instance = build();
    expect(instance.mainAnnotation.querySelector('.sv-deprecation')).toBeNull();
    expect(deprecations()).toEqual([]);
    instance.setSettings({ test_normality: true });
    expect(deprecations()).toEqual([[NORMALITY_DEPRECATED]]);
    expect(instance.mainAnnotation.querySelector('.sv-deprecation')).not.toBeNull();
  });

  it('SH-CHART-007: with compare_distributions the chart says the group comparison is deprecated and will be removed, once in its annotation while grouped, and the console says so once (#188)', () => {
    expect(COMPARISON_DEPRECATED).toBe(
      'safety.viz histogram: `compare_distributions` is deprecated and will be removed in a later release. ' +
        'Its group comparison is an approximation computed in JavaScript, and safety.viz is to compute no statistical test there.'
    );
    const comparisons = () =>
      warn.mock.calls.filter(([message]) => /compare_distributions/.test(message));
    const instance = build({ compare_distributions: true, group_by: 'SEX' });
    const notes = instance.mainAnnotation.querySelectorAll('.sv-deprecation');
    expect([...notes].map((note) => note.textContent)).toEqual([
      'Deprecated: the group comparison (compare_distributions) will be removed in a later release.'
    ]);
    // Not repeated in the panels.
    expect(instance.multiplesWrap.querySelector('.sv-deprecation')).toBeNull();
    // The comparison itself is still drawn in each panel in this release.
    expect(instance.multiplesWrap.textContent).toMatch(/Group comparison: p=/);
    expect(comparisons()).toEqual([[COMPARISON_DEPRECATED]]);
    instance.render();
    expect(comparisons()).toHaveLength(1);
    // Only the setting that is on is warned about.
    expect(deprecations()).toEqual([]);
  });

  it('SH-CHART-007: without it, nothing is said; turned on later, it is said then (#188)', () => {
    const comparisons = () =>
      warn.mock.calls.filter(([message]) => /compare_distributions/.test(message));
    const instance = build({ group_by: 'SEX' });
    expect(instance.mainAnnotation.querySelector('.sv-deprecation')).toBeNull();
    expect(comparisons()).toEqual([]);
    instance.setSettings({ compare_distributions: true });
    expect(comparisons()).toEqual([[COMPARISON_DEPRECATED]]);
    expect(instance.mainAnnotation.querySelector('.sv-deprecation').textContent).toMatch(
      /compare_distributions/
    );
    const source = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../src/histogram/configure.js'
      ),
      'utf8'
    );
    expect(source).toMatch(
      /@property \{boolean\} \[compare_distributions=false\] Deprecated, and to be removed in a later release \(#188\)\./
    );
  });
});
