// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import manifest from '../../../src/data/portfolio.json';
import {
  APP_STATUS_LINE,
  APP_STATUS_SIMULATED,
  APP_STATUS_TEXT,
  statusCount
} from '../../../src/app/header.js';
import { mountApp } from '../../../src/app/page.js';

// The demo app's own status label (#273, obot.roadmap#403): the one its header
// carries, and the one on the corner of a card below Exploratory. The tests of
// the label itself are in tests/unit/shared/status-label.test.js (#436).

const press = (key) =>
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
const parts = (label) => ({
  pill: label.querySelector('.sv-status-label'),
  panel: label.querySelector('.sv-status-panel'),
  cross: label.querySelector('.sv-status-close')
});

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('the demo app’s own label', () => {
  const charts = Object.fromEntries(
    Object.values(manifest.modules).map((entry) => [entry.export, () => ({ init() {} })])
  );
  const view = { id: 'rbqm', title: 'RBQM', tag: () => 'not run', render: () => null };
  const experimental = (note) => ({ tier: 'experimental', note });

  it('APP-TIER-012: how many charts stand on each rung is said in a sentence or two, with a tab named as a tab (#273)', () => {
    expect(statusCount({ exploratory: 13, experimental: 5, tabs: ['RBQM'] })).toBe(
      '13 charts are Exploratory. 5 charts and the RBQM tab are Experimental, and say so when you open them.'
    );
    expect(statusCount({ exploratory: 13, experimental: 0 })).toBe('13 charts are Exploratory.');
    expect(statusCount({ exploratory: 1, experimental: 1 })).toBe(
      '1 chart is Exploratory. 1 chart is Experimental, and says so when you open it.'
    );
    expect(statusCount({ exploratory: 0, experimental: 0, tabs: ['RBQM'] })).toBe(
      'the RBQM tab is Experimental, and says so when you open it.'
    );
    expect(statusCount({ exploratory: 2, experimental: 2, tabs: ['RBQM', 'Other'] })).toBe(
      '2 charts are Exploratory. 2 charts and the RBQM and Other tabs are Experimental, and say so when you open them.'
    );
    expect(statusCount({ exploratory: 0, experimental: 0 })).toBe('');
  });

  it('APP-TIER-013: the header carries one label reading Exploratory, after the tabs: its hover line and its panel are the app’s disclaimer, the panel counts the charts on each rung and marks the app’s rung (#273)', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = mountApp('#app', {
      charts,
      manifest,
      libraries: [{ name: 'gsm.viz', view }],
      tiers: {
        'time-to-event': experimental('One.'),
        'hep-waterfall': experimental('Two.'),
        rbqm: experimental('Three.')
      }
    });
    const labels = document.querySelectorAll('.sva-header .sv-status');
    expect(labels).toHaveLength(1);
    const [label] = labels;
    // The last thing in the header's first row, after the tabs.
    const bar = document.querySelector('.sva-bar');
    expect([...bar.children].map((child) => child.className)).toEqual([
      'sva-brand',
      'sva-tabs',
      'sva-appstatus'
    ]);
    expect(label.parentElement).toBe(bar.lastElementChild);
    const { pill, panel } = parts(label);
    expect(pill.dataset.tier).toBe('exploratory');
    expect(pill.querySelector('.sv-status-word').textContent).toBe('Exploratory');
    expect(APP_STATUS_LINE).toBe('Nothing in this app is qualified. Confirm every result.');
    expect(pill.querySelector('.sv-status-tip').textContent).toBe(APP_STATUS_LINE);
    expect(pill.getAttribute('aria-label')).toBe(`Status: Exploratory. ${APP_STATUS_LINE}`);
    expect(panel.querySelector('[role="heading"]').textContent).toBe('This app is exploratory');
    expect(APP_STATUS_TEXT).toBe(
      'Nothing here is qualified. The charts, statistics and site metrics are tested and documented, ' +
        'but none has been through qualification. Confirm every result in a qualified system before ' +
        'you rely on it.'
    );
    const [text, count] = [...panel.querySelectorAll('[role="paragraph"]')];
    expect(text.textContent).toBe(APP_STATUS_TEXT);
    expect(count.className).toBe('sv-status-text sv-status-count');
    expect(count.textContent).toBe(
      '11 charts are Exploratory. 2 charts and the RBQM tab are Experimental, and say so when you open them.'
    );
    const here = panel.querySelector('.sv-status-here');
    expect(here.dataset.tier).toBe('exploratory');
    expect(here.querySelector('.sv-status-mark').textContent).toBe('This app');
    expect(panel.querySelectorAll('.sv-status-mark')).toHaveLength(1);
    // Nothing in the app is labelled Qualified.
    expect(document.querySelector('.sv-status-label[data-tier="qualified"]')).toBeNull();
    // It opens and closes where it stands, and outlives a change of view.
    pill.click();
    expect(panel.hidden).toBe(false);
    app.select('data');
    expect(document.querySelector('.sva-header .sv-status')).toBe(label);
    expect(panel.hidden).toBe(false);
    press('Escape');
    expect(panel.hidden).toBe(true);
    app.destroy();
  });

  it('APP-TIER-029: on a page whose libraries bring study.builder’s way to load data, the app’s status panel says in a second paragraph where study.builder’s parts stand; a page without it says nothing of them (#424)', () => {
    // Since #427 the two parts stand on Experimental here, each with the label
    // on its corner (APP-TIER-030), and the paragraph says so.
    expect(APP_STATUS_SIMULATED).toBe(
      'Build a study and the view of a simulated study are Experimental, and say so where you ' +
        'open them. Both are study.builder’s, new in 1.13, and every row it makes is synthetic.'
    );
    const said = (libraries) => {
      document.body.innerHTML = '<div id="app"></div>';
      const app = mountApp('#app', { charts, manifest, libraries });
      const panel = document.querySelector('.sva-header .sv-status-panel');
      const paragraphs = [...panel.querySelectorAll('.sv-status-text')]
        .filter((paragraph) => !/sv-status-(count|foot)/.test(paragraph.className))
        .map((paragraph) => paragraph.textContent);
      // The hover line and the rungs are the app's own either way.
      const tip = document.querySelector('.sva-header .sv-status-tip').textContent;
      const marks = [...panel.querySelectorAll('.sv-status-mark')].map((mark) => mark.textContent);
      app.destroy();
      return { paragraphs, tip, marks };
    };
    const source = { id: 'build', label: 'Build a study', render() {} };
    // With study.builder's source: the disclaimer, then where its parts stand.
    expect(said([{ name: 'study.builder', source }])).toEqual({
      paragraphs: [APP_STATUS_TEXT, APP_STATUS_SIMULATED],
      tip: APP_STATUS_LINE,
      marks: ['This app']
    });
    // With no library, with a library that brings a tab, and with another
    // library's source: the disclaimer alone.
    for (const libraries of [
      [],
      [{ name: 'gsm.viz', view }],
      [{ name: 'another', source: { ...source, id: 'other' } }]
    ]) {
      expect(said(libraries).paragraphs).toEqual([APP_STATUS_TEXT]);
    }
  });

  it('APP-TIER-020: a chart or a tab below Exploratory carries the label on the corner of its card, before the card, with its own reason and both rungs marked; an Exploratory chart carries none, and the page tells a chart it is showing the label (#274)', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const reason =
      'Experimental until an external clinical review confirms its Kaplan–Meier estimates.';
    const app = mountApp('#app', {
      charts,
      manifest,
      libraries: [{ name: 'gsm.viz', view }],
      tiers: {
        'time-to-event': experimental(reason),
        'qt-explorer': { tier: 'experimental' },
        rbqm: experimental('Experimental: new in 1.10.')
      }
    });
    const content = document.querySelector('.sva-content');
    const corner = () => content.querySelector('.sva-corner');
    // The page is a host that shows the label, so a chart drawn in it draws none of its own.
    expect(content.hasAttribute('data-sv-status-host')).toBe(true);
    // The chart is on show whether or not the loaded data lets it draw.
    app.select('time-to-event');
    expect(content.querySelectorAll('.sv-status')).toHaveLength(1);
    const { pill, panel } = parts(corner());
    expect(pill.dataset.tier).toBe('experimental');
    expect(pill.querySelector('.sv-status-tip').textContent).toBe(reason);
    expect(panel.querySelector('[role="heading"]').textContent).toBe(
      'Time-to-Event Explorer is experimental'
    );
    expect(panel.querySelector('[role="paragraph"]').textContent).toBe(reason);
    expect(panel.querySelector('.sv-status-here').dataset.tier).toBe('experimental');
    const marks = [...panel.querySelectorAll('.sv-status-mark')].map((mark) => [
      mark.textContent,
      mark.closest('[data-tier]').dataset.tier
    ]);
    expect(marks).toEqual([
      ['This app', 'exploratory'],
      ['This chart', 'experimental']
    ]);
    // It comes before the card or the sentence it labels.
    expect(corner().nextElementSibling).not.toBeNull();
    expect(
      corner().compareDocumentPosition(content.lastElementChild) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // A chart with no reason on record still says its rung.
    app.select('qt-explorer');
    expect(parts(corner()).pill.querySelector('.sv-status-tip').textContent).toBe(
      'Tested and documented, but what it shows or how it behaves may still change.'
    );
    expect(corner().querySelector('.sv-status-text:not(.sv-status-foot)')).toBeNull();
    // An Exploratory chart shows no second label, and neither does the data view.
    for (const id of ['histogram', 'ae-explorer', 'data']) {
      app.select(id);
      expect(corner(), id).toBeNull();
      expect(document.querySelectorAll('.sva-main .sv-status'), id).toHaveLength(0);
    }
    // A tab is named as a tab.
    app.select('rbqm');
    expect(content.querySelectorAll('.sv-status')).toHaveLength(1);
    expect(corner().querySelector('[role="heading"]').textContent).toBe(
      'The RBQM tab is experimental'
    );
    expect(
      [...corner().querySelectorAll('.sv-status-mark')].map((mark) => mark.textContent)
    ).toEqual(['This app', 'This tab']);
    expect(corner().nextElementSibling.className).toContain('sva-view');
    // The tab itself carries no pill, and no hover-only word.
    expect(document.querySelector('.sva-tab[data-tab="rbqm"] .sva-badge')).toBeNull();
    expect(document.querySelector('.sva-tab[data-tab="rbqm"]').title).toBe('');
    // The header's label is still the only one there.
    expect(document.querySelectorAll('.sva-header .sv-status')).toHaveLength(1);
    app.destroy();
  });
});
