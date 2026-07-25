// @vitest-environment jsdom
// The AE renderers adopt the participant profile (obot.roadmap#75 decision D9).
// #45 deferred ae-explorer and ae-timelines because the profile had no AE
// domain; building it removed the reason. These two hosts carry adverse events
// and NO laboratory records, so the profile renders as the AE story alone —
// header, summary, timeline — with no spaghetti and no measure table.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.destroyed = false;
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
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { profileRail } = await import('../../../src/participant-profile.js');

const AE = [
  {
    USUBJID: 'S-1',
    ARM: 'Placebo',
    AEDECOD: 'nausea',
    AETERM: 'NAUSEA',
    AEBODSYS: 'Gastrointestinal disorders',
    AESEV: 'MODERATE',
    AESER: 'N',
    ASTDY: 10,
    AENDY: 20
  },
  {
    USUBJID: 'S-1',
    ARM: 'Placebo',
    AEDECOD: 'rash',
    AETERM: 'RASH',
    AEBODSYS: 'Skin disorders',
    AESEV: 'MILD',
    AESER: 'N',
    ASTDY: 40,
    AENDY: ''
  }
];

let host;
beforeEach(() => {
  document.body.innerHTML =
    '<div class="sv-root"><div class="sv-main"></div><aside class="sv-rail" id="railhost"></aside></div>';
  host = document.querySelector('#railhost');
});

describe('an AE-only profile (PPRF-AE-005, decision D9)', () => {
  function mount() {
    const rail = profileRail(host, {
      details: [{ value_col: 'ARM', label: 'Treatment Group' }],
      ae: { data: AE }
    });
    rail.show(['S-1'], []);
    return rail;
  }

  it('renders the header and the AE tracks', () => {
    mount();
    expect(host.querySelector('.sv-profile-id').textContent).toBe('Participant S-1');
    expect(host.querySelector('.sv-profile-ae')).not.toBeNull();
    expect(host.querySelectorAll('.sv-profile-ae-row')).toHaveLength(2);
  });

  it('draws no spaghetti card and no measure table, rather than empty ones', () => {
    mount();
    expect(host.querySelector('.sv-profile-spaghetti')).toBeNull();
    expect(host.querySelector('.sv-profile-measure-table')).toBeNull();
    expect(host.querySelector('.sv-profile-controls')).toBeNull();
  });

  it('reads the header demographics off the AE records when there are no labs', () => {
    mount();
    const details = [...host.querySelectorAll('.sv-profile-detail-value')].map(
      (n) => n.textContent
    );
    expect(details).toContain('Placebo');
  });

  it('scales the timeline to the AE domain alone', () => {
    mount();
    const bars = [...host.querySelectorAll('.sv-profile-ae-bar')];
    // Domain is [10, 40]: nausea 10→20 starts at 0%, rash 40→open ends at 100%.
    expect(bars[0].style.left).toBe('0%');
    expect(bars[1].style.left).toBe('100%');
  });

  it('still reads as an AE profile when the participant has no events at all', () => {
    const rail = profileRail(host, { ae: { data: AE } });
    rail.show(['S-NONE'], []);
    expect(host.querySelector('.sv-profile-ae-empty').textContent).toContain('No adverse events');
    expect(host.querySelector('.sv-profile-spaghetti')).toBeNull();
  });
});
