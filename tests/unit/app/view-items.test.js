// @vitest-environment jsdom
// A view that brings the app a row of its own (#279, obot.roadmap#405): the
// page reads the view's items safely, draws them where a domain's charts are
// named, gives each an address, and puts the view's control at the row's end.
// The views here are plain objects: the RBQM tab's own row is held in
// rbqm-view.test.js.
import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function mount(extra) {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', '#');
  const view = {
    id: 'own',
    title: 'Own',
    tag: () => 'x',
    render(container, app) {
      container.append(`drawn: ${app.state.item || 'first page'}`);
      return null;
    },
    ...extra
  };
  const app = mountApp('#app', {
    charts: { portfolio: manifest },
    manifest,
    libraries: [{ name: 'own', view }]
  });
  return { app, view };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the page: a view that brings a row of its own (#279)', () => {
  it('APP-RBQM-068: a view whose list of items cannot be read gets no row and the page still draws it: one that throws is warned of, and one that is not a list is read as none (#279)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thrown = mount({
      items() {
        throw new Error('no list');
      }
    });
    thrown.app.select('own');
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toBe('safety.viz app: a view could not list its items.');
    expect($('.sva-view-items')).toBeNull();
    expect($('.sva-charts').hidden).toBe(true);
    expect($('.sva-view').textContent).toBe('drawn: first page');
    expect(thrown.app.state.selected).toBe('own');
    // An item asked for by address is not there to open, and the page stays up.
    thrown.app.select('own', 'a');
    expect(thrown.app.state.item).toBeNull();
    expect(window.location.hash).toBe('#own');
    expect($('.sva-view').textContent).toBe('drawn: first page');
    // The other tabs are as they were.
    thrown.app.select('data');
    expect(thrown.app.state.selected).toBe('data');
    warn.mockClear();

    for (const rubbish of ['a list', null, undefined, 7, { id: 'a', label: 'A' }, []]) {
      const { app } = mount({ items: () => rubbish });
      app.select('own');
      expect($('.sva-view-items'), JSON.stringify(rubbish)).toBeNull();
      expect($('.sva-charts').hidden).toBe(true);
      expect($('.sva-view').textContent).toBe('drawn: first page');
    }
    // A view that lists no items at all is the view it always was.
    const { app } = mount();
    app.select('own');
    expect($('.sva-view-items')).toBeNull();
    expect($('.sva-charts').hidden).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('APP-RBQM-068: of the items a view lists the page draws each that has a label and passes over the rest; an item with no id of its own is the view’s first page, and a mark, a state, words for the pointer and a name for a screen reader are drawn only where the view gave them (#279)', () => {
    const { app } = mount({
      items: () => [
        { id: '', label: 'Home' },
        { id: 'a', label: 'A', title: 'The A', name: 'A: ran', icon: 'ran', state: 'ran' },
        null,
        'b',
        ['c', 'C'],
        { id: 'd' },
        { id: 'e', label: '' },
        { id: 'f', label: 6 },
        { id: 'g', label: 'G' }
      ]
    });
    app.select('own');
    expect($('.sva-charts').hidden).toBe(false);
    expect($('.sva-view-items').dataset.group).toBe('own');
    expect($('.sva-view-items .sva-group-title').textContent).toBe('Own');
    const items = $$('.sva-charts > .sva-view-items > button.sva-item.sva-view-item');
    expect(items.map((node) => [node.dataset.item, node.textContent])).toEqual([
      ['', 'Home'],
      ['a', 'A'],
      ['g', 'G']
    ]);
    const [home, a, g] = items;
    // What the view gave, where it gave it.
    expect(a.title).toBe('The A');
    expect(a.getAttribute('aria-label')).toBe('A: ran');
    expect(a.dataset.state).toBe('ran');
    expect(a.querySelector('svg').getAttribute('class')).toBe('sva-ico sva-ico-ran');
    expect(a.querySelector('.sva-hex')).toBeNull();
    for (const plain of [home, g]) {
      expect(plain.title).toBe('');
      expect(plain.hasAttribute('aria-label')).toBe(false);
      expect(plain.dataset.state).toBeUndefined();
      expect(plain.querySelector('svg')).toBeNull();
      expect(plain.querySelector('.sva-hex')).not.toBeNull();
    }
    // The first page is the open one, and each item opens at its own address.
    expect($$('.sva-view-item[aria-current="page"]')).toEqual([home]);
    a.click();
    expect(app.state).toMatchObject({ selected: 'own', item: 'a' });
    expect(window.location.hash).toBe('#own/a');
    expect($$('.sva-view-item[aria-current="page"]').map((node) => node.dataset.item)).toEqual([
      'a'
    ]);
    expect($('.sva-view').textContent).toBe('drawn: a');
    $('.sva-view-item[data-item=""]').click();
    expect(app.state.item).toBeNull();
    expect(window.location.hash).toBe('#own');
    // An item the page passed over cannot be opened by its address.
    for (const id of ['d', 'e', 'f', 'b']) {
      app.select('own', id);
      expect(app.state.item, id).toBeNull();
      expect(window.location.hash).toBe('#own');
    }
    // Another tab takes the row back.
    app.select('data');
    expect($('.sva-view-items')).toBeNull();
    expect($('.sva-charts').hidden).toBe(true);
  });

  it('APP-RBQM-068: an item whose id is not text is read as the view’s first page, so clicking it opens the first page (#279)', () => {
    const { app } = mount({
      items: () => [{ id: 'a', label: 'A' }, { id: 7, label: 'Seven' }, { label: 'None' }]
    });
    app.select('own', 'a');
    expect($$('.sva-view-item').map((node) => [node.dataset.item, node.textContent])).toEqual([
      ['a', 'A'],
      ['', 'Seven'],
      ['', 'None']
    ]);
    $$('.sva-view-item')[1].click();
    expect(app.state.item).toBeNull();
    expect(window.location.hash).toBe('#own');
    expect($('.sva-view').textContent).toBe('drawn: first page');
  });

  it('APP-RBQM-068: a view may bring the app’s one control to the end of its row, with items or with none, and Run details’ way in, openControl, opens the control’s panel under the row; a view that brings neither leaves the row hidden (#279, #280)', () => {
    const press = vi.fn();
    let phase = 'off';
    const control = () => ({
      state: () =>
        phase === 'off'
          ? { phase: 'off', say: 'Needs R', label: 'Start', className: 'own-start' }
          : { phase: 'ready', say: 'R ready', details: { heading: 'Ready', text: ['It ran.'] } },
      press
    });
    const { app } = mount({ control });
    // Before the view is open its control is not on the page.
    expect($('.sva-r')).toBeNull();
    app.select('own');
    expect($('.sva-charts').hidden).toBe(false);
    expect($('.sva-view-items')).toBeNull();
    expect($('.sva-charts').lastElementChild).toBe($('.sva-charts > .sva-r'));
    expect($('.sva-r').dataset.phase).toBe('off');
    $('.sva-r .sva-action.own-start').click();
    expect(press).toHaveBeenCalledTimes(1);
    // With nothing to show, openControl opens nothing.
    app.openControl();
    expect($('.sva-r-under').hidden).toBe(true);
    phase = 'ready';
    app.openControl();
    expect($('.sva-r-under').hidden).toBe(false);
    expect($('.sva-r-under .sva-r-panel .sva-r-heading').textContent).toBe('Ready');
    expect($('.sva-chip').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe($('.sva-r-x'));
    $('.sva-r-x').click();
    expect($('.sva-r-panel')).toBeNull();
    // On a tab that is not a view's it does nothing.
    app.select('data');
    expect($('.sva-r')).toBeNull();
    app.openControl();
    expect($('.sva-r-panel')).toBeNull();

    // With items, the control comes after them.
    const both = mount({ control, items: () => [{ id: '', label: 'Home' }] });
    phase = 'off';
    both.app.select('own');
    expect(
      [...$('.sva-charts').children].filter((node) => !node.hidden).map((node) => node.className)
    ).toEqual(['sva-group sva-view-items sva-library-group', 'sva-r']);
    // A view that says it has no control has none.
    const none = mount({ control: () => null });
    none.app.select('own');
    expect($('.sva-r')).toBeNull();
    expect($('.sva-charts').hidden).toBe(true);
  });

  it('APP-RBQM-068: a view whose control throws when it is read gets no control and the page still draws the view and its row (#280)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = mount({
      items: () => [{ id: '', label: 'First' }],
      control() {
        throw new Error('no control');
      }
    });
    app.select('own');
    expect(warn.mock.calls.map((call) => call[0])).toContain(
      'safety.viz app: a view’s control could not be read.'
    );
    expect($('.sva-charts > .sva-r')).toBeNull();
    expect($$('.sva-view-item').map((node) => node.textContent)).toEqual(['First']);
    expect($('.sva-view').textContent).toBe('drawn: first page');
  });
});

describe('the page: a view that brings links for a footnote (#271)', () => {
  const footnote = () => $('.sva-chart-links');
  const links = () =>
    $$('.sva-chart-links a').map((a) => [
      a.dataset.link,
      a.getAttribute('href'),
      a.textContent,
      a.getAttribute('target'),
      a.getAttribute('rel')
    ]);

  it('APP-PAGE-041: a view that brings links ends with the footnote a chart has: its title and each link by the words it gave, under the view, opening in a new tab that is handed nothing of the page (#271)', () => {
    const { app } = mount({
      links: [
        { key: 'docs', label: 'Its documentation', href: 'https://example.org/docs/' },
        { key: 'evidence', label: 'Test evidence', href: '../own/evidence.html' }
      ]
    });
    // The data view is no view's page.
    expect(footnote()).toBeNull();
    app.select('own');
    expect(footnote().textContent).toBe('Own: Its documentation · Test evidence');
    expect(footnote().previousElementSibling).toBe($('.sva-view'));
    expect(links()).toEqual([
      ['docs', 'https://example.org/docs/', 'Its documentation', '_blank', 'noopener'],
      ['evidence', '../own/evidence.html', 'Test evidence', '_blank', 'noopener']
    ]);
    // Drawn again, there is still one.
    app.select('data');
    app.select('own');
    expect($$('.sva-chart-links')).toHaveLength(1);
  });

  it('APP-PAGE-041: a view that throws when it is drawn still ends with its footnote, as a chart that did not draw does (#271)', () => {
    const { app } = mount({
      links: [{ key: 'docs', label: 'Its documentation', href: 'https://example.org/docs/' }],
      render() {
        throw new Error('no page');
      }
    });
    app.select('own');
    expect($('.sva-view').textContent).toBe('Did not draw. no page');
    expect(footnote().textContent).toBe('Own: Its documentation');
  });

  it('APP-PAGE-042: a view’s links are read safely: a view that brings none has no footnote, nor has one whose list is not a list; a link with no words, no address or an address that is a script is left out, and the others are kept (#271)', () => {
    for (const none of [
      undefined,
      null,
      'https://example.org/',
      { href: 'https://example.org/' },
      []
    ]) {
      const { app } = mount({ links: none });
      app.select('own');
      expect(footnote(), String(none)).toBeNull();
      expect($('.sva-view').textContent).toBe('drawn: first page');
    }
    const { app } = mount({
      links: [
        null,
        'https://example.org/',
        { label: 'No address' },
        { href: 'https://example.org/no-words' },
        { label: '', href: 'https://example.org/empty-words' },
        { label: 'A script', href: 'javascript:alert(1)' },
        { label: 'Data', href: 'data:text/html,<p>x' },
        // The browser drops a space or a control character before an address,
        // and a tab or a line break inside one: these are scripts too (#309).
        { label: 'A script after a space', href: ' javascript:alert(1)' },
        { label: 'A script after a tab', href: '\tjavascript:alert(1)' },
        { label: 'A script with a tab in it', href: 'java\tscript:alert(1)' },
        { label: 'A script with a line break in it', href: 'java\nscript:alert(1)' },
        { label: 'A script after a control character', href: '\u0001javascript:alert(1)' },
        { label: 'Data after a space', href: ' data:text/html,<p>x' },
        { label: 'Kept', href: 'https://example.org/kept' },
        { key: 7, label: 'Kept too', href: 'http://example.org/too' }
      ]
    });
    app.select('own');
    expect(footnote().textContent).toBe('Own: Kept · Kept too');
    // A link that names no key is given the plain one.
    expect(links().map(([key, href]) => [key, href])).toEqual([
      ['link', 'https://example.org/kept'],
      ['link', 'http://example.org/too']
    ]);
  });
});

describe('the page: what a view hands it is read safely, and its details are left with its tab (#309)', () => {
  it('APP-PAGE-043: a view whose tag throws, or that has none, still gets its tab and its page, with no words where the tag would be; one whose ownsNotes throws is drawn with the page’s notes; and an item whose icon is named for something every object has draws an empty mark (#309)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thrown = mount({
      tag() {
        throw new Error('tag broke');
      }
    });
    expect($$('.sva-view-tab')).toHaveLength(1);
    expect($('.sva-view-tab .sva-tab-count').textContent).toBe('');
    expect(warn.mock.calls.map(([first]) => first)).toContain(
      'safety.viz app: a view could not say its tag.'
    );
    thrown.app.select('own');
    expect($('.sva-view').textContent).toBe('drawn: first page');
    // The other tabs are as they were.
    thrown.app.select('data');
    expect(thrown.app.state.selected).toBe('data');

    const none = mount({ tag: undefined });
    expect($('.sva-view-tab .sva-tab-count').textContent).toBe('');
    none.app.select('own');
    expect($('.sva-view').textContent).toBe('drawn: first page');
    const empty = mount({ tag: () => null });
    expect($('.sva-view-tab .sva-tab-count').textContent).toBe('');
    empty.app.select('own');
    expect($('.sva-view').textContent).toBe('drawn: first page');

    warn.mockClear();
    const notes = mount({
      ownsNotes() {
        throw new Error('notes broke');
      }
    });
    notes.app.select('own');
    expect($('.sva-view').textContent).toBe('drawn: first page');
    expect(warn.mock.calls.map(([first]) => first)).toContain(
      'safety.viz app: a view could not say whether it shows the load’s notes.'
    );

    const marked = mount({
      items: () => [
        { id: '', label: 'Home', icon: 'constructor' },
        { id: 'a', label: 'A', icon: 'toString' },
        { id: 'b', label: 'B', icon: 'ran' }
      ]
    });
    marked.app.select('own');
    const marks = $$('.sva-view-item svg');
    expect(marks.map((svg) => svg.childNodes.length)).toEqual([0, 0, marks[2].childNodes.length]);
    expect(marks[2].childNodes.length).toBeGreaterThan(0);
    expect($('.sva-view').textContent).toBe('drawn: first page');
  });

  it('APP-R-054: a control’s details panel is left with its tab: opened on a view, it is closed when the reader comes back from another tab, by the chip or by openControl, and it stays open while the reader moves among the view’s own items (#309)', () => {
    const control = () => ({
      state: () => ({
        phase: 'ready',
        say: 'R ready',
        details: { heading: 'Ready', text: ['It ran.'] }
      }),
      press() {}
    });
    const { app } = mount({
      control,
      items: () => [
        { id: '', label: 'Home' },
        { id: 'a', label: 'A' }
      ]
    });
    app.select('own');
    // Opened by the chip.
    $('.sva-chip').click();
    expect($('.sva-r-panel .sva-r-heading').textContent).toBe('Ready');
    // Still open on another page of the same tab.
    app.select('own', 'a');
    expect($('.sva-r-panel')).not.toBeNull();
    // Left, and come back to: closed, and the chip says so.
    app.select('data');
    expect($('.sva-r-panel')).toBeNull();
    app.select('own');
    expect($('.sva-r-panel')).toBeNull();
    expect($('.sva-r-under').hidden).toBe(true);
    expect($('.sva-chip').getAttribute('aria-expanded')).toBe('false');
    // The same when Run details’ way in opened it, and the tab left was a chart’s.
    app.openControl();
    expect($('.sva-r-panel')).not.toBeNull();
    app.select('histogram');
    app.select('own');
    expect($('.sva-r-panel')).toBeNull();
    // It opens again when asked.
    $('.sva-chip').click();
    expect($('.sva-r-panel')).not.toBeNull();
  });
});
