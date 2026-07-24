// The cohort stepper for the participant-profile module (#98, PPRF-5): when a
// selection holds more than one participant, a header-adjacent strip
// `◀ k of N · id ▶` walks the worst-first cohort (rankParticipants,
// structureData.js), rendering the full profile for the current participant.
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
 * @returns {HTMLElement} The stepper strip element.
 */
export function renderStepper(ids, index, { onStep } = {}) {
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
  return strip;
}
