// @vitest-environment jsdom
// The event surface of the patient-journey-explorer module (#142, design
// §3.6): one private emit feeds three channels — the settings callback, the
// instance listeners and a bubbling CustomEvent on the shell root — with the
// same detail; the programmatic setters mirror the sidebar; a throwing host
// callback is caught; and destroy() tears everything down (PJE-EVT-001 …
// PJE-EVT-003, PJE-SUBJ-003). Chart.js is stubbed as in the other modules'
// jsdom specs: the canvases exist, nothing is painted.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const built = [];

vi.mock('chart.js', () => {
  class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
      this.destroyed = false;
      this.resized = 0;
      built.push(this);
    }
    update() {}
    draw() {}
    resize() {
      this.resized += 1;
    }
    destroy() {
      this.destroyed = true;
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
    LinearScale: stub(),
    CategoryScale: stub()
  };
});

const { default: patientJourneyExplorer } =
  await import('../../../src/patient-journey-explorer.js');

const REF = '2024-01-01';

// Two participants: S1 carries every domain (one closed and one ongoing
// adverse event, a dose change, two labs, a con-med, history, disposition);
// S2 carries one adverse event and no reference date.
function makeData({ refDate = REF } = {}) {
  const ref = refDate ? { TRTSDT: refDate } : {};
  return {
    ex: [
      { USUBJID: 'S1', EXTRT: 'DRUG', EXDOSE: '50', EXDOSU: 'mg', ASTDY: '1', AENDY: '10', ...ref },
      {
        USUBJID: 'S1',
        EXTRT: 'DRUG',
        EXDOSE: '100',
        EXDOSU: 'mg',
        ASTDY: '11',
        AENDY: '40',
        ...ref
      }
    ],
    ae: [
      {
        USUBJID: 'S1',
        AETERM: 'Rash',
        AEDECOD: 'RASH',
        AEBODSYS: 'SKIN',
        ASTDY: '5',
        AENDY: '7',
        AESEV: 'MILD',
        AESER: 'N',
        AEREL: 'NONE',
        AEOUT: 'RECOVERED/RESOLVED',
        ...ref
      },
      {
        USUBJID: 'S1',
        AETERM: 'Rash again',
        AEDECOD: 'RASH',
        AEBODSYS: 'SKIN',
        ASTDY: '30',
        AENDY: '',
        AESEV: 'SEVERE',
        AESER: 'Y',
        AEREL: 'PROBABLE',
        AEOUT: 'NOT RECOVERED/NOT RESOLVED',
        ...ref
      },
      {
        USUBJID: 'S2',
        AETERM: 'Nausea',
        AEDECOD: 'NAUSEA',
        AEBODSYS: 'GI',
        ASTDY: '3',
        AENDY: '4',
        AESEV: 'MILD',
        AESER: 'N',
        AEREL: 'NONE',
        AEOUT: 'RECOVERED/RESOLVED'
      }
    ],
    lb: [
      {
        USUBJID: 'S1',
        LBTEST: 'Alanine Aminotransferase',
        LBTESTCD: 'ALT',
        LBSTRESN: '20',
        LBSTRESU: 'U/L',
        LBSTNRLO: '7',
        LBSTNRHI: '40',
        LBNRIND: 'NORMAL',
        ABLFL: 'Y',
        LBDY: '-3',
        ...ref
      },
      {
        USUBJID: 'S1',
        LBTEST: 'Alanine Aminotransferase',
        LBTESTCD: 'ALT',
        LBSTRESN: '90',
        LBSTRESU: 'U/L',
        LBSTNRLO: '7',
        LBSTNRHI: '40',
        LBNRIND: 'HIGH',
        ABLFL: '',
        LBDY: '28',
        ...ref
      }
    ],
    cm: [
      {
        USUBJID: 'S1',
        CMTRT: 'ASPIRIN',
        CMCLAS: 'NERVOUS SYSTEM',
        ASTDY: '2',
        AENDY: '',
        ...ref
      }
    ],
    mh: [{ USUBJID: 'S1', MHTERM: 'Hypertension', MHDECOD: 'HYPERTENSION', MHDY: '-5', ...ref }],
    ds: [
      {
        USUBJID: 'S1',
        DSDECOD: 'COMPLETED',
        DSTERM: 'COMPLETED',
        DSCAT: 'DISPOSITION EVENT',
        DSSTDY: '45',
        ...ref
      }
    ]
  };
}

let warnSpy;

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '<div id="host"></div>';
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

function mount(settings = {}, data = makeData()) {
  const instance = patientJourneyExplorer('#host', settings);
  instance.init(data);
  return instance;
}

function listen(name) {
  const received = [];
  document.addEventListener(name, (event) => received.push(event.detail));
  return received;
}

describe('the three delivery channels (PJE-EVT-001)', () => {
  it('PJE-EVT-001: one emit reaches the settings callback, the instance listener and the DOM event with the same detail (#142)', () => {
    const callback = vi.fn();
    const contextCallback = vi.fn();
    const instance = mount({ on_anchor_event: callback, on_context_change: contextCallback });
    const viaOn = [];
    instance.on('pjeEventAnchored', (detail) => viaOn.push(detail));
    const viaContextOn = [];
    instance.on('pjeContextChanged', (detail) => viaContextOn.push(detail));
    const viaDom = listen('pjeEventAnchored');
    const viaContextDom = listen('pjeContextChanged');

    instance.anchor('AE-1');

    expect(instance.anchoredEvent.id).toBe('AE-1');
    const context = instance.getContext();
    expect(context).not.toBeNull();
    expect(context).toBe(instance.context);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBe(instance.anchoredEvent);
    expect(callback.mock.calls[0][1]).toBe(context);
    expect(viaOn).toHaveLength(1);
    expect(viaOn[0]).toEqual({ anchor: instance.anchoredEvent, context });
    expect(viaOn[0].context).toBe(context);
    expect(viaDom).toHaveLength(1);
    expect(viaDom[0].context).toBe(context);
    expect(viaDom[0].anchor).toBe(instance.anchoredEvent);
    // pjeContextChanged carries the bundle itself on every channel.
    expect(contextCallback).toHaveBeenCalledWith(context);
    expect(viaContextOn).toEqual([context]);
    expect(viaContextDom).toEqual([context]);
    // The bundle is the design's shape.
    expect(context.anchor.id).toBe('AE-1');
    expect(context.window).toEqual({
      days: 30,
      elapsedStart: -1,
      elapsedEnd: 59,
      startDay: -1,
      endDay: 60
    });
    expect(context.counts).toEqual({
      conMeds: 1,
      conMedsLater: 0,
      abnormalLabs: 1,
      doseChanges: 1,
      priorEvents: 1,
      inWindow: expect.any(Number)
    });
    expect(context.notEvaluated.conMedsEndUnrecorded).toBe(1);
  });

  it('PJE-EVT-001: anchor(null) clears and emits null on both anchor events; an unknown id warns and emits nothing (#142)', () => {
    const instance = mount();
    const anchored = listen('pjeEventAnchored');
    const changed = listen('pjeContextChanged');
    instance.anchor('AE-1');
    instance.anchor('nope');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(instance.anchoredEvent.id).toBe('AE-1');
    expect(anchored).toHaveLength(1);
    instance.anchor(null);
    expect(instance.anchoredEvent).toBeNull();
    expect(instance.getContext()).toBeNull();
    expect(anchored[1]).toEqual({ anchor: null, context: null });
    expect(changed[1]).toBeNull();
    // Clearing twice is a no-op.
    instance.anchor(null);
    expect(anchored).toHaveLength(2);
  });

  it('PJE-EVT-001: the context bundle is re-emitted when the window, a filter or a lane changes while anchored (#142)', () => {
    const instance = mount();
    const changed = listen('pjeContextChanged');
    instance.anchor('AE-1');
    expect(changed).toHaveLength(1);
    instance.setContextWindowDays(5);
    expect(changed).toHaveLength(2);
    expect(changed[1].window.days).toBe(5);
    instance.setLaneEnabled('labs', false);
    expect(changed).toHaveLength(3);
    instance.setFilter('AESER', 'Y');
    expect(changed).toHaveLength(4);
    // Not anchored: no context emission.
    instance.anchor(null);
    changed.length = 0;
    instance.setContextWindowDays(10);
    expect(changed).toEqual([]);
  });
});

describe('programmatic setters mirror the sidebar (PJE-EVT-001)', () => {
  it('PJE-EVT-001: setFilter changes the filter, re-renders and emits pjeFilterChanged; an unknown column warns and no-ops (#142)', () => {
    const instance = mount();
    const received = listen('pjeFilterChanged');
    const viaOn = vi.fn();
    instance.on('pjeFilterChanged', viaOn);
    const before = instance.events.filter((event) => event.domain === 'AE').length;
    expect(before).toBe(2);
    const rendersBefore = built.length;

    instance.setFilter('AESER', 'Y');

    expect(instance.events.filter((event) => event.domain === 'AE')).toHaveLength(1);
    expect(built.length).toBeGreaterThan(rendersBefore);
    expect(received).toEqual([{ value_col: 'AESER', selection: 'Y', filters: expect.any(Object) }]);
    expect(received[0].filters.AESER).toBe('Y');
    expect(viaOn).toHaveBeenCalledWith(received[0]);
    // The sidebar checkbox follows.
    expect(document.querySelector('[data-sv-focus="filter-AESER"]').checked).toBe(true);

    instance.setFilter('NOPE', 'Y');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);

    instance.setFilter('AESER', null);
    expect(instance.events.filter((event) => event.domain === 'AE')).toHaveLength(2);
    expect(received[1].selection).toBeNull();
  });

  it('PJE-EVT-001: getTimeMode and timeMode mirror setTimeMode, which emits pjeTimeModeChanged (#142)', () => {
    const instance = mount();
    const received = listen('pjeTimeModeChanged');
    expect(instance.getTimeMode()).toBe('day');
    expect(instance.timeMode).toBe('day');
    instance.setTimeMode('date');
    expect(instance.getTimeMode()).toBe('date');
    expect(instance.timeMode).toBe('date');
    expect(received).toEqual([{ mode: 'date', refDate: REF }]);
    expect(document.querySelector('[data-sv-focus="time-mode"]').value).toBe('date');
    instance.setTimeMode('day');
    expect(instance.getTimeMode()).toBe('day');
    expect(received[1]).toEqual({ mode: 'day', refDate: REF });
  });

  it('PJE-EVT-001: date mode is refused, with a warning, when no reference date resolves (#142)', () => {
    const instance = mount({}, makeData({ refDate: null }));
    const received = listen('pjeTimeModeChanged');
    instance.setTimeMode('date');
    expect(instance.getTimeMode()).toBe('day');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(received).toEqual([]);
    expect(document.querySelector('[data-sv-focus="time-mode"]').options[1].disabled).toBe(true);
  });

  it('PJE-EVT-001: pjeSubjectSelected and pjeLaneToggled carry the documented payload shapes (#142)', () => {
    const onSelect = vi.fn();
    const instance = mount({ on_select_subject: onSelect });
    const subjects = listen('pjeSubjectSelected');
    const lanes = listen('pjeLaneToggled');

    instance.selectSubject('S2');
    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toEqual({
      subject: 'S2',
      previous: 'S1',
      counts: { EX: 0, AE: 1, LB: 0, CM: 0, MH: 0, DS: 0 },
      domainDays: [-14, 4]
    });
    expect(onSelect).toHaveBeenCalledWith('S2', subjects[0]);
    expect(instance.subject).toBe('S2');
    expect(instance.participantsSelected).toEqual(['S2']);

    instance.setLaneEnabled('conMeds', false);
    expect(lanes).toEqual([
      {
        lane: 'conMeds',
        enabled: false,
        lanes: expect.objectContaining({ conMeds: false, labs: true })
      }
    ]);
    expect(document.querySelector('[data-sv-focus="lane-conMeds"]').checked).toBe(false);
    instance.setLaneEnabled('nope', true);
    expect(lanes).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('PJE-EVT-001: a throwing settings callback is caught and logged, and rendering continues (#142)', () => {
    const instance = mount({
      on_select_subject: () => {
        throw new Error('host bug');
      }
    });
    const selections = listen('participantsSelected');
    expect(() => instance.selectSubject('S2')).not.toThrow();
    expect(instance.subject).toBe('S2');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/host bug/);
    // The later channels still fired.
    expect(selections).toEqual([{ data: ['S2'] }]);
    expect(document.querySelector('.sv-notes').textContent).toContain('Participant S2');
  });
});

describe('the shared selection event (PJE-EVT-002)', () => {
  it('PJE-EVT-002: selecting a subject dispatches participantsSelected on the shell root with { detail: { data: [id] } } (#142)', () => {
    const instance = mount();
    const onRoot = vi.fn();
    instance.root.addEventListener('participantsSelected', onRoot);
    const viaOn = vi.fn();
    instance.on('participantsSelected', viaOn);
    instance.selectSubject('S2');
    expect(onRoot).toHaveBeenCalledTimes(1);
    expect(onRoot.mock.calls[0][0].detail).toEqual({ data: ['S2'] });
    expect(onRoot.mock.calls[0][0].bubbles).toBe(true);
    expect(viaOn).toHaveBeenCalledWith({ data: ['S2'] });
    expect(instance.participantsSelected).toEqual(['S2']);
  });
});

describe('selectSubject (PJE-SUBJ-003)', () => {
  it('PJE-SUBJ-003: an unknown id changes nothing and warns once (#142)', () => {
    const instance = mount();
    const subjects = listen('pjeSubjectSelected');
    expect(instance.subject).toBe('S1');
    const result = instance.selectSubject('nope');
    expect(result).toBe(instance);
    expect(instance.subject).toBe('S1');
    expect(subjects).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/unknown subject "nope"/);
  });

  it('PJE-SUBJ-003: a known id selects it, clears the anchor first, and the subject list follows (#142)', () => {
    const instance = mount();
    const anchored = listen('pjeEventAnchored');
    instance.anchor('AE-1');
    instance.selectSubject('S2');
    expect(instance.subject).toBe('S2');
    expect(instance.anchoredEvent).toBeNull();
    expect(anchored[1]).toEqual({ anchor: null, context: null });
    expect(document.querySelector('.sv-pje-subject-list').value).toBe('S2');
    expect(instance.subjects).toEqual(['S1', 'S2']);
  });
});

describe('listener removal and teardown (PJE-EVT-003)', () => {
  it('PJE-EVT-003: off(name, fn) removes one listener and off(name) removes them all (#142)', () => {
    const instance = mount();
    const a = vi.fn();
    const b = vi.fn();
    instance.on('pjeEventAnchored', a).on('pjeEventAnchored', b);
    instance.anchor('AE-1');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    instance.off('pjeEventAnchored', a);
    instance.anchor(null);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    instance.off('pjeEventAnchored');
    instance.anchor('AE-1');
    expect(b).toHaveBeenCalledTimes(2);
    // An unknown event name warns and registers nothing.
    instance.on('nope', a);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('PJE-EVT-003: destroy tears down the charts, the listeners and the container, and a later emit is a no-op (#142)', () => {
    const instance = mount();
    const handler = vi.fn();
    instance.on('pjeEventAnchored', handler);
    const dom = listen('pjeEventAnchored');
    const chartsBefore = built.length;
    expect(chartsBefore).toBeGreaterThan(0);
    const live = built.filter((chart) => !chart.destroyed);
    expect(live.length).toBe(instance.laneCharts.size);

    instance.destroy();

    expect(document.querySelector('#host').innerHTML).toBe('');
    expect(built.every((chart) => chart.destroyed)).toBe(true);
    expect(instance.laneCharts.size).toBe(0);
    expect(instance.listeners.size).toBe(0);
    expect(instance.getContext()).toBeNull();
    // Nothing is delivered after destroy.
    instance.emit('pjeEventAnchored', { anchor: null, context: null });
    expect(handler).not.toHaveBeenCalled();
    expect(dom).toEqual([]);
    expect(built.length).toBe(chartsBefore);
  });
});

describe('the 2026-09-18 verification fixes (PJE-CFG-004, PJE-TIME-001, PJE-DATA-004, PJE-KEY-002, PJE-LANE-003, PJE-FILT-004, PJE-KEY-004)', () => {
  it('PJE-CFG-004: a cleared context-window field restores the configured width rather than collapsing the window to the anchor day (#142)', () => {
    const instance = mount({ context_window_days: 20 });
    instance.anchor('AE-1');
    instance.setContextWindowDays(5);
    expect(instance.getContext().window.days).toBe(5);
    instance.setContextWindowDays('');
    expect(instance.getContext().window.days).toBe(20);
    expect(document.querySelector('[data-sv-focus="window-days"]').value).toBe('20');
    instance.setContextWindowDays(null);
    expect(instance.getContext().window.days).toBe(20);
    instance.setContextWindowDays('0');
    expect(instance.getContext().window.days).toBe(0);
  });

  it('PJE-TIME-001: date mode with no reference date shows study days everywhere — title, select, getTimeMode — and keeps the preference for a subject that has one (#142)', () => {
    const instance = mount({ time: { mode: 'date' } }, makeData({ refDate: null }));
    expect(instance.getTimeMode()).toBe('day');
    expect(instance.timeMode).toBe('day');
    expect(document.querySelector('.sv-pje-axis-title').textContent).toBe('Study day');
    expect(document.querySelector('[data-sv-focus="time-mode"]').value).toBe('day');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('showing study days'));

    const withRef = mount({ time: { mode: 'date' } });
    const received = listen('pjeTimeModeChanged');
    expect(withRef.getTimeMode()).toBe('date');
    expect(document.querySelector('.sv-pje-axis-title').textContent).toBe('Calendar date');
    // S2 has no reference date: the display falls back, says so once, and
    // the mode event fires; selecting S1 again brings the dates back.
    withRef.selectSubject('S2');
    expect(withRef.getTimeMode()).toBe('day');
    expect(document.querySelector('.sv-pje-axis-title').textContent).toBe('Study day');
    expect(document.querySelector('[data-sv-focus="time-mode"]').value).toBe('day');
    expect(received.map((detail) => detail.mode)).toEqual(['day']);
    withRef.selectSubject('S1');
    expect(withRef.getTimeMode()).toBe('date');
    expect(received.map((detail) => detail.mode)).toEqual(['day', 'date']);
  });

  it('PJE-DATA-004: after init() throws on invalid data, a later init() with valid data draws into the shell again, in the host element (#142)', () => {
    const instance = patientJourneyExplorer('#host');
    expect(() => instance.init({ ae: [{ USUBJID: 'S1', AETERM: 'x' }] })).toThrow(
      /Required variable/
    );
    const host = document.querySelector('#host');
    expect(host.querySelector('.sv-warning').textContent).toContain('ae.ASTDY|AESTDY');
    expect(host.querySelector('.sv-warning').innerHTML).not.toContain('<');
    instance.init(makeData());
    expect(host.contains(instance.root)).toBe(true);
    expect(host.querySelectorAll('.sv-pje-lane').length).toBeGreaterThan(0);
    expect(host.querySelector('.sv-warning')).toBeNull();
  });

  it('PJE-DATA-004: the checkInputs message is inserted as text, never as markup (#142)', () => {
    const instance = patientJourneyExplorer('#host', {
      domain_col: '<img src=x onerror="window.__xss=1">'
    });
    expect(() => instance.init([])).toThrow();
    expect(document.querySelectorAll('#host img')).toHaveLength(0);
    expect(document.querySelector('#host .sv-warning').textContent).toContain('<img');
  });

  it('PJE-KEY-002: Escape inside the subject search or the window field keeps its native meaning and does not clear the anchor (#142)', () => {
    const instance = mount();
    instance.anchor('AE-1');
    const search = document.querySelector('.sv-pje-subject-search');
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(instance.anchoredEvent.id).toBe('AE-1');
    const days = document.querySelector('[data-sv-focus="window-days"]');
    days.focus();
    days.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(instance.anchoredEvent.id).toBe('AE-1');
    // Anywhere else in the shell, Escape clears the anchor as documented.
    instance.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(instance.anchoredEvent).toBeNull();
  });

  it('PJE-LANE-003: with every lane turned off the stack says so and the anchoring hint is not shown (#142)', () => {
    const instance = mount();
    for (const key of Object.keys(instance.settings.lanes)) instance.setLaneEnabled(key, false);
    expect(document.querySelector('.sv-pje-lanes').textContent).toContain(
      'Every lane is turned off'
    );
    expect(document.querySelector('.sv-main-annotation').textContent).toBe('');
    instance.setLaneEnabled('exposure', true);
    expect(document.querySelector('.sv-pje-lanes').textContent).not.toContain(
      'Every lane is turned off'
    );
    expect(document.querySelector('.sv-pje-cue').hidden).toBe(false);
    expect(document.querySelector('.sv-pje-cue').textContent).toContain('Click any mark');
  });

  it('PJE-FILT-004: the absent-column filter warning and the source_url_template warning are printed once per data load, not once per interaction (#142)', () => {
    const instance = mount({
      filters: [{ domain: 'AE', value_col: 'NOPE', label: 'Nope' }],
      source_url_template: 'https://x/{domain}/{NOPE}'
    });
    const filterWarnings = () =>
      warnSpy.mock.calls.filter((call) => /\[ Nope \] filter/.test(String(call[0]))).length;
    const linkWarnings = () =>
      warnSpy.mock.calls.filter((call) => /source_url_template/.test(String(call[0]))).length;
    expect(filterWarnings()).toBe(1);
    expect(linkWarnings()).toBe(1);
    instance.anchor('AE-1');
    instance.setLaneEnabled('labs', false);
    instance.setContextWindowDays(10);
    instance.anchor(null);
    expect(filterWarnings()).toBe(1);
    expect(linkWarnings()).toBe(1);
    instance.init(makeData());
    expect(filterWarnings()).toBe(2);
    expect(linkWarnings()).toBe(2);
  });

  it('PJE-KEY-004: clearing the anchor from its own button, or resetting, never drops focus to the document body (#142)', () => {
    const instance = mount();
    instance.anchor('AE-1');
    const clear = document.querySelector('[data-sv-focus="clear-anchor"]');
    clear.focus();
    clear.click();
    expect(instance.anchoredEvent).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(instance.root.contains(document.activeElement)).toBe(true);
    const reset = document.querySelector('[data-sv-focus="reset"]');
    reset.focus();
    reset.click();
    expect(document.activeElement.getAttribute('data-sv-focus')).toBe('reset');
  });

  it('PJE-SUBJ-003: the footnote is cleared when its mark leaves the page — another subject, its lane off — and rewritten when the anchor changes (#142)', () => {
    const instance = mount();
    const event = instance.findEvent('AE-1');
    const fakeButton = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 24, height: 24, bottom: 24 }),
      dataset: {}
    };
    instance.showTooltip(event, fakeButton, 'hover');
    instance.hideTooltip('hover');
    const footnote = document.querySelector('.sv-footnote');
    expect(footnote.textContent).toContain('RASH');
    expect(footnote.querySelector('.sv-pje-open-source')).not.toBeNull();
    instance.anchor('AE-0');
    expect(footnote.textContent).toContain('days from anchor');
    instance.anchor(null);
    expect(footnote.textContent).not.toContain('from anchor');
    instance.setLaneEnabled('adverseEvents', false);
    expect(footnote.textContent).toBe('');
    instance.setLaneEnabled('adverseEvents', true);
    instance.showTooltip(event, fakeButton, 'hover');
    instance.selectSubject('S2');
    expect(footnote.textContent).toBe('');
    expect(footnote.querySelector('.sv-pje-open-source')).toBeNull();
  });

  it('PJE-CTX-001: a lane turned off or a filter never changes the context lists; the panel says why a listed record is not drawn and that the anchor is hidden (#142)', () => {
    const instance = mount();
    instance.anchor('AE-1');
    const before = instance.getContext().counts;
    instance.setFilter('AESER', 'Y');
    const after = instance.getContext().counts;
    expect(after.priorEvents).toBe(before.priorEvents);
    expect(after.conMeds).toBe(before.conMeds);
    const rail = document.querySelector('.sv-rail');
    expect(rail.textContent).toContain(
      '1 of these 1 is not drawn on the timeline (1 filtered out)'
    );
    instance.setFilter('AESER', null);
    instance.setLaneEnabled('adverseEvents', false);
    expect(instance.getContext().counts.priorEvents).toBe(before.priorEvents);
    expect(rail.textContent).toContain('not on the timeline right now (lane off)');
    expect(rail.textContent).toContain('(1 lane off)');
  });
});

describe('the click-any-mark notice (PJE-ANCH-006)', () => {
  it('PJE-ANCH-006: a notice above the lanes says clicking any mark shows its associated events, names the anchor once one is set, and hides with every lane off (#145)', () => {
    const instance = mount();
    const cue = document.querySelector('.sv-pje-cue');
    expect(cue).not.toBeNull();
    expect(cue.hidden).toBe(false);
    expect(cue.getAttribute('role')).toBe('note');
    expect(cue.textContent).toContain('Click any mark in the chart to show its associated events');
    expect(cue.textContent).toContain('Enter to select');
    // It sits above the lane stack, not beneath the axis strip.
    const lanes = document.querySelector('.sv-pje-lanes');
    expect(cue.compareDocumentPosition(lanes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The line beneath the axis no longer repeats the hint.
    expect(document.querySelector('.sv-main-annotation').textContent).toBe('');
    instance.anchor('AE-1');
    expect(cue.textContent).toContain(`Anchored on ${instance.anchoredEvent.label}`);
    expect(cue.textContent).toContain('Click another mark');
    expect(cue.textContent).not.toContain('Click any mark');
    instance.anchor(null);
    expect(cue.textContent).toContain('Click any mark');
    for (const key of Object.keys(instance.settings.lanes)) instance.setLaneEnabled(key, false);
    expect(cue.hidden).toBe(true);
    instance.setLaneEnabled('exposure', true);
    expect(cue.hidden).toBe(false);
  });
});
