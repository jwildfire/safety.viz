// @vitest-environment jsdom
// The histogram's two p-value settings are removed (#188; @jwildfire,
// 2026-10-03): `test_normality` and `compare_distributions` each put a
// p-value on the chart that safety.viz worked out in JavaScript with a
// shortcut. v1.9.1 deprecated them and said v1.10.0 removes them. From
// v1.10.0 the histogram computes no p-value: a caller that still passes one
// of them gets the chart without the annotation and one line in the console.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
const { DEFAULT_SETTINGS, REMOVED_SETTINGS, removedSetting, syncSettings } =
  await import('../../../src/histogram/configure.js');
const plugins = await import('../../../src/histogram/getPlugins.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

// jsdom replaces the global URL, so paths are built with node:path.
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src');

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
const said = (name) => warn.mock.calls.filter(([message]) => message.includes(`\`${name}\``));

describe('the histogram’s removed p-value settings', () => {
  it('SH-CHART-008: the histogram has no `test_normality` or `compare_distributions` setting and computes no p-value: neither is a default, neither is kept when passed, and no p-value function is left in the module (#188)', () => {
    expect(REMOVED_SETTINGS).toEqual(['test_normality', 'compare_distributions']);
    for (const name of REMOVED_SETTINGS) {
      expect(DEFAULT_SETTINGS, name).not.toHaveProperty(name);
      expect(syncSettings({ [name]: true }), name).not.toHaveProperty(name);
    }
    expect(Object.keys(plugins).sort()).toEqual(
      ['binDescription', 'normalRangePlugin', 'selectionColors'].sort()
    );
    // Nothing under src/ names the two p-value functions, or documents either setting.
    const files = (directory) =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : [path.join(directory, entry.name)]
      );
    const naming = files(src).filter((file) =>
      /approximateNormalityP|approximateGroupP|formatPValue|statisticalAnnotation/.test(
        readFileSync(file, 'utf8')
      )
    );
    expect(naming).toEqual([]);
    const configure = readFileSync(path.join(src, 'histogram/configure.js'), 'utf8');
    expect(configure).not.toMatch(/@property \{boolean\} \[(test_normality|compare_distributions)/);
  });

  it('SH-CHART-008: a chart given `test_normality` draws with no annotation and no p-value, and says once in the console that the setting was removed and is ignored (#188)', () => {
    expect(removedSetting('test_normality')).toBe(
      'safety.viz histogram: `test_normality` was removed in v1.10.0 and is ignored. ' +
        'The histogram draws no p-value: run the test in R.'
    );
    const instance = build({ test_normality: true });
    expect(instance.settings).not.toHaveProperty('test_normality');
    expect(instance.mainAnnotation.textContent).toBe('');
    expect(instance.element.textContent).not.toMatch(/p\s*=|Normality|Deprecated/);
    expect(said('test_normality')).toEqual([[removedSetting('test_normality')]]);
    // Drawn again, or passed again, it is not said again.
    instance.render();
    instance.setSettings({ bins: 12 });
    instance.setSettings({ test_normality: true });
    expect(said('test_normality')).toHaveLength(1);
    expect(said('compare_distributions')).toEqual([]);
  });

  it('SH-CHART-008: a grouped chart given `compare_distributions` draws its panels with no comparison, and says so once in the console; a chart given neither says nothing (#188)', () => {
    const quiet = build({ group_by: 'SEX' });
    expect(quiet.multiplesWrap.querySelectorAll('.sv-multiple').length).toBeGreaterThan(1);
    expect(REMOVED_SETTINGS.flatMap(said)).toEqual([]);
    // Off is not a use of it: a caller who passed false is told nothing.
    build({ test_normality: false, compare_distributions: false });
    expect(REMOVED_SETTINGS.flatMap(said)).toEqual([]);

    const instance = build({ compare_distributions: true, group_by: 'SEX' });
    expect(instance.multiplesWrap.querySelectorAll('.sv-multiple').length).toBeGreaterThan(1);
    expect(instance.multiplesWrap.querySelector('.sv-annotation')).toBeNull();
    expect(instance.element.textContent).not.toMatch(/p\s*=|Group comparison|Deprecated/);
    expect(said('compare_distributions')).toEqual([[removedSetting('compare_distributions')]]);
    // Turned on later through setSettings, the other is said then.
    instance.setSettings({ test_normality: true });
    expect(said('test_normality')).toEqual([[removedSetting('test_normality')]]);
    expect(said('compare_distributions')).toHaveLength(1);
  });
});
