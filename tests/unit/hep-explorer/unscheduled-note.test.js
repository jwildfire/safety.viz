// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The excluded-record count, in every view (HEP-CTRL-018, #166). Turning
// "Unscheduled visits" off removes records from the row set every view reduces
// from, so every view has to say how many went — the release notes promise the
// count "in the note above the chart", and before #166 only the scatter kept
// that promise. Chart.js is stubbed the way the other jsdom module tests stub it.

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
    stop() {}
    getDatasetMeta() {
      return { data: [] };
    }
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    CategoryScale: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    TimeScale: stub(),
    Title: stub(),
    Tooltip: stub(),
    Legend: stub(),
    Filler: stub()
  };
});

const { default: hepExplorer } = await import('../../../src/hep-explorer.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

// The profile fixture plus two records at an unscheduled visit.
function rowsWithUnscheduled() {
  const rows = makeRows().map((row) => ({ ...row, ARM: row.USUBJID < 'P4' ? 'Placebo' : 'Drug' }));
  const alt = rows.find((row) => row.USUBJID === 'P3' && row.TEST === ALT_TEST);
  rows.push(
    { ...alt, DY: 45, VISIT: 'Unscheduled 1', VISITNUM: 2.5, STRESN: 400 },
    { ...alt, DY: 50, VISIT: 'Unscheduled 2', VISITNUM: 2.6, STRESN: 90 }
  );
  return rows;
}

let element;

beforeEach(() => {
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
});

const mount = (settings) => hepExplorer(element, settings).init(rowsWithUnscheduled());

describe('hep-explorer: the unscheduled-visit note', () => {
  it.each(['scatter', 'migration', 'composite'])(
    'HEP-CTRL-018: the %s view states how many records the exclusion removed (#166)',
    (view) => {
      const instance = mount({ view, unscheduled_visits: false, placebo_arm: 'Placebo' });
      expect(instance.state.view).toBe(view);
      expect(instance.unscheduledRecords).toBe(2);
      expect(instance.notes.textContent).toContain('2 records at unscheduled visits excluded.');
    }
  );

  it.each(['scatter', 'migration', 'composite'])(
    'HEP-CTRL-018: the %s view says nothing about unscheduled visits while they are included (#166)',
    (view) => {
      const instance = mount({ view, placebo_arm: 'Placebo' });
      expect(instance.notes.textContent).not.toContain('unscheduled');
    }
  );

  it('HEP-CTRL-018: the note follows the reader from view to view, and one record reads as one (#166)', () => {
    const rows = rowsWithUnscheduled().slice(0, -1);
    const instance = hepExplorer(element, { unscheduled_visits: false }).init(rows);
    expect(instance.notes.textContent).toContain('1 record at unscheduled visits excluded.');
    instance.switchView('composite');
    expect(instance.notes.textContent).toContain('1 record at unscheduled visits excluded.');
    instance.switchView('migration');
    expect(instance.notes.textContent).toContain('1 record at unscheduled visits excluded.');
  });
});
