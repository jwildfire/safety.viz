// Demo app: the standard note (#321, obot.roadmap#420). One component for
// every sentence the app sets apart from a view, in two formats:
//
//   info     blue, with the information mark: something the reader may want
//            to know. The view is whole without it.
//   warning  amber, with the warning mark: something cannot run, or is
//            missing, until the reader acts.
//
// Both have the same shape: a mark, one sentence, and a cross only where
// closing the note loses nothing. The sentence is a paragraph, and may hold a
// button or a link among its words. A failure is not a note: it keeps the red
// edge of `.sva-problem`.
import { el } from './dom.js';
import { icon } from './icons.js';

/** The formats a note has. */
export const NOTE_KINDS = ['info', 'warning'];

/**
 * Draw a note.
 * @param {Object} [options] Options.
 * @param {string} [options.kind] One of NOTE_KINDS; anything else is `info`.
 * @param {string|Node|Array<string|Node>} [options.say] The sentence: words, and the buttons or links among them, in order. Words are set as text, never as markup.
 * @param {boolean} [options.busy] A turning ring where the mark is, for something under way.
 * @param {?Function} [options.onClose] Called when the cross is pressed; with none, the note has no cross.
 * @param {string} [options.tag] The note's element: `div`, or `li` in a list of notes.
 * @param {string} [options.className] Classes beside the note's own.
 * @param {?string} [options.role] Its role, `note` unless told; null for none, as an item of a list has.
 * @returns {HTMLElement} The note, `.sva-callout`, with `.sva-info` or `.sva-warning`.
 */
export function note({
  kind = 'info',
  say = [],
  busy = false,
  onClose = null,
  tag = 'div',
  className = '',
  role = 'note'
} = {}) {
  const format = NOTE_KINDS.includes(kind) ? kind : 'info';
  const root = el(tag, ['sva-callout', `sva-${format}`, className].filter(Boolean).join(' '));
  root.dataset.kind = format;
  if (role) root.setAttribute('role', role);
  if (busy) {
    const ring = el('span', 'sva-spin');
    ring.setAttribute('aria-hidden', 'true');
    root.append(ring);
  } else root.append(icon(format, 'sva-callout-mark'));
  const sentence = el('p', 'sva-callout-say');
  for (const part of [].concat(say)) {
    if (part === null || part === undefined || part === '') continue;
    sentence.append(typeof part === 'string' ? document.createTextNode(part) : part);
  }
  root.append(sentence);
  if (typeof onClose === 'function') {
    const cross = el('button', 'sva-close', '×');
    cross.type = 'button';
    cross.setAttribute('aria-label', 'Dismiss');
    cross.onclick = onClose;
    root.append(cross);
  }
  return root;
}
