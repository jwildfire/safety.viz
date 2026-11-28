// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as shell from '../../../src/shell.js';
import {
  LADDER_URL,
  STATUS_LABEL_STYLES,
  TIER_MEANINGS,
  TIER_WORDS,
  statusLabel,
  statusLabelHtml,
  wireStatusLabels
} from '../../../src/status-label.js';
import { TIERS } from '../../../src/tiers.js';

// The status label (#273, obot.roadmap#403): the rung's word in a pill whose
// outline tells the rung, one line on hover, and a panel on a click that stays
// open until Escape, the cross or a second click. These tests hold the
// component, which the chart bundle and the docs site's pages carry. They moved
// here from tests/unit/app/ (#436) with their names unchanged; the tests of the
// demo app's own label stay there.

const CHART = {
  tier: 'experimental',
  heading: 'Time-to-Event Explorer is experimental',
  text: ['Experimental until an external clinical review confirms its Kaplan–Meier estimates.'],
  marks: { exploratory: ['This app'], experimental: ['This chart'] }
};
const press = (key) =>
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
const parts = (label) => ({
  pill: label.querySelector('.sv-status-label'),
  panel: label.querySelector('.sv-status-panel'),
  cross: label.querySelector('.sv-status-close')
});

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('the status label', () => {
  it('APP-TIER-007: the label is the rung’s word in a pill with no mark, and the pill’s outline tells the rung: filled for Qualified, solid for Exploratory, dashed for Experimental, dotted and grey for Prototype (#273)', () => {
    expect(TIER_WORDS).toEqual({
      qualified: 'Qualified',
      exploratory: 'Exploratory',
      experimental: 'Experimental',
      prototype: 'Prototype'
    });
    for (const tier of TIERS) {
      const label = statusLabel({ tier, heading: 'A heading' });
      const { pill } = parts(label);
      expect(pill.tagName).toBe('BUTTON');
      expect(pill.type).toBe('button');
      expect(pill.dataset.tier).toBe(tier);
      expect(pill.querySelector('.sv-status-word').textContent).toBe(TIER_WORDS[tier]);
      // The word and its hover line, and nothing drawn: no image, no icon.
      expect([...pill.children].map((child) => child.className)).toEqual([
        'sv-status-word',
        'sv-status-tip'
      ]);
      expect(pill.querySelector('svg, img, canvas')).toBeNull();
    }
    const rule = (selector) =>
      STATUS_LABEL_STYLES.split('\n').find((line) => line.startsWith(`${selector}{`)) || '';
    // Ink on white, a solid ink outline.
    const pill = rule('.sv-status .sv-status-label');
    expect(pill).toContain('color:var(--svs-ink)');
    expect(pill).toContain('background:var(--svs-card)');
    expect(pill).toContain('border:1.5px solid var(--svs-ink)');
    expect(STATUS_LABEL_STYLES).toContain('--svs-ink:#1f2328');
    expect(STATUS_LABEL_STYLES).toContain('--svs-card:#fff');
    expect(rule('.sv-status .sv-status-label[data-tier=qualified]')).toContain(
      'background:var(--svs-ink);color:#fff'
    );
    expect(rule('.sv-status .sv-status-label[data-tier=experimental]')).toContain(
      'border-style:dashed'
    );
    expect(rule('.sv-status .sv-status-label[data-tier=prototype]')).toContain(
      'border-style:dotted;border-color:var(--svs-soft);color:var(--svs-soft)'
    );
    // Exploratory has no rule of its own: it is the solid outline.
    expect(rule('.sv-status .sv-status-label[data-tier=exploratory]')).toBe('');
    // The stylesheet goes into the document once, however many labels are drawn.
    expect(document.querySelectorAll('#sv-status-label-styles')).toHaveLength(1);
    // What is not a rung is drawn as Exploratory.
    expect(parts(statusLabel({ tier: 'stable', heading: 'A heading' })).pill.dataset.tier).toBe(
      'exploratory'
    );
  });

  it('APP-TIER-028: the hover line is kept inside the window as it appears, under the pointer or the keyboard and when the panel closes: moved left when it would run off the right edge, right when off the left, and left alone when it fits; it is moved by the side it hangs from, against the page’s own width (#309)', () => {
    const label = statusLabel(CHART);
    document.body.append(label);
    const { pill, panel } = parts(label);
    const tip = pill.querySelector('.sv-status-tip');
    const width = window.innerWidth;
    let box = { left: width - 100, right: width + 110, width: 210 };
    tip.getBoundingClientRect = () => box;
    // A label hangs its line from its right edge. Off the window's right edge:
    // brought back to 8 pixels inside it.
    pill.dispatchEvent(new Event('mouseenter'));
    expect(tip.style.right).toBe('118px');
    expect(tip.style.transform).toBe('');
    // Off the left edge.
    box = { left: -20, right: 190, width: 210 };
    pill.dispatchEvent(new Event('pointerenter'));
    expect(tip.style.right).toBe('-28px');
    // Inside: where the stylesheet put it.
    box = { left: 40, right: 250, width: 210 };
    pill.dispatchEvent(new Event('focus'));
    expect(tip.style.right).toBe('');
    // Not showing, it has no box, and nothing is done to it.
    box = { left: 0, right: 0, width: 0 };
    pill.dispatchEvent(new Event('mouseenter'));
    expect(tip.style.right).toBe('');
    // The panel closed under the pointer shows the line again: it is placed then too.
    pill.click();
    box = { left: width - 100, right: width + 110, width: 210 };
    pill.click();
    expect(tip.style.right).toBe('118px');
    // The room is the page's own width where the page has one: on a phone the
    // window's inner width grows with what overflows it.
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 393,
      configurable: true
    });
    try {
      box = { left: 184, right: 454, width: 270 };
      pill.dispatchEvent(new Event('mouseenter'));
      expect(tip.style.right).toBe('69px');
      // The panel is placed against the same width, the same way.
      panel.getBoundingClientRect = () => ({ left: 160, right: 536, width: 376 });
      pill.click();
      expect(panel.style.right).toBe('151px');
      expect(panel.style.transform).toBe('');
      pill.click();
      // A label that hangs leftwards, as the docs pages' do, is moved by its left side.
      const docs = statusLabel({ ...CHART, align: 'left' });
      document.body.append(docs);
      const hung = parts(docs);
      const line = hung.pill.querySelector('.sv-status-tip');
      line.getBoundingClientRect = () => ({ left: 184, right: 454, width: 270 });
      hung.pill.dispatchEvent(new Event('mouseenter'));
      expect(line.style.left).toBe('-69px');
      expect(line.style.right).toBe('');
      hung.panel.getBoundingClientRect = () => ({ left: 160, right: 536, width: 376 });
      hung.pill.click();
      expect(hung.panel.style.left).toBe('-151px');
      hung.pill.click();
    } finally {
      delete document.documentElement.clientWidth;
    }
  });

  it('APP-TIER-008: hovering shows one line; a click opens the panel and it stays open; a second click, the cross or Escape closes it, and the pill says which it is (#273)', () => {
    const label = statusLabel(CHART);
    document.body.append(label);
    const { pill, panel, cross } = parts(label);
    // The hover line is the reason, and it is the pill's name for a screen reader.
    expect(pill.querySelector('.sv-status-tip').textContent).toBe(CHART.text[0]);
    expect(pill.querySelector('.sv-status-tip').getAttribute('role')).toBe('tooltip');
    expect(pill.getAttribute('aria-label')).toBe(`Status: Experimental. ${CHART.text[0]}`);
    expect(STATUS_LABEL_STYLES).toContain(
      '.sv-status .sv-status-label:hover .sv-status-tip,.sv-status .sv-status-label:focus-visible .sv-status-tip{display:block}'
    );
    // Closed to begin with.
    expect(panel.hidden).toBe(true);
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(pill.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe(CHART.heading);

    pill.click();
    expect(panel.hidden).toBe(false);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(label.classList.contains('sv-status-open')).toBe(true);
    // It stays open: a click elsewhere on the page does not close it.
    document.body.click();
    expect(panel.hidden).toBe(false);
    // A second click closes it.
    pill.click();
    expect(panel.hidden).toBe(true);
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(label.classList.contains('sv-status-open')).toBe(false);
    // The cross closes it, and hands the keyboard back to the pill.
    pill.click();
    expect(cross.getAttribute('aria-label')).toBe('Close');
    expect(cross.type).toBe('button');
    cross.focus();
    cross.click();
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(pill);
    // Escape closes it; another key does not.
    pill.click();
    press('Enter');
    expect(panel.hidden).toBe(false);
    press('Escape');
    expect(panel.hidden).toBe(true);
    // Escape with nothing open does nothing.
    press('Escape');
    expect(panel.hidden).toBe(true);
    // The handle opens and closes it too.
    label.statusLabel.open();
    expect(label.statusLabel.isOpen()).toBe(true);
    label.statusLabel.close();
    expect(label.statusLabel.isOpen()).toBe(false);
  });

  it('APP-TIER-009: the panel leads with the reason, then lists the four rungs from the top with what each means, the label’s own rung marked, and a link to where the rungs are written out (#273)', () => {
    const label = statusLabel(CHART);
    const { panel } = parts(label);
    const heading = panel.querySelector('[role="heading"]');
    expect(heading.textContent).toBe(CHART.heading);
    expect(heading.getAttribute('aria-level')).toBe('3');
    expect(panel.querySelector('[role="paragraph"]').textContent).toBe(CHART.text[0]);
    const steps = [...panel.querySelectorAll('[role="list"] > [role="listitem"]')];
    expect(steps.map((step) => step.dataset.tier)).toEqual(TIERS);
    expect(steps.map((step) => step.querySelector('.sv-status-rung').textContent)).toEqual([
      'Qualified',
      'Exploratory',
      'Experimental',
      'Prototype'
    ]);
    expect(steps.map((step) => step.querySelector('.sv-status-meaning').textContent)).toEqual([
      'Validated for regulated use. Nothing in safety.viz is, yet.',
      'Tested and documented. Confirm every result.',
      'Tested and documented, but what it shows or how it behaves may still change.',
      'An early look, on the docs site only. Not in this app.'
    ]);
    expect(Object.keys(TIER_MEANINGS)).toEqual(TIERS);
    // The label's own rung is the highlighted one; the app's is marked beside it, more quietly.
    expect(steps.map((step) => step.classList.contains('sv-status-here'))).toEqual([
      false,
      false,
      true,
      false
    ]);
    const marks = steps.map((step) =>
      [...step.querySelectorAll('.sv-status-mark')].map((mark) => [
        mark.textContent,
        mark.classList.contains('sv-status-also')
      ])
    );
    expect(marks).toEqual([[], [['This app', true]], [['This chart', false]], []]);
    const link = panel.querySelector('.sv-status-foot a');
    expect(link.textContent).toBe('What each rung means');
    expect(link.getAttribute('href')).toBe(LADDER_URL);
    expect(LADDER_URL).toContain('developer-guidelines.md#status-ladder');
    // A label given no reason says what its rung means on hover, and has no reason paragraph.
    const bare = statusLabel({ tier: 'prototype', heading: 'A prototype', link: null });
    expect(bare.querySelector('.sv-status-tip').textContent).toBe(TIER_MEANINGS.prototype);
    expect(bare.querySelector('[role="paragraph"]')).toBeNull();
    expect(bare.querySelector('.sv-status-foot')).toBeNull();
  });

  it('APP-TIER-010: opening one label closes another, and each panel has an id of its own (#273)', () => {
    const first = statusLabel({ tier: 'exploratory', heading: 'This app is exploratory' });
    const second = statusLabel(CHART);
    document.body.append(first, second);
    expect(parts(first).panel.id).not.toBe(parts(second).panel.id);
    parts(first).pill.click();
    expect(parts(first).panel.hidden).toBe(false);
    parts(second).pill.click();
    expect(parts(second).panel.hidden).toBe(false);
    expect(parts(first).panel.hidden).toBe(true);
    expect(parts(first).pill.getAttribute('aria-expanded')).toBe('false');
    // One press of Escape closes the one that is open.
    press('Escape');
    expect(parts(second).panel.hidden).toBe(true);
  });

  it('APP-TIER-011: a page written ahead of time carries the same label as markup, wired where it stands: the same parts, the text escaped, and a panel that may stand inside a heading (#273)', () => {
    const drawn = statusLabel({ ...CHART, id: 'panel-a' });
    const html = statusLabelHtml({ ...CHART, id: 'panel-a' });
    // The same markup, as the browser writes it back (a bare attribute comes back with an empty value).
    expect(html.replace(' hidden>', ' hidden="">')).toBe(
      drawn.outerHTML.replace(' data-sv-status-wired="true"', '')
    );
    // Nothing in it is a block element, so a heading may hold it.
    expect(html).not.toMatch(/<(div|p|h\d|ol|ul|li)\b/);
    expect(statusLabelHtml({ tier: 'experimental', heading: 'A <b> & "c"' })).toContain(
      'aria-label="A &lt;b&gt; &amp; &quot;c&quot;"'
    );
    expect(statusLabelHtml({ ...CHART, align: 'left' })).toContain(
      '<span class="sv-status sv-status-left">'
    );
    document.body.innerHTML = `<h1>A chart ${html}</h1><h2>Another ${statusLabelHtml({ ...CHART, id: 'panel-b' })}</h2>`;
    wireStatusLabels();
    // Wiring twice does not wire a label twice: one click still opens it.
    wireStatusLabels();
    const [one, two] = [...document.querySelectorAll('.sv-status')];
    parts(one).pill.click();
    expect(parts(one).panel.hidden).toBe(false);
    parts(two).pill.click();
    expect(parts(one).panel.hidden).toBe(true);
    expect(parts(two).panel.hidden).toBe(false);
    parts(two).cross.click();
    expect(parts(two).panel.hidden).toBe(true);
    // The shared shell hands the label on, with the rest of the charts' chrome.
    expect(shell.statusLabel).toBe(statusLabel);
    expect(shell.statusLabelHtml).toBe(statusLabelHtml);
    expect(shell.wireStatusLabels).toBe(wireStatusLabels);
  });
});
