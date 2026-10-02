// @vitest-environment jsdom
// qt-explorer standing cautions (#136, QT-CAUTION-001/QT-CAUTION-002).
//
// The module ALREADY prints "Exploratory tool — confirm signals with validated
// ICH-E14 analyses." into each view's footnote (setCentralFootnote, and the
// tail of the outlier / categorical footnotes). That is not enough, for three
// reasons this file pins down:
//   (a) render() blanks the footnote in its preamble and returns early when
//       every row cleans away, so the all-rows-removed state carries no caution;
//   (b) renderOutlier() and renderCategorical() blank the footnote outright on
//       the heart-rate (QTc-only) path, so selecting Correction = Heart Rate on
//       either view wipes the caution exactly when a reader is furthest from a
//       validated analysis;
//   (c) the wording never says "not validated for clinical use", which is what
//       the legacy reviewers asked for and what hep-explorer's HEP-CAUTION-001
//       already says.
// The fix mirrors hep-explorer: mount the caution ONCE into the module shell,
// where no view can rewrite it. A second, conditional warning covers unblinding
// — every qt view colours and legends participants by treatment arm.
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    ScatterController: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: qtExplorer } = await import('../../../src/qt-explorer.js');
const { CLINICAL_CAUTION, UNBLINDING_CAUTION } =
  await import('../../../src/qt-explorer/configure.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

/** Deterministic ECG fixture: `arms` × two participants × three visits, QTcF + Heart Rate. */
function ecgRows(
  arms = [
    ['Placebo', 'PBO', [0, 2, 1]],
    ['High Dose', 'XHI', [0, 30, 55]]
  ]
) {
  const rows = [];
  const visits = [
    { VISIT: 'Baseline', VISITNUM: 0, ABLFL: 'Y' },
    { VISIT: 'Week 2', VISITNUM: 2, ABLFL: '' },
    { VISIT: 'Week 4', VISITNUM: 4, ABLFL: '' }
  ];
  arms.forEach(([arm, code, drift]) => {
    for (let i = 0; i < 2; i += 1) {
      const id = `${code}-${i + 1}`;
      const baseF = 400 + i * 10;
      const baseHR = 60 + i;
      visits.forEach((v, vi) => {
        const chg = v.ABLFL === 'Y' ? 0 : drift[vi] + i;
        rows.push(
          {
            USUBJID: id,
            ARM: arm,
            SEX: i % 2 ? 'M' : 'F',
            VISIT: v.VISIT,
            VISITNUM: v.VISITNUM,
            ABLFL: v.ABLFL,
            TEST: 'QTcF',
            STRESU: 'msec',
            STRESN: baseF + chg,
            BASE: baseF,
            CHG: chg
          },
          {
            USUBJID: id,
            ARM: arm,
            SEX: i % 2 ? 'M' : 'F',
            VISIT: v.VISIT,
            VISITNUM: v.VISITNUM,
            ABLFL: v.ABLFL,
            TEST: 'Heart Rate',
            STRESU: 'bpm',
            STRESN: baseHR + Math.round(chg / 10),
            BASE: baseHR,
            CHG: Math.round(chg / 10)
          }
        );
      });
    }
  });
  return rows;
}

function build(settings = {}, rows = ecgRows()) {
  const instance = qtExplorer(document.querySelector('#host'), settings);
  instance.init(rows);
  return instance;
}

function rerender(instance) {
  instance.buildControls();
  instance.render();
}

/** Every rendered caution line in the module shell, in DOM order. */
function cautions(instance) {
  return [...instance.element.querySelectorAll('.qt-caution')]
    .filter((el) => !el.hidden)
    .map((el) => el.textContent);
}

describe('qt-explorer standing caution (QT-CAUTION-001)', () => {
  it('QT-CAUTION-001: the not-for-clinical-use caution is mounted once into the module shell (#136)', () => {
    const instance = build();
    const mounted = instance.element.querySelectorAll('.qt-caution');
    expect(mounted.length).toBeGreaterThan(0);
    expect(instance.cautionEl.textContent).toBe(CLINICAL_CAUTION);
    expect(instance.cautionEl.textContent).toMatch(/not validated for clinical use/i);
    // Mounted in the main column, NOT inside the view-owned footnote.
    expect(instance.footnote.contains(instance.cautionEl)).toBe(false);
    expect(instance.main.contains(instance.cautionEl)).toBe(true);
  });

  it('QT-CAUTION-001: the caution survives every view switch (#136)', () => {
    const instance = build();
    ['central', 'outlier', 'categorical'].forEach((view) => {
      instance.state.view = view;
      rerender(instance);
      expect(instance.cautionEl.textContent).toBe(CLINICAL_CAUTION);
      expect(instance.cautionEl.hidden).toBe(false);
      expect(cautions(instance)).toContain(CLINICAL_CAUTION);
    });
  });

  it('QT-CAUTION-001: the caution survives the heart-rate paths that blank the footnote (#136)', () => {
    const instance = build();
    instance.state.measure = 'Heart Rate';
    ['outlier', 'categorical'].forEach((view) => {
      instance.state.view = view;
      rerender(instance);
      // The view-owned footnote IS blanked here — that is the reason this
      // requirement exists.
      expect(instance.footnote.textContent).toBe('');
      expect(instance.noteEl.classList.contains('qt-empty')).toBe(false);
      // ...and the caution survives anyway.
      expect(instance.cautionEl.textContent).toBe(CLINICAL_CAUTION);
      expect(instance.cautionEl.hidden).toBe(false);
    });
  });

  it('QT-CAUTION-001: the caution survives the no-usable-rows render (#136)', () => {
    const instance = build();
    instance.setData(
      ecgRows().map((row) => ({ ...row, STRESN: 'not a number', CHG: 'not a number' }))
    );
    expect(instance.cleanRows).toHaveLength(0);
    expect(instance.footnote.textContent).toBe('');
    expect(instance.cautionEl.textContent).toBe(CLINICAL_CAUTION);
    expect(instance.cautionEl.hidden).toBe(false);
  });
  it('QT-CAUTION-001: the caution is not duplicated in any view footnote (#136)', () => {
    const instance = build();
    ['central', 'outlier', 'categorical'].forEach((view) => {
      instance.state.view = view;
      rerender(instance);
      // The relocated sentence lives in the shell only: the view-owned
      // footnotes keep their view-specific method notes and no longer repeat
      // the exploratory caution beside it.
      expect(instance.footnote.textContent).not.toMatch(/exploratory/i);
    });
  });
});

describe('qt-explorer unblinding warning (QT-CAUTION-002)', () => {
  it('QT-CAUTION-002: multi-arm data carries the unblinding warning on every view (#136)', () => {
    const instance = build();
    expect(instance.arms.length).toBeGreaterThan(1);
    ['central', 'outlier', 'categorical'].forEach((view) => {
      instance.state.view = view;
      rerender(instance);
      expect(instance.unblindingEl.hidden).toBe(false);
      expect(instance.unblindingEl.textContent).toBe(UNBLINDING_CAUTION);
      expect(instance.unblindingEl.textContent).toMatch(/unblind/i);
    });
  });

  it('QT-CAUTION-002: single-arm data raises no unblinding warning (#136)', () => {
    const instance = build({}, ecgRows([['High Dose', 'XHI', [0, 30, 55]]]));
    expect(instance.arms).toEqual(['High Dose']);
    expect(instance.unblindingEl.hidden).toBe(true);
    expect(instance.unblindingEl.textContent).toBe('');
    expect(cautions(instance)).not.toContain(UNBLINDING_CAUTION);
    // The permanent caution is unaffected by the gate.
    expect(instance.cautionEl.hidden).toBe(false);
  });

  it('QT-CAUTION-002: the warning follows the data when a second arm arrives (#136)', () => {
    const instance = build({}, ecgRows([['High Dose', 'XHI', [0, 30, 55]]]));
    expect(instance.unblindingEl.hidden).toBe(true);
    instance.setData(ecgRows());
    expect(instance.unblindingEl.hidden).toBe(false);
    expect(instance.unblindingEl.textContent).toBe(UNBLINDING_CAUTION);
  });
});
