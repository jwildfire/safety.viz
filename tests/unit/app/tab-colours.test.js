// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import manifest from '../../../src/data/portfolio.json';
import {
  DOMAIN_COLOURS,
  TAB_COLOURS,
  mergeLibraries,
  tabColours,
  towardInk
} from '../../../src/app/libraries.js';
import { mountApp } from '../../../src/app/page.js';
import { STYLES } from '../../../src/app/styles.js';
import {
  APP_LIBRARIES,
  RBQM_CHARTS,
  librariesExpression,
  rbqmTabExpression
} from '../../../scripts/app-libraries.mjs';
import standIn from '../../e2e/fixtures/stand-in-library.js';

// Every tab has a colour (#268, obot.roadmap#402). A library that names a
// colour for its tab gets it; one that names none is given the first open
// colour of a fixed list, in the order the page was handed the libraries, so
// no tab is ever grey. These tests hold the rule, and that the page paints a
// library's tab, its chart names and its chart's card with the colour.

const GRAPHITE = '#4a525c';
const [PINK, AMBER, GREEN] = TAB_COLOURS;
// The tabs the demo app's own charts bring: labs and vitals, ECG, adverse events.
const OWN_TABS = [DOMAIN_COLOURS.bds, DOMAIN_COLOURS.eg, DOMAIN_COLOURS.ae];
const named = (...names) => names.map((name) => ({ name }));
const channels = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
// Grey is a colour with no hue: its three channels within a few steps of one another.
const isGrey = (hex) => Math.max(...channels(hex)) - Math.min(...channels(hex)) < 24;

const ownCharts = Object.fromEntries(
  Object.values(manifest.modules).map((entry) => [entry.export, () => ({ init() {} })])
);
const view = (id, title) => ({
  id,
  title,
  tag: () => 'not run',
  render: () => null
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the rule that gives every tab a colour', () => {
  it('APP-LIB-028: with no library naming a colour, the first is given pink and the second amber, the demo app’s Biomarkers and RBQM (#268)', () => {
    expect(TAB_COLOURS).toEqual(['#c67bb6', '#c78a3b', '#77a95b']);
    const colours = tabColours(named('bio.viz', 'gsm.viz'), OWN_TABS);
    expect(colours.get('bio.viz')).toBe('#c67bb6');
    expect(colours.get('gsm.viz')).toBe('#c78a3b');
    // The libraries the build lists name none, so the rule chooses for both.
    expect(APP_LIBRARIES.map((library) => library.colour)).toEqual([undefined]);
    expect(RBQM_CHARTS.colour).toBeUndefined();
  });

  it('APP-LIB-029: a library that names a colour for its tab keeps it, and the next library is given the first colour still open (#268)', () => {
    const colours = tabColours(
      [{ name: 'first', colour: '#3b6ea5' }, { name: 'second' }, { name: 'third', colour: PINK }],
      OWN_TABS
    );
    expect(colours.get('first')).toBe('#3b6ea5');
    expect(colours.get('second')).toBe(PINK);
    // A library may name a colour another tab has: it is its own choice, and nobody is moved.
    expect(colours.get('third')).toBe(PINK);
    // A named colour from the list is no longer open to the libraries after it.
    const taken = tabColours([{ name: 'first', colour: '#C67BB6' }, { name: 'second' }], OWN_TABS);
    expect(taken.get('first')).toBe(PINK);
    expect(taken.get('second')).toBe(AMBER);
    // What is not a hex colour is no colour: the rule chooses, and the page says so.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const colour of ['grey', 'var(--lib)', '#12', 7, null]) {
      expect(tabColours([{ name: 'odd', colour }], OWN_TABS).get('odd'), String(colour)).toBe(PINK);
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('odd'));
  });

  it('APP-LIB-030: the same libraries in the same order are given the same colours on every build, and a library added at the end moves nobody (#268)', () => {
    const first = tabColours(named('a', 'b'), OWN_TABS);
    const again = tabColours(named('a', 'b'), OWN_TABS);
    expect([...again]).toEqual([...first]);
    const more = tabColours(named('a', 'b', 'c'), OWN_TABS);
    expect(more.get('a')).toBe(first.get('a'));
    expect(more.get('b')).toBe(first.get('b'));
    expect(more.get('c')).toBe(GREEN);
    // A second library of a name is left out of the page, and of the colours.
    expect([...tabColours(named('a', 'a', 'b'), OWN_TABS).keys()]).toEqual(['a', 'b']);
  });

  it('APP-LIB-031: a colour a tab in the header already uses is not open, and red is never given out (#268)', () => {
    // With a tab for the charts outside the standard set, which is pink, the first library is amber.
    const colours = tabColours(named('a', 'b'), [...OWN_TABS, DOMAIN_COLOURS.other]);
    expect(colours.get('a')).toBe(AMBER);
    expect(colours.get('b')).toBe(GREEN);
    // Red means missing and did not draw everywhere in the app.
    const red = /--s0:(#[0-9a-f]{6})/.exec(STYLES)[1];
    const many = [...tabColours(named('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'), OWN_TABS).values()];
    expect(TAB_COLOURS).not.toContain(red);
    expect(many).not.toContain(red);
    // The list is the stylesheet's own pink, amber and green.
    for (const [index, name] of [
      [0, 's6'],
      [1, 's1'],
      [2, 's2']
    ]) {
      expect(STYLES).toContain(`--${name}:${TAB_COLOURS[index]}`);
    }
  });

  it('APP-LIB-032: when the list runs out the rule goes round again with each colour mixed 40 percent toward ink, and no tab is grey (#268)', () => {
    const colours = [...tabColours(named('a', 'b', 'c', 'd', 'e', 'f', 'g'), OWN_TABS).values()];
    expect(colours.slice(0, 3)).toEqual([PINK, AMBER, GREEN]);
    expect(colours.slice(3, 6)).toEqual([towardInk(PINK), towardInk(AMBER), towardInk(GREEN)]);
    // 60 percent of the colour and 40 percent of the ink, #1f2328, channel by channel.
    expect(towardInk('#c67bb6')).toBe('#83587d');
    expect(towardInk('#c78a3b')).toBe('#846133');
    expect(towardInk('#77a95b')).toBe('#547347');
    expect(new Set(colours.slice(0, 6)).size).toBe(6);
    // Past both rounds a colour is used twice before any tab is grey.
    expect(colours[6]).toBe(PINK);
    for (const colour of colours) {
      expect(colour, colour).not.toBe(GRAPHITE);
      expect(isGrey(colour), colour).toBe(false);
    }
  });
});

describe('the colours on the page', () => {
  const mount = (libraries) => {
    document.body.innerHTML = '<div id="app"></div>';
    return mountApp('#app', { charts: ownCharts, manifest, libraries });
  };
  const hue = (element) => element.style.getPropertyValue('--hue');

  it('APP-LIB-033: a library’s tab, its chart names and its chart’s card carry its colour, a library that brings a view carries its own, and the standard domains’ tabs are as they were (#268)', () => {
    const app = mount([standIn, { name: 'views', view: view('extra', 'Extra') }]);
    const tab = document.querySelector('.sva-tab[data-domain="stand-in"]');
    const viewTab = document.querySelector('.sva-tab[data-tab="extra"]');
    expect(hue(tab)).toBe(PINK);
    expect(hue(viewTab)).toBe(AMBER);
    expect(hue(document.querySelector('.sva-group[data-group="stand-in"]'))).toBe(PINK);
    // A standard domain's tab takes its hue from its class, as before, and names none of its own.
    for (const group of ['bds', 'eg', 'ae']) {
      const own = document.querySelector(`.sva-tab[data-domain="${group}"]`);
      expect(own.className).toContain(`sva-domain-${group}`);
      expect(hue(own)).toBe('');
    }
    app.select('extra');
    expect(hue(document.querySelector('.sva-view'))).toBe(AMBER);
    app.destroy();
  });

  it('APP-LIB-034: a library handed in with a colour is painted with it, and the stylesheet has no graphite for a library’s tab (#268)', () => {
    const app = mount([
      { ...standIn, colour: '#3b6ea5' },
      { name: 'views', colour: '#2f8f83', view: view('extra', 'Extra') }
    ]);
    expect(hue(document.querySelector('.sva-tab[data-domain="stand-in"]'))).toBe('#3b6ea5');
    expect(hue(document.querySelector('.sva-tab[data-tab="extra"]'))).toBe('#2f8f83');
    app.destroy();
    expect(STYLES).not.toContain(GRAPHITE);
    expect(STYLES).not.toContain('--lib');
  });

  it('APP-LIB-035: the merge says which library declared each group, so a group is painted with its own library’s colour (#268)', () => {
    const { declaredBy } = mergeLibraries(manifest, ownCharts, [standIn]);
    expect(declaredBy).toEqual({ 'stand-in': 'stand-in' });
    expect(mergeLibraries(manifest, ownCharts).declaredBy).toEqual({});
  });

  it('APP-LIB-036: the build hands the page a library’s colour only when its entry names one (#268)', () => {
    const [bioViz] = APP_LIBRARIES;
    expect(librariesExpression([bioViz])).not.toContain('colour');
    expect(librariesExpression([{ ...bioViz, colour: '#3b6ea5' }])).toContain(
      '{ name: "bio.viz", colour: "#3b6ea5", '
    );
    expect(rbqmTabExpression({ r: 'unavailable' })).not.toContain('colour');
    expect(rbqmTabExpression({ r: 'unavailable', colour: '#2f8f83' })).toContain(
      '{ name: "gsm.viz", colour: "#2f8f83", view: '
    );
  });
});
