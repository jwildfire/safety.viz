// @vitest-environment jsdom
// The small marks of the RBQM tab (#279, obot.roadmap#405): a metric's state
// where a chart has its hex, and the key to the site overview's flags.
import { describe, expect, it } from 'vitest';
import { ICONS, icon } from '../../../src/app/icons.js';

const SVG = 'http://www.w3.org/2000/svg';

describe('the marks of the RBQM tab', () => {
  it('APP-RBQM-067: there is a mark for each state of a metric and for each flag of the site overview, and each is a small SVG drawn as elements, hidden from a screen reader and out of the keyboard’s way, with a class that names it (#279)', () => {
    expect(ICONS).toEqual([
      'ran',
      'cannot',
      'todo',
      'running',
      'flag-ok',
      'flag-one',
      'flag-two',
      'flag-none'
    ]);
    for (const name of ICONS) {
      const mark = icon(name);
      expect(mark.namespaceURI, name).toBe(SVG);
      expect(mark.tagName).toBe('svg');
      expect(mark.getAttribute('aria-hidden')).toBe('true');
      expect(mark.getAttribute('focusable')).toBe('false');
      expect(mark.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(mark.getAttribute('class')).toBe(`sva-ico sva-ico-${name}`);
      // It says nothing itself: what it means is said in words beside it.
      expect(mark.textContent).toBe('');
      expect(mark.hasAttribute('aria-label')).toBe(false);
      expect(mark.querySelector('title')).toBeNull();
      // Shapes, each an element of its own.
      expect(mark.children.length).toBeGreaterThan(0);
      for (const shape of mark.children) {
        expect(shape.namespaceURI).toBe(SVG);
        expect(['path', 'circle']).toContain(shape.tagName);
      }
    }
    // Each call draws a mark of its own, and no two marks are the same drawing.
    expect(icon('ran')).not.toBe(icon('ran'));
    expect(new Set(ICONS.map((name) => icon(name).innerHTML)).size).toBe(ICONS.length);
  });

  it('APP-RBQM-067: the four states are told apart by shape, not by colour alone: a filled hex with a tick for ran, an outlined hex with a bar for did not run, a dashed hex for not started and an open ring for running (#279)', () => {
    const shapes = (name) =>
      [...icon(name).children].map((shape) => ({
        tag: shape.tagName,
        fill: shape.getAttribute('fill'),
        dashed: shape.hasAttribute('stroke-dasharray')
      }));
    expect(shapes('ran')).toEqual([
      { tag: 'path', fill: 'currentColor', dashed: false },
      { tag: 'path', fill: 'none', dashed: false }
    ]);
    expect(shapes('cannot')).toEqual([
      { tag: 'path', fill: 'none', dashed: false },
      { tag: 'path', fill: 'none', dashed: false }
    ]);
    expect(shapes('todo')).toEqual([{ tag: 'path', fill: 'none', dashed: true }]);
    expect(shapes('running')).toEqual([
      { tag: 'circle', fill: 'none', dashed: false },
      { tag: 'path', fill: 'none', dashed: false }
    ]);
    // The hex of did not run and of not started is the same outline.
    const outline = (name) => icon(name).children[0].getAttribute('d');
    expect(outline('cannot')).toBe(outline('todo'));
    // Every outlined shape takes the colour of the words beside it.
    for (const name of ICONS) {
      for (const shape of icon(name).children) {
        if (shape.getAttribute('fill') === 'none' && name !== 'ran') {
          expect(shape.getAttribute('stroke'), name).toBe('currentColor');
        }
      }
    }
  });

  it('APP-RBQM-067: a class given with the name is kept beside the mark’s own, and a name that is no mark’s draws an empty mark, still hidden, and does not throw (#279)', () => {
    expect(icon('flag-two', 'sva-flag-red').getAttribute('class')).toBe(
      'sva-ico sva-ico-flag-two sva-flag-red'
    );
    expect(icon('ran', '').getAttribute('class')).toBe('sva-ico sva-ico-ran');
    const unknown = icon('no-such-mark');
    expect(unknown.tagName).toBe('svg');
    expect(unknown.children).toHaveLength(0);
    expect(unknown.getAttribute('aria-hidden')).toBe('true');
    expect(unknown.getAttribute('class')).toBe('sva-ico sva-ico-no-such-mark');
  });
});
