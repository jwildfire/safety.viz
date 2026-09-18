// @vitest-environment jsdom
// The renderer half of the AI narrative layer (#146, PJE-NARR-009, -012,
// -013): the `narratives` slots and `on_narrative_action` settings, the
// entries the orchestrator keeps, the scope hash it computes for stale
// detection, the three-channel action emit, refreshNarrative, and the
// unbound case. Chart.js is stubbed as in events.test.js; the stub adapter
// drafts through SafetyViz.narratives.bindNarratives against a hand-built
// record whose expected numbers are in the comments.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
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
const { bindNarratives } = await import('../../../src/patientJourneyNarratives/index.js');

const REF = { TRTSDT: '2024-01-01' };
// S1: one exposure step (50 → 100 mg on day 11), RASH day 10-12 closed and
// RASH day 30 ongoing (the anchor), an abnormal ALT on day 25 (90, ULN 40,
// baseline 20 on day -5), ASPIRIN active from day -400 with no end, and
// COMPLETED on day 90. S2: one adverse event only.
function makeData() {
  return {
    ex: [
      { USUBJID: 'S1', EXTRT: 'DRUG', EXDOSE: '50', EXDOSU: 'mg', ASTDY: '1', AENDY: '10', ...REF },
      {
        USUBJID: 'S1',
        EXTRT: 'DRUG',
        EXDOSE: '100',
        EXDOSU: 'mg',
        ASTDY: '11',
        AENDY: '60',
        ...REF
      }
    ],
    ae: [
      {
        USUBJID: 'S1',
        AETERM: 'RASH',
        AEDECOD: 'RASH',
        ASTDY: '10',
        AENDY: '12',
        AESEV: 'MILD',
        AESER: 'N',
        AEOUT: 'RECOVERED/RESOLVED',
        ...REF
      },
      {
        USUBJID: 'S1',
        AETERM: 'RASH',
        AEDECOD: 'RASH',
        ASTDY: '30',
        AENDY: '',
        AESEV: 'MODERATE',
        AESER: 'N',
        AEOUT: 'NOT RECOVERED/NOT RESOLVED',
        ...REF
      },
      {
        USUBJID: 'S1',
        AETERM: 'SYNCOPE',
        AEDECOD: 'SYNCOPE',
        ASTDY: '75',
        AENDY: '76',
        AESEV: 'SEVERE',
        AESER: 'Y',
        AEOUT: 'RECOVERED/RESOLVED',
        ...REF
      },
      {
        USUBJID: 'S2',
        AETERM: 'HEADACHE',
        AEDECOD: 'HEADACHE',
        ASTDY: '5',
        AENDY: '6',
        AESEV: 'MILD',
        AESER: 'N',
        AEOUT: 'RECOVERED/RESOLVED',
        ...REF
      }
    ],
    lb: [
      {
        USUBJID: 'S1',
        LBTEST: 'Alanine Aminotransferase',
        LBTESTCD: 'ALT',
        LBSTRESN: '20',
        LBSTRESU: 'U/L',
        LBSTNRLO: '5',
        LBSTNRHI: '40',
        LBNRIND: 'NORMAL',
        ABLFL: 'Y',
        LBDY: '-5',
        ...REF
      },
      {
        USUBJID: 'S1',
        LBTEST: 'Alanine Aminotransferase',
        LBTESTCD: 'ALT',
        LBSTRESN: '90',
        LBSTRESU: 'U/L',
        LBSTNRLO: '5',
        LBSTNRHI: '40',
        LBNRIND: 'HIGH',
        ABLFL: '',
        LBDY: '25',
        ...REF
      },
      {
        USUBJID: 'S1',
        LBTEST: 'Alanine Aminotransferase',
        LBTESTCD: 'ALT',
        LBSTRESN: '25',
        LBSTRESU: 'U/L',
        LBSTNRLO: '5',
        LBSTNRHI: '40',
        LBNRIND: 'NORMAL',
        ABLFL: '',
        LBDY: '70',
        ...REF
      }
    ],
    cm: [
      { USUBJID: 'S1', CMTRT: 'ASPIRIN', CMCLAS: 'ANALGESICS', ASTDY: '-400', AENDY: '', ...REF },
      { USUBJID: 'S1', CMTRT: 'IBUPROFEN', CMCLAS: 'ANALGESICS', ASTDY: '5', AENDY: '40', ...REF }
    ],
    mh: [{ USUBJID: 'S1', MHTERM: 'HYPERTENSION', MHDY: '-5', ...REF }],
    ds: [
      {
        USUBJID: 'S1',
        DSDECOD: 'COMPLETED',
        DSTERM: 'COMPLETED',
        DSCAT: 'DISPOSITION EVENT',
        DSSTDY: '90',
        ...REF
      }
    ]
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (instance) => {
  for (let i = 0; i < 20; i += 1) {
    await flush();
    if (instance.narratives.every((n) => n.status !== 'loading')) return;
  }
  throw new Error('narratives did not settle');
};

let container;
let instance;
let actions;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  actions = [];
  instance = patientJourneyExplorer(container, {
    lb_tests: ['Alanine Aminotransferase'],
    on_narrative_action: (action) => actions.push(action)
  });
  instance.init(makeData());
});

afterEach(() => {
  instance.destroy();
  container.remove();
  vi.restoreAllMocks();
});

describe('PJE-NARR-009: the narratives slots (#146)', () => {
  it('PJE-NARR-009: with no slot bound nothing is requested and nothing renders (#146)', () => {
    expect(instance.settings.narratives).toBeNull();
    expect(instance.narratives).toEqual([]);
    expect(container.querySelectorAll('.sv-pje-ai, .sv-pje-ai-slot')).toHaveLength(0);
  });

  it('PJE-NARR-009: binding the stub drafts the participant summary above the lanes, collapsed to its blurb, and the lane slots appear (#146)', async () => {
    const generator = bindNarratives(instance, { provider: 'stub' });
    expect(Object.keys(instance.settings.narratives).sort()).toEqual([
      'disposition',
      'doseJourney',
      'eventContext',
      'labTrajectory',
      'subjectSummary'
    ]);
    expect(instance.narratives.map((n) => [n.kind, n.status])).toEqual([
      ['subject-summary', 'loading']
    ]);
    await settle(instance);
    const [entry] = instance.narratives;
    expect(entry.status).toBe('ready');
    expect(entry.draft.kind).toBe('subject-summary');
    expect(entry.draft.status).toBe('draft');
    expect(entry.hash).toBe(entry.draft.provenance.input_hash);
    const banner = container.querySelector('.sv-pje-narrative-banner');
    const card = banner.querySelector('.sv-pje-ai[data-kind="subject-summary"]');
    expect(card).not.toBeNull();
    expect(card.querySelector('.sv-pje-ai-label').textContent).toBe('AI narrative');
    expect(card.querySelector('.sv-pje-ai-summary').textContent).toContain(
      '3 adverse events (1 serious)'
    );
    expect(card.querySelector('.sv-pje-ai-body').hidden).toBe(true);
    card.querySelector('.sv-pje-ai-toggle').click();
    expect(container.querySelector('.sv-pje-ai-body').hidden).toBe(false);
    const chips = [...container.querySelectorAll('.sv-pje-ai-sentence')].map(
      (p) => p.querySelector('.sv-pje-ai-chip').textContent
    );
    expect(chips.length).toBeGreaterThan(0);
    expect(new Set(chips)).toEqual(new Set(['Draft — AI generated']));
    // The banner precedes the lanes in the chart card.
    const children = [...container.querySelector('.sv-chart-wrap').children];
    expect(children.indexOf(banner)).toBeLessThan(
      children.indexOf(container.querySelector('.sv-pje-lanes'))
    );
    const slots = [...container.querySelectorAll('.sv-pje-ai-slot')].map(
      (el) => `${el.dataset.slot}:${el.dataset.key}`
    );
    expect(slots).toEqual([
      'doseJourney:',
      'labTrajectory:Alanine Aminotransferase',
      'disposition:'
    ]);
    generator.unbind();
    expect(instance.narratives).toEqual([]);
    expect(container.querySelectorAll('.sv-pje-ai, .sv-pje-ai-slot')).toHaveLength(0);
  });

  it('PJE-NARR-009: a slot that rejects renders an error card, and a slot returning junk is reported (#146)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    instance.setSettings({
      narratives: {
        subjectSummary: async () => {
          throw new Error('boom');
        }
      }
    });
    await settle(instance);
    expect(instance.narratives[0].status).toBe('error');
    expect(container.querySelector('.sv-pje-ai-summary.is-refused').textContent).toContain('boom');
    expect(warn).toHaveBeenCalled();
    instance.setSettings({ narratives: { subjectSummary: async () => 'not a draft' } });
    await settle(instance);
    expect(instance.narratives[0].status).toBe('error');
  });
});

describe('PJE-NARR-012 / PJE-NARR-013: the event card, staleness and actions (#146)', () => {
  beforeEach(async () => {
    bindNarratives(instance, { provider: 'stub' });
    await settle(instance);
    instance.anchor('AE-1');
    await settle(instance);
  });

  it('PJE-NARR-012: the event card is grounded on the live window; a window change re-requests with a regenerate action and a filter that changes the rows marks it stale (#146)', async () => {
    const entry = () => instance.narratives.find((n) => n.kind === 'event-context');
    expect(entry().key).toBe('AE-1');
    expect(entry().draft.window_days).toBe(30);
    const before = entry().hash;
    expect(before).toBe(entry().draft.provenance.input_hash);
    instance.setContextWindowDays(10);
    await settle(instance);
    expect(entry().draft.window_days).toBe(10);
    expect(entry().hash).not.toBe(before);
    expect(actions.map((a) => `${a.type}:${a.reason}`)).toEqual(['regenerate:window']);
    expect(entry().stale).toBe(false);
    instance.setFilter('AESER', 'Y');
    expect(entry().stale).toBe(true);
    const card = container.querySelector('.sv-pje-panel-body > .sv-pje-ai');
    expect(card.classList.contains('is-stale')).toBe(true);
    expect(card.querySelector('.sv-pje-ai-stale')).not.toBeNull();
    instance.setFilter('AESER', null);
    expect(entry().stale).toBe(false);
  });

  it('PJE-NARR-013: accept, reject, edit and regenerate emit on the callback, the listener and the DOM event with the draft, and refreshNarrative flips an accepted draft (#146)', async () => {
    const listener = [];
    const dom = [];
    instance.on('pjeNarrativeAction', (detail) => listener.push(detail.type));
    container
      .querySelector('.sv-root')
      .addEventListener('pjeNarrativeAction', (event) => dom.push(event.detail.type));
    const card = () => container.querySelector('.sv-pje-panel-body > .sv-pje-ai');
    card().querySelector('.sv-pje-ai-action.is-reject').click();
    card().querySelector('.sv-pje-ai-action.is-accept').click();
    expect(actions.map((a) => a.type)).toEqual(['reject', 'accept']);
    expect(listener).toEqual(['reject', 'accept']);
    expect(dom).toEqual(['reject', 'accept']);
    expect(actions[1]).toMatchObject({ kind: 'event-context', subject: 'S1', row_id: 'AE-1' });
    expect(actions[1].draft.kind).toBe('event-context');
    // The chart only emits: the chips still say draft until the host passes
    // the accepted copy back.
    expect(card().querySelector('.sv-pje-ai-chip.is-accepted')).toBeNull();
    instance.refreshNarrative({ ...actions[1].draft, status: 'accepted' });
    expect(card().querySelector('.sv-pje-ai-chip.is-accepted').textContent).toBe('Accepted');
    expect(card().querySelector('.sv-pje-ai-action.is-accept')).toBeNull();
    // Edit: the form, then Save emits editedSentences.
    const fresh = { ...actions[1].draft };
    instance.refreshNarrative(fresh);
    card().querySelector('.sv-pje-ai-action.is-edit').click();
    const area = card().querySelector('.sv-pje-ai-textarea');
    area.value = 'RASH is recorded from day 30 (edited).';
    card().querySelector('.sv-pje-ai-action.is-save').click();
    const edit = actions.find((a) => a.type === 'edit');
    expect(edit.editedSentences[0].text).toBe('RASH is recorded from day 30 (edited).');
    expect(card().querySelector('.sv-pje-ai-sentence').textContent).toContain('(edited)');
    // Regenerate emits and re-requests.
    card().querySelector('.sv-pje-ai-action.is-regenerate').click();
    expect(actions.at(-1)).toMatchObject({ type: 'regenerate', reason: 'manual' });
    await settle(instance);
    expect(instance.narratives.find((n) => n.kind === 'event-context').status).toBe('ready');
    // An unmatched draft warns and changes nothing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    instance.refreshNarrative({
      kind: 'lab-trajectory',
      subject: 'S1',
      test: 'Nope',
      sentences: []
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('refreshNarrative'));
  });

  it('PJE-NARR-012: a subject change drops the cards and a camelCase onNarrativeAction alias is honoured (#146)', async () => {
    instance.selectSubject('S2');
    await settle(instance);
    expect(instance.narratives.map((n) => `${n.kind}:${n.subject}`)).toEqual([
      'subject-summary:S2'
    ]);
    const seen = [];
    const other = patientJourneyExplorer(document.createElement('div'), {
      onNarrativeAction: (action) => seen.push(action.type)
    });
    expect(typeof other.settings.on_narrative_action).toBe('function');
    other.destroy();
  });
});
