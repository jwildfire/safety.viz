// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The "Reset chart" control at the foot of the ae-timelines sidebar (#136,
// obot.roadmap#33): AET-CTRL-001. Chart.js is replaced with a recording stub so
// the mount + control + teardown orchestration can be asserted in jsdom, which
// has no canvas. The module drills into a per-participant detail view, so the
// reset also has to leave the timeline view and an empty listing behind.

const built = [];

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
      this.destroyed = false;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : {};
      built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
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
    CategoryScale: stub(),
    Legend: stub(),
    LineController: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    Title: stub(),
    Tooltip: stub()
  };
});

const { default: aeTimelines } = await import('../../../src/ae-timelines.js');

const ae = (subject, seq, start, end, term, severity, serious = 'N') => ({
  USUBJID: subject,
  AESEQ: seq,
  ASTDY: start,
  AENDY: end,
  AETERM: term,
  AESEV: severity,
  AESER: serious
});

const rows = [
  ae('SUBJ-01', '1', '5', '12', 'Headache', 'MILD'),
  ae('SUBJ-01', '2', '20', '25', 'Nausea', 'MODERATE', 'Y'),
  ae('SUBJ-02', '1', '2', '30', 'Fatigue', 'SEVERE'),
  ae('SUBJ-03', '1', '8', '19', 'Rash', 'MILD'),
  ae('SUBJ-04', '1', '15', '18', 'Dizziness', 'MODERATE', 'Y')
];

let element;

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '';
  element = document.createElement('div');
  document.body.append(element);
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
});

const mount = (settings = {}) => aeTimelines(element, settings).init(rows);

const labelled = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (control) => control.querySelector('label')?.textContent === label
  );

describe('ae-timelines reset', () => {
  it('AET-CTRL-001: a reset control sits last in the control panel (#136)', () => {
    const instance = mount();
    const reset = instance.controls.querySelector('.sv-reset');
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below the Filters and Sorting sections, not inside either of them.
    expect(instance.controls.lastElementChild).toBe(reset);
  });

  it('AET-CTRL-001: reset restores the participant sort order and clears every filter (#136)', () => {
    const instance = mount();
    expect(instance.state.sort).toBe('earliest');
    expect(instance.state.filters.AESEV).toBe(null);
    expect(instance.state.filters.AESER).toBe(null);

    const sort = labelled(instance, 'Sort Participant IDs').querySelector('select');
    sort.value = 'alphabetical-descending';
    sort.onchange();
    expect(instance.state.sort).toBe('alphabetical-descending');

    const severity = instance.controls.querySelector('select[data-filter="AESEV"]');
    severity.value = 'SEVERE';
    severity.onchange();
    expect(instance.state.filters.AESEV).toBe('SEVERE');

    const serious = instance.controls.querySelector('select[data-filter="AESER"]');
    serious.value = 'Y';
    serious.onchange();
    expect(instance.state.filters.AESER).toBe('Y');

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.state.sort).toBe('earliest');
    expect(instance.state.filters).toEqual({ AESER: null, AESEV: null, USUBJID: null });

    // The controls are rebuilt, so the rendered sidebar agrees with the state.
    expect(labelled(instance, 'Sort Participant IDs').querySelector('select').value).toBe(
      'earliest'
    );
    expect(instance.controls.querySelector('select[data-filter="AESEV"]').value).toBe('__all__');
    // Every participant is back in the picture.
    expect(instance.filteredData).toHaveLength(rows.length);
  });

  it('AET-CTRL-001: reset closes the participant detail view, empties the listing and rebuilds the chart (#136)', () => {
    const instance = mount();
    instance.showParticipantDetail('SUBJ-01');
    expect(instance.selectedParticipant).toBe('SUBJ-01');

    const before = built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);

    instance.controls.querySelector('.sv-reset').onclick();

    expect(instance.selectedParticipant).toBe(null);
    expect(instance.listingWrap.innerHTML).toBe('');
    expect(instance.page).toBe(1);
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
    expect(built.filter((chart) => !chart.destroyed).length).toBeGreaterThan(0);
  });
});
