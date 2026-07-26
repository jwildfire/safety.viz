// The migration (Sankey) view of the hep-explorer module (obot.roadmap#43,
// safety.viz#92): Figure 3 of Amirzadegan et al., "Emerging Tools to Support
// DILI Assessment in Clinical Trials with Abnormal Baseline Serum Liver Tests
// or Pre-existing Liver Diseases", Drug Safety 2025;48(5):443-453.
//
// A Sankey MIRRORED ABOUT A PINNED CENTRE COLUMN holding every participant's
// BASELINE eDISH quadrant: placebo flows run left, active-drug flows run right,
// ribbon thickness is participant count, and nodes stack by severity with Hy's
// Law at the top so an unfavourable shift reads as upward travel. Beside it,
// one cross table per arm — rows = baseline quadrant, columns = peak
// on-treatment quadrant, cells shaded by level of DILI concern — exactly the
// counts the paper prints under each panel.
//
// WHY THIS IS A VIEW AND NOT A MODULE. The paper frames "Sankey then composite"
// as a deliberate TWO-STEP replacement for the single eDISH plot: the Sankey
// delivers eDISH functions (a) visualise shift between arms and (b) categorise
// by severity, but NOT (c) identify individual participants for case review —
// which the already-shipped composite view (Fig 4) supplies. So selecting a
// ribbon offers to carry exactly those participants into the composite plot,
// highlighted. That hand-off IS the paper's argument made executable, and it
// only exists because both figures are views of one renderer over one cohort.
//
// PAINTING ONLY. Every coordinate comes from ../sankeyLayout.js, which is pure,
// DOM-free and unit-tested; this file turns numbers into SVG, tables, notes and
// events. Rendering is hand-rolled inline SVG via document.createElementNS —
// the established house idiom (src/ae-explorer.js, src/ae-timelines.js)
// — so ribbons are real focusable DOM nodes with data attributes rather than
// canvas pixels, and no charting dependency is added.
//
// Implements the same view contract as every other file in this directory (see
// the contract block at the top of views/scatter.js). Views are SIBLINGS: this
// file must not import another file in views/ — pinned by
// tests/unit/hep-explorer/views-isolation.test.js.
//
// Requirement groups: HEP-MIG-001..016, HEP-XTAB-001..006, HEP-STEP-001..005,
// HEP-ARM-004..008, HEP-ACC-001..003, HEP-DATA-012.

import { createElement, prototypeBanner } from '../../shell.js';
import {
  CONCERN_COLORS,
  QUADRANT_STYLE,
  SEVERITY_ORDER,
  concernOf
} from '../../hep-core/quadrants.js';
import { resolveArmDesignation } from '../../hep-core/arms.js';
import { buildHepSubjects } from '../../hep-core/subjects.js';
import { migrationCells, migrationMatrixBySide } from '../../hep-core/migration.js';
import { SANKEY_HEIGHT, SANKEY_WIDTH, layoutSankey, sankeyColumns } from '../sankeyLayout.js';
import { applyFilters, unique } from '../structureData.js';
import { hexToRgba } from '../getPlugins.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The two Sankey sides, in left-to-right order. @private */
const SIDES = ['placebo', 'active'];

/** Reader-facing name of each side, used in labels, captions and notes. @private */
const SIDE_LABEL = { placebo: 'placebo', active: 'active drug' };

/** Title case of SIDE_LABEL for table captions and column headers. @private */
const SIDE_TITLE = { placebo: 'Placebo', active: 'Active drug' };

/**
 * How each level of DILI concern reads out loud, for ribbon accessible names
 * and the hand-off sentence (HEP-ACC-001). Sourced from CONCERN_MATRIX, never
 * from the sign of the ribbon's vertical travel — the same governing rule that
 * decides its colour.
 * @private
 */
const CONCERN_PHRASE = {
  red: 'unfavourable',
  yellow: 'lateral (single-analyte)',
  green: 'favourable',
  gray: 'no migration'
};

/**
 * One label per severity tier, drawn once in the left margin beside the band it
 * names. The middle band is deliberately ONE label over TWO sub-nodes: the
 * concern matrix declines to rank Cholestasis against Temple's Corollary, so
 * they share a tier and the picture must say so (HEP-MIG-004).
 * @private
 */
const TIER_LABELS = ['Both elevated', 'Single-analyte elevation', 'Neither elevated'];

/**
 * Margins around the fixed 980x540 layout box. The layout's own coordinates are
 * never touched — the whole diagram is translated into this frame — so the
 * mirror symmetry sankeyLayout guarantees survives labelling.
 * @private
 */
const MARGIN = { left: 132, right: 44, top: 46, bottom: 16 };

const OUTER_WIDTH = MARGIN.left + SANKEY_WIDTH + MARGIN.right;
const OUTER_HEIGHT = MARGIN.top + SANKEY_HEIGHT + MARGIN.bottom;

/**
 * Create an SVG element with attributes; the house two-line helper (as in
 * src/ae-explorer.js), kept local so views stay siblings.
 * @private
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  });
  return el;
}

/** "1 participant" / "N participants". @private */
function participantCount(count) {
  return `${count} participant${count === 1 ? '' : 's'}`;
}

/**
 * The arm designation actually in force: the settings' designation, overridden
 * by the view's Active arm control when the reviewer has narrowed it
 * (HEP-ARM-003). Returned as the full detail object so the ambiguity warning
 * survives to the notes (HEP-ARM-002).
 * @private
 */
function designationFor(host, arms) {
  const activeArms = host.state.activeArms;
  return resolveArmDesignation(arms, { ...host.settings, active_arms: activeArms });
}

/**
 * The cohort this view plots: every participant with a usable baseline and
 * on-treatment ALT + total bilirubin, narrowed by the shared categorical
 * filters, then narrowed AGAIN to the arms designated placebo or active
 * (HEP-ARM-004). Participants dropped by each step are counted separately —
 * a missing baseline (HEP-DATA-012) and an undesignated arm are different
 * failures and the reader is told which one applies.
 * @private
 */
function buildCohort(host) {
  const built = buildHepSubjects(host.cleanRows, host.settings);
  const shown = applyFilters(built.subjects, host.state.filters);
  const designation = designationFor(host, built.arms);
  const sides = designation.sides;
  const plotted = shown.filter((subject) => SIDES.includes(sides.get(subject.arm)));
  const cells = migrationCells(plotted, sides);
  return {
    arms: built.arms,
    armCol: built.armCol,
    excludedNoData: built.excluded,
    designation,
    sides,
    shown,
    plotted,
    armExcluded: shown.length - plotted.length,
    cells,
    matrices: migrationMatrixBySide(plotted, sides)
  };
}

/**
 * Per-side shift tallies for the diagram's accessible summary (HEP-ACC-003) and
 * the notes: how many participants moved to a more severe category, how many to
 * a less severe one, and how many did not migrate.
 * @private
 */
function shiftSummary(cells) {
  const summary = {
    placebo: { up: 0, down: 0, lateral: 0, diagonal: 0, total: 0 },
    active: { up: 0, down: 0, lateral: 0, diagonal: 0, total: 0 }
  };
  cells.forEach((cell) => {
    const bucket = summary[cell.side];
    if (!bucket) return;
    const count = cell.ids.length;
    const concern = concernOf(cell.pre, cell.post);
    if (concern === 'red') bucket.up += count;
    else if (concern === 'green') bucket.down += count;
    else bucket.lateral += count;
    // The Hide unchanged control suppresses the DIAGONAL specifically, which is
    // narrower than "not up and not down": a lateral CH<->TC flow is a real
    // migration and stays drawn (HEP-MIG-013).
    if (cell.pre === cell.post) bucket.diagonal += count;
    bucket.total += count;
  });
  return summary;
}

/**
 * The accessible name of the whole diagram: what each arm did, in counts
 * (HEP-ACC-003). A screen reader gets the comparison the picture exists to
 * make without having to trace ribbons.
 * @private
 */
function sankeyLabel(summary) {
  const arm = (side) =>
    `${SIDE_TITLE[side]}: ${summary[side].up} unfavourable and ${summary[side].down} favourable ` +
    `shifts among ${participantCount(summary[side].total)}`;
  return (
    'Baseline to peak on-treatment migration Sankey. Baseline categorization in the centre, ' +
    `placebo flows left, active drug flows right. ${arm('placebo')}. ${arm('active')}.`
  );
}

/**
 * The accessible name of one ribbon (HEP-ACC-001): its count, both quadrants,
 * its arm, and the level of concern the FDA matrix assigns the migration — the
 * four facts a reviewer needs before deciding whether to open the cases.
 * @private
 */
function ribbonLabel(ribbon) {
  const verb = ribbon.pre === ribbon.post ? 'remained in' : 'shifted from';
  const where = ribbon.pre === ribbon.post ? `${ribbon.pre}` : `${ribbon.pre} to ${ribbon.post}`;
  return (
    `${participantCount(ribbon.count)} ${verb} ${where} on ${SIDE_LABEL[ribbon.side]} — ` +
    `${CONCERN_PHRASE[ribbon.concern]}`
  );
}

/**
 * The tooltip body for a ribbon: the same facts as the accessible name, laid
 * out for the eye. An absolutely-positioned HTML div, NOT an svg <title> —
 * native tooltips never appear in a screenshot, so a <title> could not be
 * evidenced.
 * @private
 */
function ribbonTip(ribbon) {
  return (
    `${SIDE_TITLE[ribbon.side]} · ${participantCount(ribbon.count)}\n` +
    `${ribbon.pre} → ${ribbon.post}\n` +
    `${CONCERN_PHRASE[ribbon.concern]}`
  );
}

/**
 * Show the ribbon tooltip beside the pointer, clamped inside the plot so it can
 * never push the page sideways.
 * @private
 */
function showTip(host, event, text) {
  const tip = host.migrationTipEl;
  if (!tip) return;
  tip.textContent = text;
  tip.classList.add('is-visible');
  const bounds = host.migrationWrap.getBoundingClientRect();
  const x = (event.clientX ?? bounds.left) - bounds.left;
  const y = (event.clientY ?? bounds.top) - bounds.top;
  tip.style.left = `${Math.max(0, Math.min(x + 14, bounds.width - 40))}px`;
  tip.style.top = `${Math.max(0, y + 14)}px`;
}

/** Hide the ribbon tooltip. @private */
function hideTip(host) {
  if (host.migrationTipEl) host.migrationTipEl.classList.remove('is-visible');
}

/**
 * Restyle the diagram to the current hover and selection (the view contract's
 * highlight): the hovered/selected ribbons and their two endpoint nodes gain a
 * class, everything else dims once anything is active, and the shared trace
 * header reports the selection.
 * @private
 */
function refreshHighlight(host) {
  const svg = host.migrationSvgEl;
  if (svg) {
    const activeKey = host.migrationHoverKey || host.migrationSelectedKey;
    const nodes = new Set();
    svg.querySelectorAll('.hep-ribbon').forEach((path) => {
      const isActive = path.dataset.key === activeKey;
      const isSelected = path.dataset.key === host.migrationSelectedKey;
      path.classList.toggle('is-active', isActive);
      path.classList.toggle('is-selected', isSelected);
      path.classList.toggle('is-dim', Boolean(activeKey) && !isActive);
      if (isActive) {
        nodes.add(path.dataset.centreNode);
        nodes.add(path.dataset.outerNode);
      }
    });
    svg.querySelectorAll('.hep-sankey-node').forEach((rect) => {
      rect.classList.toggle('is-active', nodes.has(rect.dataset.node));
    });
  }
  if (host.migrationWrap) {
    host.migrationWrap.querySelectorAll('.hep-xtab-cell').forEach((cell) => {
      cell.classList.toggle('is-selected', cell.dataset.key === host.migrationSelectedKey);
    });
  }
  host.selection.updateTraceHeader(null, host.migrationSelectedIds);
}

/**
 * THE TWO-STEP HAND-OFF (HEP-STEP-002, HEP-STEP-003). With a flow selected the
 * footnote states the shift, its arm and its participant count, and offers a
 * control that switches to the composite plot carrying exactly those
 * participants — eDISH function (c), identify individuals for case review,
 * delivered by Figure 4 at the moment Figure 3 raises the question.
 * @private
 */
function renderFootnote(host) {
  const footnote = host.footnote;
  footnote.textContent = '';
  const cell = host.migrationSelectedKey
    ? host.migrationCellIndex.get(host.migrationSelectedKey)
    : null;

  if (!cell) {
    footnote.textContent =
      'Migration plot (Amirzadegan et al., Drug Safety 2025, Fig 3): baseline eDISH categorization ' +
      'in the centre, peak on-treatment shifts running left for placebo and right for active drug. ' +
      'Ribbon thickness is participant count on one shared scale; upward shifts are unfavourable ' +
      '(pink) and downward shifts favourable (green). Select a ribbon or a cross-table cell to ' +
      'carry those participants into the composite plot.';
    return;
  }

  const count = cell.ids.length;
  const block = createElement('div', 'hep-step');
  const move =
    cell.pre === cell.post ? `remained in ${cell.pre}` : `shifted ${cell.pre} → ${cell.post}`;
  block.append(
    createElement(
      'strong',
      'hep-step-text',
      `${participantCount(count)} ${move} on ${SIDE_LABEL[cell.side]}.`
    )
  );
  const button = createElement(
    'button',
    'hep-step-btn',
    `Review these ${count} in the composite plot`
  );
  button.type = 'button';
  button.onclick = () => host.switchView('composite');
  block.append(button);
  footnote.append(block);
}

/**
 * Select one migration cell — the single path BOTH interactions take, so a
 * ribbon click and a cross-table cell click are identical by construction
 * rather than by coincidence (HEP-XTAB-005). Participants are handed to the
 * shared selection layer (HEP-STEP-001); no parallel selection mechanism
 * exists in this view.
 * @private
 */
function selectCell(host, key) {
  const cell = host.migrationCellIndex.get(key);
  if (!cell) return;
  host.migrationSelectedKey = key;
  host.migrationSelectedIds = cell.ids.map(String);
  host.selection.sync(host.migrationSelectedIds);
  refreshHighlight(host);
  renderFootnote(host);
  host.selection.dispatch([...host.migrationSelectedIds]);
}

/**
 * Select an explicit participant list with no owning cell — the Participants
 * dropdown, the carried selection, and the Hy's-Law caution's review button.
 * @private
 */
function setSelection(host, ids) {
  host.migrationSelectedIds = ids.map(String);
  const key = host.migrationSelectedKey;
  const cell = key ? host.migrationCellIndex.get(key) : null;
  // A cell stays selected only while the selection is still exactly its
  // participants; otherwise the hand-off would offer to review a set the
  // reviewer has since edited.
  if (
    !cell ||
    cell.ids.length !== host.migrationSelectedIds.length ||
    cell.ids.some((id, index) => String(id) !== host.migrationSelectedIds[index])
  ) {
    host.migrationSelectedKey = null;
  }
  host.selection.sync(host.migrationSelectedIds);
  refreshHighlight(host);
  renderFootnote(host);
  host.selection.dispatch([...host.migrationSelectedIds]);
}

/** Drop the whole selection (the shared Clear selection gesture). @private */
function clearSelection(host) {
  if (!host.migrationSelectedIds.length && !host.migrationSelectedKey) return;
  host.migrationSelectedKey = null;
  host.migrationSelectedIds = [];
  host.selection.sync([]);
  refreshHighlight(host);
  renderFootnote(host);
  host.selection.dispatch([]);
}

/**
 * Draw the faint full-width band behind each severity tier, plus that tier's
 * single label in the left margin (HEP-MIG-004). The bands are what make "up =
 * worse" readable without reading any label at all.
 * @private
 */
function paintTiers(group, nodes) {
  const bands = new Map();
  nodes.forEach((node) => {
    const band = bands.get(node.tier) || { y0: Infinity, y1: -Infinity };
    band.y0 = Math.min(band.y0, node.y0);
    band.y1 = Math.max(band.y1, node.y1);
    bands.set(node.tier, band);
  });
  [...bands.keys()]
    .sort((a, b) => a - b)
    .forEach((tier) => {
      const band = bands.get(tier);
      group.append(
        svgEl('rect', {
          class: 'hep-sankey-tier',
          'data-tier': tier,
          x: 0,
          y: band.y0 - 6,
          width: SANKEY_WIDTH,
          height: band.y1 - band.y0 + 12,
          rx: 6
        })
      );
      const label = svgEl('text', {
        class: 'hep-sankey-tier-label',
        'data-tier': tier,
        x: -10,
        y: (band.y0 + band.y1) / 2,
        'text-anchor': 'end',
        'dominant-baseline': 'middle'
      });
      label.textContent = TIER_LABELS[tier] || `Tier ${tier}`;
      group.append(label);
    });
}

/**
 * Draw the twelve node rectangles and their labels. Fills come from
 * QUADRANT_STYLE — the SAME hexes as the composite view's markers — so a
 * quadrant means the same colour in Figure 3 and Figure 4, which is what makes
 * the hand-off legible (HEP-MIG-010). Every label carries the quadrant name and
 * that column's per-arm counts, so geometry never carries the message alone
 * (HEP-MIG-011).
 * @private
 */
function paintNodes(group, nodes) {
  const columns = sankeyColumns();
  nodes.forEach((node) => {
    const style = QUADRANT_STYLE[node.quadrant];
    group.append(
      svgEl('rect', {
        class: `hep-sankey-node${node.stub ? ' is-stub' : ''}`,
        'data-node': node.id,
        'data-column': node.column,
        'data-quadrant': node.quadrant,
        'data-count': node.count,
        'data-placebo': node.counts.placebo,
        'data-active': node.counts.active,
        x: node.x0,
        y: node.y0,
        width: node.x1 - node.x0,
        height: node.height,
        fill: style.color,
        rx: 2
      })
    );

    const centred = node.column === 'centre';
    const counts = centred ? `${node.counts.placebo} / ${node.counts.active}` : String(node.count);
    const text = svgEl('text', {
      class: `hep-sankey-node-label${node.stub ? ' is-stub' : ''}${centred ? ' is-centre' : ''}`,
      'data-node': node.id,
      x: centred
        ? (columns.centre[0] + columns.centre[1]) / 2
        : node.column === 'left'
          ? node.x1 + 8
          : node.x0 - 8,
      y: (node.y0 + node.y1) / 2,
      'text-anchor': centred ? 'middle' : node.column === 'left' ? 'start' : 'end',
      'dominant-baseline': 'middle'
    });
    text.textContent = `${node.quadrant} ${counts}`;
    group.append(text);
  });
}

/**
 * Draw the ribbons, thickest first so a thin flow lands on top and stays
 * clickable. Each ribbon is ONE <path> carrying its cell key and facts as data
 * attributes, focusable and role="button" — so Playwright (and a keyboard) can
 * address a flow without touching a pixel (HEP-ACC-001, HEP-ACC-002).
 * @private
 */
function paintRibbons(host, group, ribbons) {
  ribbons.forEach((ribbon) => {
    const path = svgEl('path', {
      class: `hep-ribbon is-${ribbon.direction}`,
      d: ribbon.d,
      'data-key': ribbon.key,
      'data-side': ribbon.side,
      'data-pre': ribbon.pre,
      'data-post': ribbon.post,
      'data-count': ribbon.count,
      'data-concern': ribbon.concern,
      'data-direction': ribbon.direction,
      'data-centre-node': ribbon.centreNode,
      'data-outer-node': ribbon.outerNode,
      'data-centroid-x': ribbon.centroid.x,
      'data-centroid-y': ribbon.centroid.y,
      fill: hexToRgba(ribbon.color, 0.55),
      stroke: hexToRgba(ribbon.color, 0.9),
      'stroke-width': 1,
      tabindex: 0,
      role: 'button',
      'aria-label': ribbonLabel(ribbon)
    });

    const tip = ribbonTip(ribbon);
    path.addEventListener('pointerenter', (event) => {
      host.migrationHoverKey = ribbon.key;
      refreshHighlight(host);
      showTip(host, event, tip);
    });
    path.addEventListener('pointermove', (event) => showTip(host, event, tip));
    path.addEventListener('pointerleave', () => {
      host.migrationHoverKey = null;
      refreshHighlight(host);
      hideTip(host);
    });
    path.addEventListener('click', () => selectCell(host, ribbon.key));
    path.addEventListener('focus', () => {
      host.migrationHoverKey = ribbon.key;
      refreshHighlight(host);
    });
    path.addEventListener('blur', () => {
      host.migrationHoverKey = null;
      refreshHighlight(host);
    });
    // Enter and Space are the two activation keys role="button" promises
    // (HEP-ACC-002); Space is also the page-scroll key, so it is consumed.
    path.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault();
      selectCell(host, ribbon.key);
    });

    group.append(path);
  });
}

/**
 * Build the whole Sankey svg (HEP-MIG-001, HEP-MIG-014, HEP-ACC-003). The
 * layout's fixed 980x540 box is translated into a margined frame so the column
 * headers and tier labels have room without altering a single layout
 * coordinate — the mirror symmetry sankeyLayout guarantees survives labelling.
 * @private
 */
function buildSankey(host, layout, summary) {
  const svg = svgEl('svg', {
    class: 'hep-sankey',
    viewBox: `0 0 ${OUTER_WIDTH} ${OUTER_HEIGHT}`,
    preserveAspectRatio: 'xMidYMid meet',
    width: '100%',
    role: 'img',
    'aria-label': sankeyLabel(summary)
  });

  const group = svgEl('g', {
    class: 'hep-sankey-plot',
    transform: `translate(${MARGIN.left}, ${MARGIN.top})`
  });

  const headers = [
    ['placebo', 0, 'start', `${SIDE_TITLE.placebo} — peak on-treatment`],
    ['centre', SANKEY_WIDTH / 2, 'middle', 'Baseline categorization'],
    ['active', SANKEY_WIDTH, 'end', `${SIDE_TITLE.active} — peak on-treatment`]
  ];
  headers.forEach(([key, x, anchor, label]) => {
    const text = svgEl('text', {
      class: 'hep-sankey-col-label',
      'data-column': key,
      x,
      y: -22,
      'text-anchor': anchor
    });
    text.textContent = label;
    group.append(text);
  });

  paintTiers(group, layout.nodes);
  paintRibbons(host, group, layout.ribbons);
  paintNodes(group, layout.nodes);

  svg.append(group);
  return svg;
}

/**
 * The concern colour legend, shared by both cross tables (HEP-XTAB-003). Same
 * four levels, same colours and same wording as the composite view's, because
 * they are the same clinical judgement.
 * @private
 */
function buildConcernLegend() {
  const legend = createElement('div', 'hep-concern-legend');
  [
    ['red', 'Unfavourable shift (potential DILI)'],
    ['yellow', 'Lateral single-analyte shift'],
    ['green', 'Favourable shift (potential benefit)'],
    ['gray', 'No migration']
  ].forEach(([key, label]) => {
    const item = createElement('span', 'hep-legend-item');
    const swatch = createElement('span', 'hep-concern-swatch');
    swatch.style.background = CONCERN_COLORS[key];
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  });
  return legend;
}

/**
 * One arm's cross table (HEP-XTAB-001..003): rows = baseline quadrant, columns
 * = peak on-treatment quadrant, both in SEVERITY_ORDER so the table reads the
 * same direction as the diagram beside it, with row totals, column totals and a
 * grand total, and every interior cell shaded by concernOf.
 *
 * Interior cells carry the SAME `${side}|${pre}|${post}` key as the ribbon for
 * the same migration, and click through selectCell, so the two selections are
 * provably identical (HEP-XTAB-005).
 * @private
 */
function buildCrossTable(host, side, matrix) {
  const wrap = createElement('div', 'hep-migration hep-xtab');
  const table = createElement('table');
  table.dataset.side = side;
  table.append(
    createElement(
      'caption',
      null,
      `${SIDE_TITLE[side]} — baseline (rows) × peak on-treatment (columns), most severe first`
    )
  );

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(createElement('th', null, 'Baseline ↓ / On-treatment →'));
  SEVERITY_ORDER.forEach((quadrant) => headRow.append(createElement('th', null, quadrant)));
  headRow.append(createElement('th', 'hep-total', 'Total'));
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  SEVERITY_ORDER.forEach((pre) => {
    const tr = document.createElement('tr');
    tr.append(createElement('td', 'hep-rowhead', pre));
    SEVERITY_ORDER.forEach((post) => {
      const count = matrix.counts[pre][post];
      const key = `${side}|${pre}|${post}`;
      const td = createElement('td', 'hep-xtab-cell', String(count));
      td.style.background = CONCERN_COLORS[concernOf(pre, post)];
      td.dataset.key = key;
      td.dataset.side = side;
      td.dataset.pre = pre;
      td.dataset.post = post;
      td.dataset.count = String(count);
      if (count > 0) {
        td.classList.add('is-clickable');
        td.tabIndex = 0;
        td.setAttribute('role', 'button');
        td.setAttribute(
          'aria-label',
          `${participantCount(count)}, ${pre} to ${post}, ${SIDE_LABEL[side]}`
        );
        td.onclick = () => selectCell(host, key);
        td.onkeydown = (event) => {
          if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
          event.preventDefault();
          selectCell(host, key);
        };
      }
      tr.append(td);
    });
    tr.append(createElement('td', 'hep-total', String(matrix.rowTotals[pre])));
    tbody.append(tr);
  });

  const totalRow = document.createElement('tr');
  totalRow.append(createElement('td', 'hep-rowhead hep-total', 'Total'));
  SEVERITY_ORDER.forEach((post) =>
    totalRow.append(createElement('td', 'hep-total', String(matrix.colTotals[post])))
  );
  totalRow.append(createElement('td', 'hep-total', String(matrix.total)));
  tbody.append(totalRow);
  table.append(tbody);

  wrap.append(table);
  return wrap;
}

/**
 * THE PAPER'S OWN BLIND SPOT, MADE VISIBLE (HEP-STEP-005). A grey Hy's-Law →
 * Hy's-Law self-flow looks reassuring, but it is exactly where the paper's
 * acknowledged limitation lives: a shift view cannot detect worsening WITHIN a
 * category, and the category in question is the most severe one. When that cell
 * is non-empty the view says so and offers to select those participants, so the
 * limitation becomes a review action rather than a footnote nobody reads.
 * @private
 */
function buildHyLawCaution(host, cells) {
  const stuck = SIDES.map((side) => cells.get(`${side}|Hy's Law|Hy's Law`)).filter(Boolean);
  if (!stuck.length) return null;
  const ids = stuck.flatMap((cell) => cell.ids.map(String));
  const note = createElement('div', 'hep-sankey-caution sv-warning');
  note.append(
    createElement(
      'span',
      'hep-caution-text',
      `⚠ ${participantCount(ids.length)} remained in Hy's Law throughout. A shift view cannot ` +
        'detect worsening within a category — review them individually.'
    )
  );
  const button = createElement('button', 'hep-step-btn', `Review these ${ids.length}`);
  button.type = 'button';
  button.onclick = () => {
    // A single stuck cell keeps its cell identity, so the hand-off can carry
    // it; both arms together are a plain participant list.
    if (stuck.length === 1) selectCell(host, `${stuck[0].side}|Hy's Law|Hy's Law`);
    else setSelection(host, ids);
  };
  note.append(button);
  return note;
}

/**
 * The status notes above the plot: how many participants the diagram shows, how
 * many lacked a usable baseline or on-treatment measurement (HEP-DATA-012), how
 * many carry an arm designated neither placebo nor active (HEP-ARM-004), how
 * many diagonal participants the Hide unchanged control is suppressing
 * (HEP-MIG-013), and any arm-designation warning (HEP-ARM-002, HEP-ARM-005).
 * @private
 */
function renderNotes(host, cohort, summary) {
  const total = unique(host.cleanRows.map((row) => row[host.settings.id_col])).length;
  const parts = [
    `<span>${cohort.plotted.length} of ${total} participants shown in the migration plot.</span>`
  ];
  if (cohort.excludedNoData)
    parts.push(
      `<span class="sv-warning">${cohort.excludedNoData} participant${
        cohort.excludedNoData > 1 ? 's' : ''
      } excluded (missing baseline or on-treatment ALT/total bilirubin).</span>`
    );
  if (cohort.armExcluded)
    parts.push(
      `<span class="sv-warning">${cohort.armExcluded} participant${
        cohort.armExcluded > 1 ? 's' : ''
      } excluded: arm not designated placebo or active.</span>`
    );
  if (host.state.hideUnchanged) {
    const hidden = summary.placebo.diagonal + summary.active.diagonal;
    parts.push(`<span>Hide unchanged is on: ${hidden} no-migration participants hidden.</span>`);
  }
  if (cohort.designation.warning)
    parts.push(`<span class="sv-warning">${cohort.designation.warning}</span>`);
  // A designated placebo with active_arms unset pools EVERY non-placebo arm onto
  // the single active side (arms.js: "every non-placebo arm pools right, with the
  // pooled arms named in the notes"). When more than one arm is pooled, the drug
  // comparison is a silent aggregate of distinct arms unless it is named here, so
  // the reviewer is told which arms merged and how to separate them (HEP-ARM-007).
  if (cohort.designation.placeboArm && !host.state.activeArms) {
    const pooled = cohort.arms.filter((arm) => arm !== cohort.designation.placeboArm);
    if (pooled.length > 1)
      parts.push(
        `<span class="sv-warning">Active side pools ${pooled.join(', ')}; use the Active arm ` +
          'control to compare one at a time.</span>'
      );
  }
  const sidesPresent = SIDES.filter((side) => summary[side].total > 0);
  if (sidesPresent.length < 2)
    parts.push(
      '<span class="sv-warning">Only one treatment side is designated, so the plot is ' +
        'one-directional. Map arm_col and set placebo_arm / active_arms to compare arms.</span>'
    );
  host.notes.innerHTML = parts.join('');
}

/**
 * The view's own Settings controls: Hide unchanged (HEP-MIG-013) and Active arm
 * (HEP-ARM-003), the two knobs that decide what the picture is comparing.
 * @private
 */
function contributeControls(host, { addControl, settingsParent }) {
  const hide = addControl('Hide unchanged', document.createElement('input'), settingsParent);
  hide.type = 'checkbox';
  hide.className = 'hep-hide-unchanged';
  hide.checked = Boolean(host.state.hideUnchanged);
  hide.onchange = () => {
    host.state.hideUnchanged = hide.checked;
    host.render();
  };

  const arms = buildHepSubjects(host.cleanRows, host.settings).arms;
  const placeboArm = designationFor(host, arms).placeboArm;
  const candidates = arms.filter((arm) => arm !== placeboArm);
  if (candidates.length > 1) {
    const select = addControl('Active arm', document.createElement('select'), settingsParent);
    select.className = 'hep-active-arm';
    const current = host.state.activeArms;
    const options = [['__all__', 'All non-placebo arms'], ...candidates.map((arm) => [arm, arm])];
    options.forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      opt.selected = value === '__all__' ? !current : Boolean(current) && current[0] === value;
      select.append(opt);
    });
    select.onchange = () => {
      host.state.activeArms = select.value === '__all__' ? null : [select.value];
      host.render();
    };
  }
}

/** The migration Sankey view component (see THE VIEW CONTRACT in views/scatter.js). */
const migrationView = {
  id: 'migration',
  label: 'Migration (Sankey)',

  // The migration view owns the whole main column: the svg, the per-arm cross
  // tables, the caution note and the hand-off all render into its container.
  slots: ['migration'],

  // The R-Ratio range filter is a scatter-pipeline control; this cohort is
  // defined by baseline availability and arm designation instead.
  usesRRatioFilter: false,

  contributeControls,

  /** The migration view adds no Filters controls beyond the shared categorical ones. */
  contributeFilters() {},

  /** Reset the view-local hover/selection state before a fresh render. */
  teardown(host) {
    host.migrationSelectedIds = [];
    host.migrationSelectedKey = null;
    host.migrationHoverKey = null;
    host.migrationCellIndex = new Map();
    host.migrationSvgEl = null;
    host.migrationTipEl = null;
  },

  /**
   * Render the migration view (HEP-MIG-*, HEP-XTAB-*, HEP-STEP-*): the mirrored
   * Sankey, one cross table per designated arm, the Hy's-Law self-flow caution,
   * and the notes reporting every participant the plot could not show. A live
   * selection carried in from another view (HEP-SELECT-006) arrives selected
   * for the participants that are part of this cohort; when none survive, the
   * selection is cleared and listeners are notified.
   */
  render(host, { carriedIds = [] } = {}) {
    // Prototype marking (Fig 3): the migration view is the module's only
    // not-yet-stable view, so the notice is scoped to this view rather than the
    // whole hep-explorer card, which stays a stable renderer.
    host.migrationWrap.append(
      prototypeBanner(
        'The Migration (Sankey) view is a prototype under evaluation for the v1.5 release — ' +
          'its behaviour and settings may change before it is finalized.'
      )
    );

    const cohort = buildCohort(host);
    host.migrationCellIndex = cohort.cells;
    host.migrationShown = cohort.plotted;
    const summary = shiftSummary(cohort.cells);

    host.selection.mount(host.compositeSelectSection, cohort.plotted);
    renderNotes(host, cohort, summary);
    renderFootnote(host);

    if (!cohort.plotted.length) {
      const note = createElement('div', 'sv-warning');
      note.textContent =
        'The migration plot needs participants in an arm designated placebo or active, each with ' +
        'baseline and on-treatment ALT and total bilirubin. No participant in the current ' +
        'selection qualifies.';
      host.migrationWrap.append(note);
      if (carriedIds.length) host.selection.dispatch([]);
      return;
    }

    const layout = layoutSankey({
      cells: cohort.cells,
      hideDiagonal: Boolean(host.state.hideUnchanged)
    });

    const plot = createElement('div', 'hep-sankey-wrap');
    const svg = buildSankey(host, layout, summary);
    host.migrationSvgEl = svg;
    plot.append(svg);
    // Absolutely-positioned HTML tooltip (not an svg <title>): native tooltips
    // never appear in a screenshot, so evidence could not capture one.
    host.migrationTipEl = createElement('div', 'hep-tip');
    plot.append(host.migrationTipEl);
    host.migrationWrap.append(plot);

    const caution = buildHyLawCaution(host, cohort.cells);
    if (caution) host.migrationWrap.append(caution);

    const tables = createElement('div', 'hep-xtab-grid');
    SIDES.forEach((side) => tables.append(buildCrossTable(host, side, cohort.matrices.get(side))));
    host.migrationWrap.append(tables);
    host.migrationWrap.append(buildConcernLegend());

    // Geometry on the root so browser evidence asserts numbers rather than
    // pixels (HEP-MIG-015) — the $hepQuadrants / $oeNormalRangeOverlay
    // convention the other modules already use.
    host.root.$hepSankey = {
      nodes: layout.nodes,
      ribbons: layout.ribbons.map((ribbon) => ({ ...ribbon })),
      scale: layout.scale
    };

    if (carriedIds.length) {
      const shownIds = new Set(cohort.plotted.map((subject) => String(subject.id)));
      const survivors = carriedIds.map(String).filter((id) => shownIds.has(id));
      if (survivors.length) setSelection(host, survivors);
      else host.selection.dispatch([]);
    }
  },

  /** The migration view's sticky selection: the selected flow's participants. */
  selectedIds(host) {
    return host.migrationSelectedIds;
  },

  /** The shared Participants control set a new multi-selection. */
  onParticipantsChanged(host, ids) {
    setSelection(host, ids);
  },

  /** The Clear selection gesture: drop the whole selection. */
  clearSelection(host) {
    clearSelection(host);
  },

  /** Restyle the diagram and the cross tables to the current hover/selection. */
  highlight(host) {
    refreshHighlight(host);
  }
};

export default migrationView;
