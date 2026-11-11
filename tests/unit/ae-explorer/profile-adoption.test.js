// @vitest-environment jsdom
// The AE explorer's side panel and the x-axis toggle (#370, obot.roadmap#436):
// the panel shows adverse events only, which have study days and no visits, so
// the explorer tells it to open on Study day; the events are drawn on the day
// axis rather than listed.
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const { default: aeExplorer } = await import('../../../src/ae-explorer.js');
const { normalizeXAxis } = await import('../../../src/x-axis.js');

const ae = (subject, seq, start, end, term, severity, serious = 'N') => ({
  USUBJID: subject,
  ARM: 'Placebo',
  AESEQ: seq,
  ASTDY: start,
  AENDY: end,
  AETERM: term,
  AEDECOD: term,
  AEBODSYS: 'Nervous system disorders',
  AESEV: severity,
  AESER: serious
});

const rows = [
  ae('SUBJ-01', '1', '5', '12', 'Headache', 'MILD'),
  ae('SUBJ-01', '2', '20', '25', 'Dizziness', 'MODERATE', 'Y'),
  ae('SUBJ-02', '1', '2', '30', 'Headache', 'SEVERE')
];

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return { canvas: this };
  };
});

describe('ae-explorer side panel X-axis (PPRF-XAX-009)', () => {
  it('PPRF-XAX-009: the AE explorer opens its adverse-event side panel on Study day (#370)', () => {
    const instance = aeExplorer(document.querySelector('#host'), {}).init(rows);
    expect(instance.profile.settings.x_axis.default).toBe('day');
    expect(normalizeXAxis(instance.profile.settings).default).toBe('day');
    instance.focusParticipant('SUBJ-01');
    // Drawn on the study-day timeline, not listed as in Visit view.
    expect(instance.railWrap.querySelector('.sv-profile-ae-timeline')).not.toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-ae-list-wrap')).toBeNull();
  });
});
