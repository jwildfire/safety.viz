// Demo app: the small marks the RBQM tab uses (#279, obot.roadmap#405). A
// metric's state where a chart has its hex: a filled hex with a tick for one
// that ran, an outlined hex with a bar for one that did not, a dashed hex for
// one not started and a turning ring for one that is running. And the marks
// of the key to the site overview's flags, in the shapes gsm.viz draws.
//
// Each is drawn as elements, never from a string of markup, and is hidden from
// a screen reader: what it says is said in words beside it.

const SVG = 'http://www.w3.org/2000/svg';
const HEX = 'M8 1.6l5.4 3.2v6.4L8 14.4l-5.4-3.2V4.8z';
const line = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round' };

const SHAPES = {
  ran: [
    ['path', { d: 'M8 1l6 3.5v7L8 15l-6-3.5v-7z', fill: 'currentColor' }],
    [
      'path',
      {
        d: 'M5 8.2l2.1 2.1L11 6.3',
        fill: 'none',
        stroke: '#fff',
        'stroke-width': '1.7',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }
    ]
  ],
  cannot: [
    ['path', { d: HEX, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4' }],
    ['path', { d: 'M5.3 8h5.4', ...line, 'stroke-width': '1.6' }]
  ],
  todo: [
    [
      'path',
      {
        d: HEX,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.3',
        'stroke-dasharray': '2 1.7'
      }
    ]
  ],
  running: [
    ['circle', { cx: '8', cy: '8', r: '6', ...line, 'stroke-width': '1.6', opacity: '.25' }],
    ['path', { d: 'M8 2a6 6 0 0 1 6 6', ...line, 'stroke-width': '1.8' }]
  ],
  'flag-ok': [
    ['path', { d: 'M3 8.6l3.2 3.2L13 5', ...line, 'stroke-width': '2', 'stroke-linejoin': 'round' }]
  ],
  'flag-one': [
    [
      'path',
      { d: 'M3.5 10.2L8 5.7l4.5 4.5', ...line, 'stroke-width': '2', 'stroke-linejoin': 'round' }
    ]
  ],
  'flag-two': [
    [
      'path',
      {
        d: 'M3.5 8L8 3.5 12.5 8M3.5 13L8 8.5l4.5 4.5',
        ...line,
        'stroke-width': '2',
        'stroke-linejoin': 'round'
      }
    ]
  ],
  'flag-none': [['path', { d: 'M4.5 8h7', ...line, 'stroke-width': '1.6' }]]
};

/** The names of the marks. */
export const ICONS = Object.keys(SHAPES);

/**
 * One mark, as an SVG element.
 * @param {string} name One of ICONS.
 * @param {string} [className] A class beside `sva-ico` and `sva-ico-<name>`.
 * @returns {SVGElement} The mark, hidden from a screen reader.
 */
export function icon(name, className = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', ['sva-ico', `sva-ico-${name}`, className].filter(Boolean).join(' '));
  // Only a mark of this file's own (#309): "constructor" is a name every object has.
  for (const [tag, attributes] of Object.prototype.hasOwnProperty.call(SHAPES, name)
    ? SHAPES[name]
    : []) {
    const shape = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}
