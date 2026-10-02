// The keyboard navigation model of the patient-journey-explorer module (#142,
// design §8, D2): a per-lane overlay of real, transparent buttons positioned
// from `chart.$pjeMarks`, one tab stop per lane (roving tabindex), arrows
// within and between lanes, and the persistent aria-live announcer.
//
// The canvas paints; the button is the hit target, the focus target and the
// accessible name. Activation (Enter, Space, click) is the button's own native
// `click` — nothing here intercepts it, so a key can never anchor twice. This
// file handles only the keys the button does not: arrows, Home/End, and
// Shift+Enter (jump to the source row, PC-4). Escape belongs to the
// orchestrator, which owns the precedence between tooltip, anchor and rail.

import { createElement } from '../shell.js';

/** The minimum hit box (px) of a mark button; smaller marks are padded around their centre. */
export const MIN_HIT_PX = 24;

const MARK = '.sv-pje-mark';

/**
 * The one persistent, visually hidden live region the module announces into
 * (created once in the constructor, never torn down between renders).
 * @returns {HTMLElement} The `.sv-pje-live` element.
 */
export function createLiveRegion() {
  const live = createElement('div', 'sv-pje-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  return live;
}

/**
 * Chronological order of two mark records: day (unplaceable last), then
 * sourceIndex.
 * @private
 */
function chronological(a, b) {
  const da = Number.isFinite(a.event.day) ? a.event.day : Infinity;
  const db = Number.isFinite(b.event.day) ? b.event.day : Infinity;
  return da - db || (a.event.sourceIndex ?? 0) - (b.event.sourceIndex ?? 0);
}

/**
 * The per-lane mark overlay: builds the buttons from each chart's recorded
 * marks, keeps one tab stop per lane, and moves focus with the arrow keys.
 */
export class MarkOverlay {
  /**
   * @param {Object} handlers The orchestrator's callbacks.
   * @param {(event: Object, sameDay: string[]) => string} handlers.describe The accessible name of a mark, given the labels of the other records stacked on the same day (empty for a lone mark).
   * @param {(eventId: string) => boolean} handlers.isAnchored Whether an event is the current anchor.
   * @param {(eventId: string, button: HTMLButtonElement) => void} handlers.onActivate Click / Enter / Space on a mark.
   * @param {(eventId: string) => void} handlers.onJump Shift+Enter on a mark.
   * @param {(event: Object, button: HTMLButtonElement, via: 'hover'|'focus') => void} handlers.onEnter Pointer enters or focus lands on a mark.
   * @param {(via: 'hover'|'focus') => void} handlers.onLeave Pointer leaves or focus leaves a mark.
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.entries = [];
    this.activeByLane = new Map();
    this.stack = null;
    this.keydownHandler = (event) => this.handleKeydown(event);
    this.focusinHandler = (event) => {
      const button = event.target && event.target.closest ? event.target.closest(MARK) : null;
      if (button) this.setActive(button);
    };
  }

  /**
   * Install the delegated key and focus handlers on the lane stack.
   * @param {HTMLElement} stack The `.sv-pje-lanes` element.
   * @returns {void}
   */
  attach(stack) {
    this.stack = stack;
    stack.addEventListener('keydown', this.keydownHandler);
    stack.addEventListener('focusin', this.focusinHandler);
  }

  /**
   * Remove the handlers installed by attach.
   * @returns {void}
   */
  detach() {
    if (!this.stack) return;
    this.stack.removeEventListener('keydown', this.keydownHandler);
    this.stack.removeEventListener('focusin', this.focusinHandler);
    this.stack = null;
  }

  /**
   * Rebuild every lane's buttons from its chart's `$pjeMarks` (called after
   * every render and every resize). Reference rules carry no event and get no
   * button. The lane's active mark (its one tab stop) is remembered across
   * rebuilds so a keyboard user returns to where they were.
   * @param {Array<{chartKey: string, laneKey: string, label: string, laneEl: HTMLElement, overlayEl: HTMLElement, chart: Object}>} entries The live lanes, in stack order.
   * @returns {void}
   */
  sync(entries) {
    this.entries = entries;
    for (const entry of entries) {
      const { overlayEl, chart, chartKey, label } = entry;
      overlayEl.setAttribute('role', 'group');
      overlayEl.setAttribute('aria-label', `${label} marks`);
      const marks = [];
      const seen = new Set();
      for (const mark of ((chart && chart.$pjeMarks) || [])
        .filter((mark) => mark.event)
        .sort(chronological)) {
        if (seen.has(mark.event.id)) continue;
        seen.add(mark.event.id);
        marks.push(mark);
      }
      // A resize re-sync keeps the same marks in the same order: update the
      // buttons in place so keyboard focus never churns. Anything else rebuilds.
      const existing = this.buttons(overlayEl);
      const sameSet =
        existing.length === marks.length &&
        existing.every((button, index) => button.dataset.eventId === marks[index].event.id);
      let buttons;
      if (sameSet) {
        buttons = existing;
        marks.forEach((mark, index) => this.placeButton(existing[index], mark));
      } else {
        overlayEl.innerHTML = '';
        buttons = marks.map((mark) => this.buildButton(mark));
        overlayEl.append(...buttons);
      }
      this.stackSameDay(buttons);
      const wanted = this.activeByLane.get(chartKey);
      const active = buttons.find((button) => button.dataset.eventId === wanted) || buttons[0];
      buttons.forEach((button) => button.setAttribute('tabindex', button === active ? '0' : '-1'));
      if (active) this.activeByLane.set(chartKey, active.dataset.eventId);
    }
  }

  /**
   * Buttons that sit on the identical box (same-day records in a one-row
   * lane: the eight screening-history records of the pilot's opening
   * participant) would otherwise let the LAST one win every pointer while the
   * FIRST one is the lane's tab stop. The first (chronological) button is
   * raised above the others so pointer and keyboard land on the same record,
   * and it carries the group on `data-same-day` (the other records' labels)
   * and `data-same-day-count` so its tooltip and accessible name can say
   * "and N more on this day" — the records are all still reachable by arrow
   * key and in the source drawer.
   * @private
   */
  stackSameDay(buttons) {
    const groups = new Map();
    for (const button of buttons) {
      const key = `${button.style.left}|${button.style.top}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(button);
    }
    for (const group of groups.values()) {
      group.forEach((button, index) => {
        button.style.zIndex = index === 0 && group.length > 1 ? '1' : '';
        if (index === 0 && group.length > 1) {
          button.dataset.sameDayCount = String(group.length - 1);
          button.dataset.sameDay = group
            .slice(1)
            .map((other) => other.dataset.label || '')
            .join('; ');
        } else {
          delete button.dataset.sameDayCount;
          delete button.dataset.sameDay;
        }
      });
    }
    for (const button of buttons) {
      const others = button.dataset.sameDay;
      button.setAttribute(
        'aria-label',
        this.handlers.describe(this.eventOf(button), others ? others.split('; ') : [])
      );
    }
  }

  /**
   * The event behind a button, from the entry that built it.
   * @private
   */
  eventOf(button) {
    return button.$pjeEvent || null;
  }

  /**
   * Position a mark button over its painted mark with at least a MIN_HIT_PX
   * square hit box around the same centre, and refresh the attributes that
   * depend on the render (glyph, emphasis, accessible name, pressed state).
   * @private
   */
  placeButton(button, mark) {
    const { event } = mark;
    button.$pjeEvent = event;
    button.dataset.day = Number.isFinite(event.day) ? String(event.day) : '';
    button.dataset.label = String(event.label ?? '');
    button.dataset.glyph = mark.glyph;
    button.dataset.emphasis = mark.emphasis;
    button.setAttribute('aria-label', this.handlers.describe(event, []));
    button.setAttribute('aria-pressed', String(Boolean(this.handlers.isAnchored(event.id))));
    const width = Math.max(mark.width, MIN_HIT_PX);
    const height = Math.max(mark.height, MIN_HIT_PX);
    const left = mark.x + mark.width / 2 - width / 2;
    const top = mark.y + mark.height / 2 - height / 2;
    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    button.style.width = `${Math.round(width)}px`;
    button.style.height = `${Math.round(height)}px`;
  }

  /**
   * One mark button: the hit target, the focus target and the accessible
   * name of a painted mark.
   * @private
   */
  buildButton(mark) {
    const { event } = mark;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sv-pje-mark';
    button.dataset.eventId = event.id;
    button.setAttribute('data-sv-focus', `mark-${event.id}`);
    this.placeButton(button, mark);
    button.addEventListener('click', () => this.handlers.onActivate(event.id, button));
    button.addEventListener('mouseenter', () => this.handlers.onEnter(event, button, 'hover'));
    button.addEventListener('mouseleave', () => this.handlers.onLeave('hover'));
    button.addEventListener('focus', () => this.handlers.onEnter(event, button, 'focus'));
    button.addEventListener('blur', () => this.handlers.onLeave('focus'));
    return button;
  }

  /**
   * The buttons of one overlay, in chronological (DOM) order.
   * @private
   */
  buttons(overlayEl) {
    return [...overlayEl.querySelectorAll(MARK)];
  }

  /**
   * The entry a button belongs to.
   * @private
   */
  entryOf(button) {
    return this.entries.find((entry) => entry.overlayEl.contains(button)) || null;
  }

  /**
   * Make a button its lane's tab stop.
   * @private
   */
  setActive(button) {
    const entry = this.entryOf(button);
    if (!entry) return;
    for (const other of this.buttons(entry.overlayEl)) {
      other.setAttribute('tabindex', other === button ? '0' : '-1');
    }
    this.activeByLane.set(entry.chartKey, button.dataset.eventId);
  }

  /**
   * The entries whose lane is visible (enabled, and inside an expanded group)
   * and carries at least one mark.
   * @private
   */
  visibleEntries() {
    return this.entries.filter(
      (entry) => !entry.laneEl.closest('[hidden]') && this.buttons(entry.overlayEl).length > 0
    );
  }

  /**
   * The mark in the adjacent visible lane whose day is closest to a day.
   * @private
   */
  nearestInAdjacentLane(entry, day, direction) {
    const visible = this.visibleEntries();
    let index = visible.indexOf(entry) + direction;
    while (index >= 0 && index < visible.length) {
      const candidates = this.buttons(visible[index].overlayEl);
      if (candidates.length) {
        let best = candidates[0];
        let bestDistance = Infinity;
        for (const candidate of candidates) {
          const candidateDay = Number(candidate.dataset.day);
          const distance =
            Number.isFinite(candidateDay) && Number.isFinite(day)
              ? Math.abs(candidateDay - day)
              : Infinity;
          if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
          }
        }
        return best;
      }
      index += direction;
    }
    return null;
  }

  /**
   * Focus a mark, making it its lane's tab stop.
   * @param {HTMLButtonElement} button The mark button.
   * @returns {void}
   */
  focusMark(button) {
    if (!button) return;
    this.setActive(button);
    button.focus();
  }

  /**
   * Arrow keys move chronologically within the lane (no wrap) and to the
   * nearest mark in the adjacent lane; Home/End jump to the lane's ends;
   * Shift+Enter jumps to the source row. Enter and Space are left to the
   * button's native activation.
   * @param {KeyboardEvent} event The keydown event.
   * @returns {void}
   */
  handleKeydown(event) {
    const button = event.target && event.target.closest ? event.target.closest(MARK) : null;
    if (!button) return;
    const entry = this.entryOf(button);
    if (!entry) return;
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      this.handlers.onJump(button.dataset.eventId);
      return;
    }
    const list = this.buttons(entry.overlayEl);
    const index = list.indexOf(button);
    const day = Number(button.dataset.day);
    let target = null;
    switch (event.key) {
      case 'ArrowRight':
        target = list[Math.min(index + 1, list.length - 1)];
        break;
      case 'ArrowLeft':
        target = list[Math.max(index - 1, 0)];
        break;
      case 'Home':
        target = list[0];
        break;
      case 'End':
        target = list[list.length - 1];
        break;
      case 'ArrowDown':
        target = this.nearestInAdjacentLane(entry, day, 1);
        break;
      case 'ArrowUp':
        target = this.nearestInAdjacentLane(entry, day, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target && target !== button) this.focusMark(target);
  }
}
