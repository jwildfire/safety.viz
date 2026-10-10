// The status label (#273, obot.roadmap#403): the one thing that says where a
// chart, a tab or the demo app stands on the status ladder (src/tiers.js). It
// is the rung's word in a pill, ink on white, with no mark: the pill's outline
// tells the rung, filled for Qualified, solid for Exploratory, dashed for
// Experimental, dotted and grey for Prototype. Hovering it shows one line; a
// click or a tap opens a panel that stays open, with the reason and the four
// rungs, the current one marked. Escape, the cross or a second click closes it.
//
// The label is described once, as a tree of plain nodes, and drawn two ways
// from that one description: as elements, for a chart or the app
// (statusLabel), and as markup, for a page written ahead of time, which is
// then wired where it stands (statusLabelHtml, wireStatusLabels). So the docs
// site, the app and a chart drawn alone all show the same label.
import { TIERS } from './tiers.js';

/** Each rung's word, as the label shows it. */
export const TIER_WORDS = {
  qualified: 'Qualified',
  exploratory: 'Exploratory',
  experimental: 'Experimental',
  prototype: 'Prototype'
};

/** What each rung means, in the panel's ladder. */
export const TIER_MEANINGS = {
  qualified: 'Validated for regulated use. Nothing in safety.viz is, yet.',
  exploratory: 'Tested and documented. Confirm every result.',
  experimental: 'Tested and documented, but what it shows or how it behaves may still change.',
  prototype: 'An early look, on the docs site only. Not in this app.'
};

/**
 * The heading of a label's panel: "Time-to-Event Explorer is experimental",
 * "The RBQM tab is experimental", "Patient Journey Explorer is a prototype".
 * @param {string} name What the label is on, as the heading names it.
 * @param {string} tier Its rung.
 * @returns {string} The heading.
 */
export const statusHeading = (name, tier) =>
  `${name} is ${tier === 'prototype' ? 'a prototype' : (TIER_WORDS[tier] || TIER_WORDS.exploratory).toLowerCase()}`;

/** Where the rungs are written out in full: the developer guidelines' status ladder. */
export const LADDER_URL =
  'https://github.com/jwildfire/obot.roadmap/blob/main/docs/developer-guidelines.md#status-ladder';

const STYLE_ID = 'sv-status-label-styles';

// The label carries its own colours, the demo app's ink and plum, so that it
// looks the same on any page; the typefaces are the page's where it names them.
export const STATUS_LABEL_STYLES = `
.sv-status{--svs-ink:#1f2328;--svs-soft:#5b6470;--svs-card:#fff;--svs-rule:#e4e6e3;--svs-line:#cfd3cf;--svs-accent:#6c3270;--svs-accent-deep:#522456;--svs-accent-soft:rgba(108,50,112,.1);--svs-mono:var(--mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);--svs-sans:var(--sans,system-ui,-apple-system,"Segoe UI",sans-serif);--svs-serif:var(--serif,Georgia,"Times New Roman",serif);position:relative;display:inline-flex;align-items:center;vertical-align:middle}
.sv-status *,.sv-status *::before,.sv-status *::after{box-sizing:border-box}
.sv-status [hidden],.sv-status .sv-status-panel[hidden]{display:none}
.sv-status .sv-status-label{position:relative;display:inline-flex;align-items:center;margin:0;font-family:var(--svs-mono);font-size:.6rem;font-weight:500;line-height:1;letter-spacing:.09em;text-transform:uppercase;color:var(--svs-ink);background:var(--svs-card);border:1.5px solid var(--svs-ink);border-radius:999px;padding:.34rem .64rem;cursor:pointer;white-space:nowrap}
.sv-status .sv-status-label[data-tier=qualified]{background:var(--svs-ink);color:#fff}
.sv-status .sv-status-label[data-tier=experimental]{border-style:dashed}
.sv-status .sv-status-label[data-tier=prototype]{border-style:dotted;border-color:var(--svs-soft);color:var(--svs-soft)}
.sv-status .sv-status-label:hover,.sv-status.sv-status-open .sv-status-label{border-color:var(--svs-accent);color:var(--svs-accent)}
.sv-status .sv-status-label[data-tier=qualified]:hover,.sv-status.sv-status-open .sv-status-label[data-tier=qualified]{background:var(--svs-accent);color:#fff}
.sv-status .sv-status-label:focus-visible,.sv-status .sv-status-close:focus-visible,.sv-status .sv-status-panel a:focus-visible{outline:2px solid var(--svs-accent);outline-offset:2px}
.sv-status .sv-status-tip{position:absolute;top:calc(100% + 7px);right:0;z-index:30;display:none;width:max-content;max-width:min(19rem,calc(100vw - 1rem));padding:.42rem .62rem;border-radius:6px;background:var(--svs-ink);color:#fff;font-family:var(--svs-sans);font-size:.74rem;font-weight:400;line-height:1.35;letter-spacing:0;text-transform:none;white-space:normal;text-align:left}
.sv-status .sv-status-label:hover .sv-status-tip,.sv-status .sv-status-label:focus-visible .sv-status-tip{display:block}
.sv-status.sv-status-open .sv-status-label .sv-status-tip{display:none}
.sv-status .sv-status-panel{display:block;position:absolute;top:calc(100% + 8px);right:0;z-index:25;width:23.5rem;max-width:calc(100vw - 1rem);padding:1rem 1.1rem .8rem;background:var(--svs-card);border:1px solid var(--svs-line);border-radius:12px;box-shadow:0 12px 32px rgba(31,35,40,.16);font-family:var(--svs-sans);font-size:.84rem;font-weight:400;line-height:1.45;letter-spacing:0;text-transform:none;white-space:normal;color:var(--svs-ink);text-align:left}
.sv-status.sv-status-left .sv-status-panel,.sv-status.sv-status-left .sv-status-tip{right:auto;left:0}
.sv-status .sv-status-heading{display:block;margin:0 1.6rem .45rem 0;font-family:var(--svs-serif);font-weight:400;font-size:1.25rem;line-height:1.2;letter-spacing:0;text-transform:none;color:var(--svs-ink)}
.sv-status .sv-status-text{display:block;margin:0 0 .6rem}
.sv-status .sv-status-text.sv-status-count{color:var(--svs-soft);font-size:.8rem}
.sv-status .sv-status-text.sv-status-foot{margin:0;font-size:.76rem}
.sv-status .sv-status-panel a{color:var(--svs-accent-deep);text-underline-offset:.2em}
.sv-status .sv-status-close{position:absolute;top:.5rem;right:.55rem;width:1.7rem;height:1.7rem;margin:0;padding:0;border:0;border-radius:50%;background:none;color:var(--svs-soft);font-family:var(--svs-sans);font-size:1.15rem;font-weight:400;line-height:1;cursor:pointer}
.sv-status .sv-status-close:hover{background:var(--svs-accent-soft);color:var(--svs-accent)}
.sv-status .sv-status-ladder{display:block;margin:.7rem 0 .6rem;border-top:1px solid var(--svs-rule)}
.sv-status .sv-status-step{display:block;padding:.5rem;border-bottom:1px solid var(--svs-rule);color:var(--svs-soft)}
.sv-status .sv-status-step.sv-status-here{background:var(--svs-accent-soft);color:var(--svs-ink)}
.sv-status .sv-status-rung{display:inline-block;margin:0 .5rem .12rem 0;font-family:var(--svs-mono);font-size:.62rem;font-weight:500;line-height:1;letter-spacing:.09em;text-transform:uppercase;color:var(--svs-ink);background:var(--svs-card);border:1.5px solid var(--svs-ink);border-radius:999px;padding:.24rem .5rem}
.sv-status .sv-status-rung[data-tier=qualified]{background:var(--svs-ink);color:#fff}
.sv-status .sv-status-rung[data-tier=experimental]{border-style:dashed}
.sv-status .sv-status-rung[data-tier=prototype]{border-style:dotted;border-color:var(--svs-soft);color:var(--svs-soft)}
.sv-status .sv-status-mark{display:inline-block;margin-right:.35rem;font-family:var(--svs-mono);font-size:.54rem;font-weight:500;line-height:1;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--svs-accent);border:1px solid var(--svs-accent);border-radius:999px;padding:.14rem .4rem}
.sv-status .sv-status-mark.sv-status-also{background:none;color:var(--svs-accent)}
.sv-status .sv-status-meaning{display:block;margin-top:.22rem;font-size:.8rem}
`;

/**
 * Put the label's stylesheet in the document, once.
 * @param {Document} [doc] The document.
 * @returns {void}
 */
export function applyStatusLabelStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STATUS_LABEL_STYLES;
  doc.head.append(style);
}

const node = (tag, attrs, children = []) => ({ tag, attrs, children: [].concat(children) });
// The panel's blocks are spans with the block's role, drawn as blocks: a label
// may stand inside a heading, where a paragraph or a list may not.
const block = (className, children) =>
  node('span', { class: className, role: 'paragraph' }, children);
let drawn = 0;

/**
 * The label and its panel, described as a tree of plain nodes: a tag, its
 * attributes, and its children, each a node or a string of text.
 * @param {Object} options What the label says.
 * @param {string} options.tier The rung: one of TIERS.
 * @param {string} options.heading The panel's heading, as "This app is exploratory".
 * @param {string} [options.line] The one line shown on hover; by default the first of `text`, or what the rung means.
 * @param {string[]} [options.text] The panel's opening sentences, one paragraph each: the disclaimer, or a chart's reason.
 * @param {string} [options.count] A quieter line after them, as how many charts stand on each rung.
 * @param {Object<string, string[]>} [options.marks] What stands on a rung, keyed by rung: `{ exploratory: ['This app'] }`. The label's own rung is highlighted, and its first mark is filled.
 * @param {Object<string, string>} [options.meanings] What each rung means; by default TIER_MEANINGS.
 * @param {?string} [options.link] Where "What each rung means" leads; none when null.
 * @param {'right'|'left'} [options.align] The side of the label the panel hangs from.
 * @param {string} [options.id] An id for the panel, unique on the page.
 * @returns {{tag: string, attrs: Object, children: Array}} The tree.
 */
export function statusLabelTree({
  tier,
  heading,
  line,
  text = [],
  count = '',
  marks = {},
  meanings = TIER_MEANINGS,
  link = LADDER_URL,
  align = 'right',
  id = 'sv-status-panel'
}) {
  const rung = TIERS.includes(tier) ? tier : 'exploratory';
  const word = TIER_WORDS[rung];
  const paragraphs = text.filter(Boolean);
  const said = line || paragraphs[0] || meanings[rung];
  const ladder = TIERS.map((step) => {
    const here = step === rung;
    const step_ = `sv-status-step${here ? ' sv-status-here' : ''}`;
    return node('span', { class: step_, role: 'listitem', 'data-tier': step }, [
      node('span', { class: 'sv-status-rung', 'data-tier': step }, TIER_WORDS[step]),
      ...(marks[step] || []).map((mark) =>
        node('span', { class: `sv-status-mark${here ? '' : ' sv-status-also'}` }, mark)
      ),
      node('span', { class: 'sv-status-meaning' }, meanings[step])
    ]);
  });
  return node('span', { class: `sv-status${align === 'left' ? ' sv-status-left' : ''}` }, [
    node(
      'button',
      {
        type: 'button',
        class: 'sv-status-label',
        'data-tier': rung,
        'aria-label': `Status: ${word}. ${said}`,
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-controls': id
      },
      [
        node('span', { class: 'sv-status-word' }, word),
        node('span', { class: 'sv-status-tip', role: 'tooltip' }, said)
      ]
    ),
    node(
      'span',
      { class: 'sv-status-panel', role: 'dialog', 'aria-label': heading, id, hidden: '' },
      [
        node('button', { type: 'button', class: 'sv-status-close', 'aria-label': 'Close' }, '×'),
        node('span', { class: 'sv-status-heading', role: 'heading', 'aria-level': '3' }, heading),
        ...paragraphs.map((paragraph) => block('sv-status-text', paragraph)),
        ...(count ? [block('sv-status-text sv-status-count', count)] : []),
        node('span', { class: 'sv-status-ladder', role: 'list' }, ladder),
        ...(link
          ? [
              block('sv-status-text sv-status-foot', [
                node('a', { href: link, target: '_blank', rel: 'noopener' }, 'What each rung means')
              ])
            ]
          : [])
      ]
    )
  ]);
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function toDom(tree, doc) {
  const element = doc.createElement(tree.tag);
  for (const [name, value] of Object.entries(tree.attrs)) {
    element.setAttribute(name, value);
  }
  for (const child of tree.children) {
    element.append(typeof child === 'string' ? doc.createTextNode(child) : toDom(child, doc));
  }
  return element;
}

function toHtml(tree) {
  const attrs = Object.entries(tree.attrs)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`))
    .join('');
  const inner = tree.children
    .map((child) => (typeof child === 'string' ? escapeHtml(child) : toHtml(child)))
    .join('');
  return `<${tree.tag}${attrs}>${inner}</${tree.tag}>`;
}

/**
 * Wire a label that is already on the page: a click on the pill opens its
 * panel and a second closes it; the cross and Escape close it; and opening one
 * label closes any other that is open.
 * @param {Element} root The label's outer element, `.sv-status`.
 * @returns {{open: function(): void, close: function(): void, isOpen: function(): boolean}} The label's handle.
 */
export function wireStatusLabel(root) {
  const doc = root.ownerDocument;
  const button = root.querySelector('.sv-status-label');
  const panel = root.querySelector('.sv-status-panel');
  const cross = root.querySelector('.sv-status-close');
  const tip = root.querySelector('.sv-status-tip');
  // Keep the open panel, and the hover line, inside the window, whichever side
  // they hang from.
  // The room is the page's own width: on a phone the window's inner width
  // grows with whatever overflows, and with a classic scrollbar it counts the
  // bar, so either would let the element stay over the edge (#309). The
  // element is moved by the side it hangs from, not by a transform: a phone
  // sizes its page by where an element is laid out, wherever it is drawn.
  const keepInside = (element) => {
    const side = root.classList.contains('sv-status-left') ? 'left' : 'right';
    element.style.removeProperty(side);
    const view = doc.defaultView;
    const width =
      (doc.documentElement && doc.documentElement.clientWidth) || (view && view.innerWidth) || 0;
    const box = element.getBoundingClientRect();
    if (!width || !box.width) return;
    const edge = 8;
    let shift = 0;
    if (box.left < edge) shift = edge - box.left;
    else if (box.right > width - edge) shift = width - edge - box.right;
    if (shift) element.style[side] = `${Math.round(side === 'left' ? shift : -shift)}px`;
  };
  const place = () => keepInside(panel);
  // The line shows on hover and on keyboard focus, by the stylesheet alone; it
  // is placed as it appears (#309). A label on the right of a page that hangs
  // its line rightwards would otherwise run off the window and widen the page.
  const placeTip = () => {
    if (tip) keepInside(tip);
  };
  const isOpen = () => !panel.hidden;
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    set(false, { focus: root.contains(doc.activeElement) });
  };
  const onOther = (event) => {
    if (event.detail !== root) set(false);
  };
  function set(open, { focus = false } = {}) {
    if (open === isOpen()) return;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    root.classList.toggle('sv-status-open', open);
    // Closed under a pointer or with the keyboard, the line shows again.
    if (!open) placeTip();
    if (open) {
      place();
      doc.addEventListener('keydown', onKey);
      doc.addEventListener('sv-status-open', onOther);
      doc.dispatchEvent(new CustomEvent('sv-status-open', { detail: root }));
    } else {
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('sv-status-open', onOther);
      if (focus) button.focus();
    }
  }
  button.addEventListener('click', () => set(!isOpen()));
  cross.addEventListener('click', () => set(false, { focus: true }));
  for (const shown of ['pointerenter', 'mouseenter', 'focus']) {
    button.addEventListener(shown, placeTip);
  }
  return { open: () => set(true), close: () => set(false), isOpen };
}

/**
 * Wire every label written into a page ahead of time.
 * @param {Document|Element} [within] Where to look.
 * @returns {void}
 */
export function wireStatusLabels(within = document) {
  for (const root of within.querySelectorAll('.sv-status')) {
    if (root.dataset.svStatusWired) continue;
    root.dataset.svStatusWired = 'true';
    wireStatusLabel(root);
  }
}

/**
 * Draw a status label: the pill and, closed, its panel.
 * @param {Object} options What the label says: see {@link statusLabelTree}.
 * @returns {HTMLElement} The label, `.sv-status`, wired; its `statusLabel` property is its handle (open, close, isOpen).
 */
export function statusLabel(options) {
  drawn += 1;
  applyStatusLabelStyles(document);
  const root = toDom(statusLabelTree({ id: `sv-status-panel-${drawn}`, ...options }), document);
  root.dataset.svStatusWired = 'true';
  root.statusLabel = wireStatusLabel(root);
  return root;
}

/**
 * A status label as markup, for a page written ahead of time: the same label.
 * The page carries STATUS_LABEL_STYLES and calls wireStatusLabels once it has loaded.
 * @param {Object} options What the label says: see {@link statusLabelTree}.
 * @returns {string} The markup.
 */
export function statusLabelHtml(options) {
  return toHtml(statusLabelTree(options));
}
