// Demo app: the R control (#276, obot.roadmap#404). One control for every tab
// that starts R, at the right end of the chart-name row. It has four states:
//
//   off       a few words for why R is needed, what starting it costs, and one
//             button; the whole sentence is on hover.
//   starting  a spinner and a count of seconds. A tab whose start is long also
//             names the step it is on and counts it, with segments filling.
//   ready     a quiet chip. A click opens the details: R's version, how long it
//             took, the size of the download and where R runs, and whatever
//             else the tab puts there.
//   failed    the words, in the alarm colour, with Try again beside them and
//             the reason one click away; the browser's own message is behind a
//             disclosure inside that.
//
// The control starts nothing and knows nothing of R: a tab hands it what to
// say (src/app/libraries.js::controlState) and what a press does.
import { el } from './dom.js';

/** The phases a control can be in. */
export const R_PHASES = ['off', 'starting', 'ready', 'failed'];

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Whole seconds since a moment, never less than nought.
 * @param {number} since The moment, in milliseconds.
 * @param {number} now Now, in milliseconds.
 * @returns {number} The seconds.
 */
export const secondsSince = (since, now) => Math.max(0, Math.floor((now - since) / 1000));

/**
 * The details panel of a control: a heading, then terms and what is said of
 * each, sentences, what the browser said behind a disclosure, and buttons.
 * @param {Object} details What the panel holds, as controlState gives it.
 * @param {Function} onClose Called when the cross is pressed.
 * @returns {HTMLElement} The panel, `.sva-r-panel`.
 */
function detailsPanel(details, onClose) {
  const panel = el('div', 'sva-r-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', details.heading);
  const cross = el('button', 'sva-close sva-r-x', '×');
  cross.type = 'button';
  cross.setAttribute('aria-label', 'Close');
  cross.onclick = onClose;
  panel.append(cross, el('h3', 'sva-r-heading', details.heading));
  for (const sentence of details.text) panel.append(el('p', 'sva-r-text', sentence));
  if (details.rows.length) {
    const list = el('dl', 'sva-r-list');
    for (const [term, said] of details.rows)
      list.append(el('dt', null, term), el('dd', null, said));
    panel.append(list);
  }
  if (details.more.length) {
    const more = el('details', 'sva-r-more');
    more.append(el('summary', null, details.moreTitle));
    for (const sentence of details.more) more.append(el('p', 'sva-r-text', sentence));
    panel.append(more);
  }
  if (details.actions.length) {
    const actions = el('p', 'sva-r-actions');
    for (const action of details.actions) {
      const button = el('button', 'sva-action', action.label);
      button.type = 'button';
      button.onclick = action.press;
      actions.append(button);
    }
    panel.append(actions);
  }
  return panel;
}

/**
 * Draw the R control as it stands now.
 * @param {Object} state What the tab says of its control, as `controlState` (src/app/libraries.js) gives it.
 * @param {Object} [options] Options.
 * @param {Function} [options.onPress] Called when the control's button is pressed: Start R, or Try again.
 * @param {boolean} [options.open] Whether the details panel is open.
 * @param {Function} [options.onToggle] Called with whether the panel should be open, when the chip, the cross or Escape asks.
 * @param {() => number} [options.now] The clock, in milliseconds.
 * @returns {{row: HTMLElement, panel: ?HTMLElement, destroy: Function}} The control, `.sva-r`, for the chart-name row; its open panel, for the page to place under the row; and what stops its clock.
 */
export function rControl(
  state,
  { onPress = () => {}, open = false, onToggle = () => {}, now = () => Date.now() } = {}
) {
  const root = el('div', 'sva-r');
  root.dataset.phase = state.phase;
  const row = el('span', 'sva-r-row');
  root.append(row);
  let timer = null;
  let onKey = null;
  const destroy = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (onKey) document.removeEventListener('keydown', onKey);
    onKey = null;
  };
  const say = (text, bad = false) => el('span', bad ? 'sva-r-say sva-bad' : 'sva-r-say', text);
  const button = (label) => {
    const control = el('button', 'sva-action', label);
    control.type = 'button';
    control.disabled = state.disabled;
    control.onclick = onPress;
    return control;
  };
  const chip = (label, name) => {
    const control = el('button', 'sva-chip');
    control.type = 'button';
    control.setAttribute('aria-expanded', String(open));
    control.setAttribute('aria-label', name);
    control.append(label, el('span', 'sva-caret', '▾'));
    control.onclick = () => onToggle(!open);
    return control;
  };
  const hasDetails = Boolean(state.details);

  if (state.phase === 'starting') {
    row.setAttribute('role', 'status');
    const spin = el('span', 'sva-spin');
    spin.setAttribute('aria-hidden', 'true');
    row.append(spin, say(state.step ? state.step.say : state.say));
    if (state.step) {
      // The step, counted: as many segments as there are steps, filled to this one.
      const segments = el('span', 'sva-segs');
      segments.setAttribute('role', 'img');
      segments.setAttribute('aria-label', `Step ${state.step.index} of ${state.step.of}`);
      for (let index = 1; index <= state.step.of; index += 1) {
        const segment = el('i', index < state.step.index ? 'sva-done' : null);
        if (index === state.step.index) segment.className = 'sva-now';
        segments.append(segment);
      }
      row.append(segments);
    }
    const meta = el('span', 'sva-r-meta');
    const said = () => {
      const seconds = state.since === null ? null : `${secondsSince(state.since, now())} s`;
      return [state.meta, seconds].filter(Boolean).join(' · ');
    };
    meta.textContent = said();
    row.append(meta);
    if (state.since !== null) {
      timer = setInterval(() => {
        if (!root.isConnected) destroy();
        else meta.textContent = said();
      }, 1000);
    }
  } else if (state.phase === 'ready') {
    const dot = el('span', 'sva-dot');
    dot.setAttribute('aria-hidden', 'true');
    const control = chip('', `${state.title || 'R is ready'}. ${open ? 'Hide' : 'Show'} details`);
    control.prepend(dot, state.say);
    control.classList.add('sva-r-ready');
    control.disabled = !hasDetails;
    row.append(control);
  } else if (state.phase === 'failed') {
    row.setAttribute('role', 'alert');
    row.append(say(state.say, true));
    if (isText(state.label)) row.append(button(state.label));
    if (hasDetails) {
      const why = chip(state.why, `${state.say}. ${open ? 'Hide' : 'Show'} why`);
      why.classList.add('sva-r-why');
      row.append(why);
    }
  } else {
    // Off: why, the cost, and the button; the whole sentence on hover.
    if (isText(state.say)) row.append(say(state.say));
    if (isText(state.meta)) row.append(el('span', 'sva-r-meta', state.meta));
    if (isText(state.label)) {
      const control = button(state.label);
      if (isText(state.title)) control.title = state.title;
      row.append(control);
    }
    if (isText(state.title)) row.title = state.title;
  }

  let panel = null;
  if (open && hasDetails) {
    panel = detailsPanel(state.details, () => onToggle(false));
    onKey = (event) => {
      if (event.key === 'Escape') onToggle(false);
    };
    document.addEventListener('keydown', onKey);
  }
  return { row: root, panel, destroy };
}
