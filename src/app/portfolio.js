// Demo app: the studies a reader has, and the one they are working with. A
// study is whatever is loaded, wherever it came from: a demo study, the
// reader's own files, or a simulated study from study.builder.
//
// Three things are drawn here, for a page that asks for them (`portfolio: true`):
//   - the study chip in the header: the study's name, and under it the list of
//     studies, with a way to add one and a way to the whole list;
//   - the i beside it: what the study is, in a few lines;
//   - the Studies view: every study in one list, and the ways to add one.
//
// The page (page.js) says what the studies are: `app.portfolio()`. This module
// draws them and decides nothing about loading.

import { el, plural } from './dom.js';
import { snapshotDrawn } from './viewer-view.js';

/** The Studies view's id, and its tab's. */
export const STUDIES_VIEW_ID = 'studies';

const KIND_CLASS = { Demo: 'demo', 'Your files': 'own', Simulated: 'sim' };

function kindPill(kind) {
  const pill = el('span', `sva-kind sva-kind-${KIND_CLASS[kind] || 'demo'}`, kind);
  return pill;
}

function button(className, label, onClick) {
  const made = el('button', className, label);
  made.type = 'button';
  made.onclick = onClick;
  return made;
}

/** What a study supports, in a few words, when the page can say. */
function supportSaid(entry) {
  if (!entry.support) return '';
  const { ready, total } = entry.support;
  return `${ready} of ${plural(total, 'chart')} ready`;
}

// What the chip keeps between draws, by its place in the header: where the
// reader was when something opened under it, the sentence they closed, whether
// they asked for a study from its list, and what listens while something is open.
const kept = new WeakMap();

// The space left between what opens under the chip and the page's edge.
const EDGE = 16;

/**
 * Keep what opens under the chip inside the page (#407). It opens at the
 * chip's left edge; where that would run it past the page's right edge, as on
 * a phone, it is moved left by what would run past.
 * @param {HTMLElement} pop The list, the card or the sentence.
 * @returns {void}
 */
function keepInside(pop) {
  pop.style.left = '';
  const page = document.documentElement.clientWidth;
  if (!page) return;
  const box = pop.getBoundingClientRect();
  const past = box.right - (page - EDGE);
  if (past > 0) pop.style.left = `${-Math.min(past, Math.max(0, box.left - EDGE))}px`;
}

/**
 * Draw the study chip and the i beside it into the header.
 * @param {HTMLElement} container The chip's place in the header's bar.
 * @param {Object} app The app handle.
 * @returns {void}
 */
export function drawChip(container, app) {
  const { state } = app;
  const said = app.portfolio();
  const current = said.studies.find((entry) => entry.current) || null;
  if (!kept.has(container)) kept.set(container, { at: null, closed: '', asked: false, off: null });
  const memory = kept.get(container);
  if (memory.off) memory.off();
  memory.off = null;
  // A sentence the reader closed is not said again; the next one is.
  if (!said.problem) memory.closed = '';
  if (!said.busy) memory.asked = false;
  // The reader moved to another tab or chart: what was open under the chip is closed (#407).
  const at = `${state.selected}/${state.item || ''}`;
  if (memory.at !== at) {
    if (memory.at !== null) {
      state.chip = null;
      memory.closed = said.problem || '';
    }
    memory.at = at;
  }
  // A study that did not open is said under the chip, where the reader is
  // (#407); the Studies view says it in its own list.
  const problem =
    said.problem && said.problem !== memory.closed && state.selected !== STUDIES_VIEW_ID
      ? said.problem
      : '';
  container.replaceChildren();
  const close = () => {
    state.chip = null;
    memory.closed = said.problem || '';
    app.retag();
  };
  const toggle = (which) => {
    state.chip = state.chip === which ? null : which;
    // The list or the card takes the sentence's place.
    memory.closed = said.problem || '';
    app.retag();
    if (state.chip) {
      const first = container.querySelector('.sva-chip-pop button, .sva-chip-pop a');
      if (first) first.focus();
    }
  };

  const chip = button('sva-studychip', undefined, () => toggle('menu'));
  chip.dataset.action = 'study-chip';
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', String(state.chip === 'menu'));
  // A study that kept its snapshots says which one the page draws, under its
  // name (#406): the charts and the RBQM tab draw that one, as the Overview does.
  const snapshot = current ? snapshotDrawn(state.named) : null;
  const name = el('span', 'sva-chip-name', current ? current.name : 'No study');
  const caret = el('span', 'sva-chip-caret', state.chip === 'menu' ? '▴' : '▾');
  if (snapshot) {
    const words = el('span', 'sva-chip-id');
    words.append(
      name,
      el('span', 'sva-chip-snap', `Snapshot ${snapshot.number} of ${snapshot.of}`)
    );
    chip.append(words, caret);
    chip.title = `${current.name} as it stood on ${snapshot.date}`;
    chip.setAttribute(
      'aria-label',
      `${current.name}, snapshot ${snapshot.number} of ${snapshot.of}, ${snapshot.date}`
    );
  } else {
    chip.append(name, caret);
    // The header cuts a name short before it grows a second row (#416): the
    // whole name is on hover, as it is with a snapshot's words.
    if (current) chip.title = current.name;
  }
  chip.lastChild.setAttribute('aria-hidden', 'true');
  container.append(chip);

  if (current) {
    const info = button('sva-chip-info', 'i', () => toggle('info'));
    info.dataset.action = 'study-info';
    info.setAttribute('aria-label', `About ${current.name}`);
    info.setAttribute('aria-expanded', String(state.chip === 'info'));
    container.append(info);
  }

  // While something is open under the chip, a click anywhere else on the page
  // and Escape, wherever the keyboard is, close it (#407). Nothing listens
  // while nothing is open, or once the page is gone.
  if (state.chip || problem) {
    const outside = (event) => {
      if (!container.isConnected) memory.off();
      else if (!event.composedPath().includes(container)) close();
    };
    const escape = (event) => {
      if (!container.isConnected) memory.off();
      else if (event.key === 'Escape') {
        const within = container.contains(document.activeElement);
        close();
        const again = container.querySelector('[data-action="study-chip"]');
        if (within && again) again.focus();
      }
    };
    const fit = () => container.querySelectorAll('.sva-chip-pop').forEach(keepInside);
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', fit);
    memory.off = () => {
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', fit);
      memory.off = null;
    };
  }

  if (state.chip === 'menu') {
    const pop = el('div', 'sva-chip-pop sva-chip-menu');
    pop.setAttribute('role', 'menu');
    pop.setAttribute('aria-label', 'Studies');
    pop.append(el('div', 'sva-chip-label', 'Studies'));
    for (const entry of said.studies) {
      const item = button('sva-chip-item', undefined, () => {
        state.chip = null;
        if (entry.current) app.retag();
        else {
          // What the study says while it opens is said under the chip.
          memory.asked = true;
          entry.open();
        }
      });
      item.dataset.study = entry.id;
      item.setAttribute('role', 'menuitem');
      if (entry.current) item.setAttribute('aria-current', 'true');
      const words = el('span', 'sva-chip-words');
      words.append(el('span', 'sva-chip-study', entry.name));
      if (entry.size) words.append(el('small', null, entry.size));
      item.append(words, kindPill(entry.kind));
      if (entry.current) {
        const tick = el('span', 'sva-chip-tick', '✓');
        tick.setAttribute('aria-hidden', 'true');
        item.append(tick);
      }
      pop.append(item);
    }
    const foot = el('div', 'sva-chip-foot');
    const all = (label, className, action) => {
      const made = button(`sva-button ${className}`, label, () => {
        state.chip = null;
        app.select(STUDIES_VIEW_ID);
      });
      made.dataset.action = action;
      return made;
    };
    foot.append(
      all('Add a study', 'sva-primary', 'add-study'),
      all('All studies', '', 'all-studies')
    );
    // The list is not whole while studies are still being looked for.
    if (said.busy) {
      const busy = el('p', 'sva-chip-busy', said.busy);
      busy.setAttribute('role', 'status');
      pop.append(busy);
    }
    pop.append(foot);
    container.append(pop);
    keepInside(pop);
  }

  if (state.chip === 'info' && current) {
    const pop = el('div', 'sva-chip-pop sva-chip-card');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `About ${current.name}`);
    const head = el('div', 'sva-chip-cardhead');
    head.append(el('strong', null, current.name), kindPill(current.kind));
    pop.append(head);
    const facts = el('dl', 'sva-chip-facts');
    const fact = (label, value) => {
      if (value === undefined || value === null || value === '') return;
      facts.append(el('dt', null, label), el('dd', null, String(value)));
    };
    for (const one of current.facts || []) fact(one.label, one.value);
    if (snapshot) {
      fact('Snapshot drawn', `${snapshot.date} · ${snapshot.number} of ${snapshot.of}`);
    }
    fact('Files', current.files);
    fact('Supports', supportSaid(current));
    pop.append(facts);
    if (current.about) pop.append(el('p', 'sva-chip-about', current.about));
    const look = button('sva-button', 'Look through the data', () => {
      state.chip = null;
      app.explore();
    });
    look.dataset.action = 'study-look';
    pop.append(look);
    container.append(pop);
    keepInside(pop);
  }

  // Under the chip while its list and its card are closed: a study that did
  // not open, in a sentence that stays until the reader closes it; or the
  // study the reader chose from the list, while it opens.
  const sentence = problem || (memory.asked && !state.chip ? said.busy : '');
  if (sentence && !state.chip) {
    const line = el('p', `sva-chip-pop sva-chip-said${problem ? ' sva-problem' : ''}`, sentence);
    line.setAttribute('role', problem ? 'alert' : 'status');
    container.append(line);
    keepInside(line);
  }
}

/**
 * The Studies view: every study in one list, and the ways to add one.
 * @returns {{id: string, title: string, tag: Function, render: Function}} The view, as page.js takes one.
 */
export function studiesView() {
  return {
    id: STUDIES_VIEW_ID,
    title: 'Studies',
    // Reached from the study chip, not from a tab of its own: the header's one row is full.
    tab: false,
    tag: (app) => String(app.portfolio().studies.length),
    render(container, app) {
      const said = app.portfolio();
      container.textContent = '';
      container.classList.add('sva-studies');
      const head = el('div', 'sva-studies-head');
      head.append(
        el('h2', 'sva-rbqm-heading', 'Studies'),
        el(
          'p',
          'sva-studies-lede',
          'Every study this page offers and this browser has kept, whatever it came from. Open one to work with it.'
        )
      );
      container.append(head);

      // The ways to add a study come first: a reader with none of their own starts there.
      container.append(el('h3', 'sva-studies-sub', 'Add a study'));
      const ways = el('div', 'sva-studies-ways');
      for (const way of said.add) {
        const card = el('div', 'sva-studies-way');
        card.append(el('strong', null, way.label), el('p', null, way.about));
        const go = button(`sva-button${way.primary ? ' sva-primary' : ''}`, way.action, () =>
          way.run()
        );
        go.dataset.add = way.id;
        card.append(go);
        ways.append(card);
      }
      container.append(ways);
      container.append(el('h3', 'sva-studies-sub', 'Open a study'));
      const list = el('div', 'sva-studies-list');
      list.setAttribute('role', 'table');
      list.setAttribute('aria-label', 'Studies');
      const top = el('div', 'sva-studies-row sva-studies-top');
      top.setAttribute('role', 'row');
      for (const label of ['Study', 'Kind', 'Size', 'Charts ready', '']) {
        const cell = el('span', null, label);
        cell.setAttribute('role', 'columnheader');
        top.append(cell);
      }
      list.append(top);
      for (const entry of said.studies) {
        const row = el('div', 'sva-studies-row');
        row.setAttribute('role', 'row');
        row.dataset.study = entry.id;
        if (entry.current) row.dataset.current = 'true';
        const cell = (...content) => {
          const made = el('span');
          made.setAttribute('role', 'cell');
          made.append(...content);
          row.append(made);
          return made;
        };
        const name = el('strong', null, entry.name);
        const first = cell(name);
        const under = [entry.current ? 'in use' : '', entry.about].filter(Boolean).join(' · ');
        if (under) first.append(el('small', null, under));
        cell(kindPill(entry.kind));
        cell(entry.size || '');
        cell(entry.current ? supportSaid(entry) : '');
        const actions = cell();
        actions.className = 'sva-studies-actions';
        if (entry.current) {
          const look = button('sva-button', 'Look through the data', () => app.explore());
          look.dataset.action = 'look';
          actions.append(look);
        } else {
          if (typeof entry.remove === 'function') {
            const remove = button('sva-button', 'Remove', () => entry.remove());
            remove.dataset.action = 'remove';
            remove.setAttribute('aria-label', `Remove ${entry.name} from this browser`);
            actions.append(remove);
          }
          const open = button('sva-button sva-primary', 'Open', () => entry.open());
          open.dataset.action = 'open';
          open.setAttribute('aria-label', `Open ${entry.name}`);
          actions.append(open);
        }
        list.append(row);
      }
      container.append(list);
      if (said.busy) container.append(el('p', 'sva-studies-lede', said.busy));
      if (said.problem) {
        const box = el('p', 'sva-message sva-problem', said.problem);
        box.setAttribute('role', 'alert');
        container.append(box);
      }

      return { destroy() {} };
    }
  };
}
