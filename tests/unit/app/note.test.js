// @vitest-environment jsdom
// The app's standard note (#321, obot.roadmap#420): one component for every
// sentence the app sets apart from a view, blue for information and amber for
// something that cannot run until the reader acts.
import { describe, expect, it, vi } from 'vitest';
import { NOTE_KINDS, note } from '../../../src/app/note.js';
import { STYLES } from '../../../src/app/styles.js';

describe('the standard note', () => {
  it('APP-NOTE-001: a note has two formats, information and warning, each with its own mark; its sentence is one paragraph that may hold a button or a link among its words; it has a cross only when it can be closed, and a turning ring in place of the mark while something is under way (#321)', () => {
    expect(NOTE_KINDS).toEqual(['info', 'warning']);

    const info = note({ say: 'The chart is drawn.' });
    expect(info.tagName).toBe('DIV');
    expect(info.className).toBe('sva-callout sva-info');
    expect(info.dataset.kind).toBe('info');
    expect(info.getAttribute('role')).toBe('note');
    // The mark, then the sentence, and nothing else: no cross unless asked.
    expect([...info.children].map((child) => child.tagName.toLowerCase())).toEqual(['svg', 'p']);
    expect(info.querySelector('svg').getAttribute('class')).toBe(
      'sva-ico sva-ico-info sva-callout-mark'
    );
    expect(info.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(info.querySelector('p').className).toBe('sva-callout-say');
    expect(info.textContent).toBe('The chart is drawn.');

    const warning = note({ kind: 'warning', say: 'Nothing is drawn.' });
    expect(warning.className).toBe('sva-callout sva-warning');
    expect(warning.dataset.kind).toBe('warning');
    expect(warning.querySelector('svg').getAttribute('class')).toBe(
      'sva-ico sva-ico-warning sva-callout-mark'
    );
    // The two marks are different drawings, so the formats differ without colour.
    expect(warning.querySelector('svg').innerHTML).not.toBe(info.querySelector('svg').innerHTML);
    // A format the note does not have is information.
    expect(note({ kind: 'constructor', say: 'x' }).className).toBe('sva-callout sva-info');

    // A button and a link among the words, in the order given, inside the paragraph.
    const button = document.createElement('button');
    button.textContent = 'Start R';
    const link = document.createElement('a');
    link.textContent = 'Data';
    const mixed = note({ say: ['Needs R. ', button, ' to add them, or open ', link, '.'] });
    const sentence = mixed.querySelector('p.sva-callout-say');
    expect(sentence.textContent).toBe('Needs R. Start R to add them, or open Data.');
    expect(sentence.querySelector('button')).toBe(button);
    expect(sentence.querySelector('a')).toBe(link);
    expect([...sentence.childNodes].map((node) => node.nodeType)).toEqual([3, 1, 3, 1, 3]);
    // Words are text, never markup; nothing and the empty string are left out.
    const plain = note({ say: ['<b>bold</b>', null, '', undefined] });
    expect(plain.querySelector('b')).toBeNull();
    expect(plain.textContent).toBe('<b>bold</b>');

    // A cross only when the note can be closed, and it calls back.
    const closed = vi.fn();
    const closable = note({ say: 'Read me.', onClose: closed });
    const cross = closable.querySelector('button.sva-close');
    expect(cross.getAttribute('aria-label')).toBe('Dismiss');
    expect(cross.type).toBe('button');
    expect(closable.lastElementChild).toBe(cross);
    cross.click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(warning.querySelector('.sva-close')).toBeNull();

    // Under way: a turning ring where the mark is, hidden from a screen reader.
    const busy = note({ say: 'R is starting.', busy: true });
    expect(busy.querySelector('svg')).toBeNull();
    expect(busy.firstElementChild.className).toBe('sva-spin');
    expect(busy.firstElementChild.getAttribute('aria-hidden')).toBe('true');

    // An item of a list of notes: its own tag and classes, and no role of its own.
    const listed = note({
      kind: 'warning',
      say: 'x',
      tag: 'li',
      className: 'sva-note',
      role: null
    });
    expect(listed.tagName).toBe('LI');
    expect(listed.className).toBe('sva-callout sva-warning sva-note');
    expect(listed.hasAttribute('role')).toBe(false);

    // The colours are the palette's own blue and amber, named once; no note is given the accent.
    expect(STYLES).toContain('--info:#519fdd;');
    expect(STYLES).toContain('--warn:#c78a3b;');
    expect(STYLES).toMatch(/\.sva-callout\{[^}]*border-left:3px solid var\(--info\)/);
    expect(STYLES).toMatch(/\.sva-callout\.sva-warning\{[^}]*border-left-color:var\(--warn\)/);
    expect(STYLES).not.toMatch(/border-left:3px solid var\(--accent\)/);
    expect(STYLES).not.toContain('sva-welcome');
  });
});
