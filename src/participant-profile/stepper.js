// The cohort stepper for the participant-profile module (#98, PPRF-5; v2
// obot.roadmap#75 decision D8): when a selection holds more than one
// participant, a strip `◀ k of N · id ▶` walks the worst-first cohort
// (rankParticipants, structureData.js), rendering the full profile for the
// current participant. In the rail the strip is pinned above the scrolling
// block — it would otherwise leave the viewport the moment the reviewer reaches
// the measure table — and it expands to the ranked list so the cohort itself is
// readable without leaving the rail.
// Real buttons with aria-labels, an aria-live count, and ArrowLeft/ArrowRight
// support on the focusable strip (PPRF-8). Navigation reports through the
// onStep callback with the target index — the entry re-renders and notifies the
// host via settings.on_step; the stepper itself never dispatches an event
// (PPRF-6). Steps clamp at the cohort ends (matching the disabled buttons).

import { createElement } from '../shell.js';

/**
 * Render the cohort stepper strip (PPRF-5).
 * @param {string[]} ids The ranked cohort ids, worst-first.
 * @param {number} index The current 0-based position in the cohort.
 * @param {Object} [handlers] Optional handlers.
 * @param {(index: number) => void} [handlers.onStep] Called with the clamped target index on navigation.
 * @param {Function} [handlers.onToggleList] Called when the ranked-list disclosure is activated (decision D8).
 * @param {boolean} [handlers.listOpen=false] Whether the ranked list is currently open.
 * @param {?Array<{id: string, index: number, current: boolean}>} [handlers.ranked=null] The ranked cohort rows to list when open.
 * @returns {HTMLElement} The stepper strip element.
 */
export function renderStepper(
  ids,
  index,
  { onStep, onToggleList, listOpen = false, ranked = null } = {}
) {
  const strip = createElement('div', 'sv-profile-stepper');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Selected participants');
  strip.setAttribute('data-sv-focus', 'stepper');
  strip.tabIndex = 0;

  const step = (delta) => {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    if (onStep) onStep(target);
  };

  const prev = createElement('button', 'sv-profile-step sv-profile-step-prev', '◀');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous participant');
  prev.setAttribute('data-sv-focus', 'step-prev');
  prev.disabled = index === 0;
  prev.onclick = () => step(-1);

  const count = createElement(
    'span',
    'sv-profile-step-count',
    `${index + 1} of ${ids.length} · ${ids[index]}`
  );
  count.setAttribute('aria-live', 'polite');

  const next = createElement('button', 'sv-profile-step sv-profile-step-next', '▶');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next participant');
  next.setAttribute('data-sv-focus', 'step-next');
  next.disabled = index === ids.length - 1;
  next.onclick = () => step(1);

  strip.onkeydown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  };

  strip.append(prev, count, next);

  // The disclosure only appears when a host wired it, so the v1 strip shape is
  // unchanged for callers that do not want the list.
  if (!onToggleList) return strip;

  const toggle = createElement(
    'button',
    'sv-profile-step-toggle',
    listOpen ? 'Hide list' : 'Show list'
  );
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(Boolean(listOpen)));
  toggle.setAttribute('data-sv-focus', 'step-toggle');
  toggle.onclick = () => onToggleList();
  strip.append(toggle);

  if (!listOpen || !Array.isArray(ranked)) return strip;

  const wrap = createElement('div', 'sv-profile-cohort');
  const list = createElement('ol', 'sv-profile-cohort-list');
  ranked.forEach((entry) => {
    const item = createElement('li');
    const button = createElement('button', 'sv-profile-cohort-item', entry.id);
    button.type = 'button';
    button.setAttribute('aria-current', entry.current ? 'true' : 'false');
    if (entry.current) button.classList.add('is-current');
    button.onclick = () => {
      if (!entry.current && onStep) onStep(entry.index);
    };
    item.append(button);
    list.append(item);
  });
  wrap.append(list);

  const shell = createElement('div', 'sv-profile-stepper-wrap');
  shell.append(strip, wrap);
  return shell;
}
