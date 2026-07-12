// Linked measure table for the delta-delta scatter (#25). Clicking a point
// opens, beside the chart, a table with one row per measure collected for the
// selected participant: the measure name (axis-tagged), a sparkline of the
// measure over visits, and the annotated change-over-time value. Ported from
// the original renderer's measureTable (drawMeasureTable, addSparkLines,
// formatDelta, addAxisFlag, showParticipantDetails, addFootnotes) — the
// participant listing here is measure-level, so it is its own module rather
// than the shared flat listing (SDD-FUNC-006, SDD-REG-011..025).

import { createElement } from '../shell.js';
import { formatDelta, deltaColor } from './getScales.js';
import { OTHER_COLOR } from './structureData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LISTING_STYLE_ID = 'safety-viz-delta-delta-styles';

const LISTING_STYLES = `
.safety-delta-delta .sdd-detail-header{display:flex;flex-wrap:wrap;gap:.35rem 1.5rem;margin:0 0 .75rem;padding:0 0 .6rem;border-bottom:2px solid #111827}
.safety-delta-delta .sdd-detail-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.safety-delta-delta .sdd-detail-value{font-size:.95rem;font-weight:600}
.safety-delta-delta .sdd-measure-table{width:100%;border-collapse:collapse;font-size:.85rem;background:#fff}
.safety-delta-delta .sdd-measure-table th,.safety-delta-delta .sdd-measure-table td{border-bottom:1px solid #e3e8ee;padding:.4rem .55rem;text-align:left;vertical-align:middle}
.safety-delta-delta .sdd-measure-table th{border-bottom:2px solid #d8dee4;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.safety-delta-delta .sdd-measure-table td.sdd-delta{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.safety-delta-delta .sdd-axis-tag{display:inline-block;margin-right:.4rem;padding:.05rem .35rem;border-radius:4px;background:#dbeafe;color:#1d4ed8;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.safety-delta-delta .sdd-spark-cell{width:120px}
.safety-delta-delta .sdd-table-footnote{margin:.6rem 0 0;font-size:.75rem;color:#52616f;line-height:1.4}`;

// Inject the measure-table stylesheet once per document (the shared shell
// stylesheet stays module-agnostic).
export function applyListingStyles() {
  if (typeof document === 'undefined' || document.getElementById(LISTING_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LISTING_STYLE_ID;
  style.textContent = LISTING_STYLES;
  document.head.append(style);
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  return el;
}

// A compact line of the measure over its visits (SDD-REG-020): baseline visits
// are filled blue circles, comparison visits filled orange, other visits empty
// gray (SDD-REG-023).
export function sparkline(records, settings) {
  const width = 110;
  const height = 26;
  const pad = 4;
  const svg = svgEl('svg', { width, height, class: 'sdd-sparkline' });
  if (!records.length) return svg;
  const xs = records.map((row) => Number(row[settings.visitn_col] ?? 0));
  const ys = records.map((row) => row.__dd_value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const scaleX = (x) =>
    xMax === xMin ? width / 2 : pad + ((x - xMin) / (xMax - xMin)) * (width - 2 * pad);
  const scaleY = (y) =>
    yMax === yMin ? height / 2 : height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad);

  const points = records.map((row) => ({
    cx: scaleX(Number(row[settings.visitn_col] ?? 0)),
    cy: scaleY(row.__dd_value),
    color: row.color
  }));
  if (points.length > 1) {
    svg.append(
      svgEl('polyline', {
        points: points.map((p) => `${p.cx},${p.cy}`).join(' '),
        fill: 'none',
        stroke: OTHER_COLOR,
        'stroke-width': 1
      })
    );
  }
  points.forEach((p) => {
    svg.append(
      svgEl('circle', {
        cx: p.cx,
        cy: p.cy,
        r: 2.5,
        stroke: p.color,
        'stroke-width': 1,
        fill: p.color === OTHER_COLOR ? 'transparent' : p.color
      })
    );
  });
  return svg;
}

// The participant-detail header above the table (SDD-REG-016, SDD-REG-017):
// the configured detail columns as label/value pairs, led by the participant
// ID.
function detailHeader(participant, settings) {
  const header = createElement('div', 'sdd-detail-header');
  settings.details.forEach((detail) => {
    const item = createElement('div', 'sdd-detail');
    item.append(
      createElement('div', 'sdd-detail-label', detail.label),
      createElement('div', 'sdd-detail-value', participant.meta[detail.value_col] ?? '')
    );
    header.append(item);
  });
  return header;
}

// Render the measure table for a selected participant into the listing slot.
export function drawMeasureTable(instance, participant) {
  const settings = instance.settings;
  applyListingStyles();
  instance.listingWrap.innerHTML = '';
  instance.listingWrap.append(detailHeader(participant, settings));

  const table = createElement('table', 'sdd-measure-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Measure', '', 'Change over Time'].forEach((label) =>
    headRow.append(createElement('th', null, label))
  );
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  participant.measures.forEach((measure) => {
    const tr = document.createElement('tr');

    const measureCell = createElement('td', 'sdd-measure-name');
    if (measure.axisFlag) {
      measureCell.append(createElement('span', 'sdd-axis-tag', `${measure.axisFlag}-axis`));
    }
    measureCell.append(document.createTextNode(measure.key));
    tr.append(measureCell);

    const sparkCell = createElement('td', 'sdd-spark-cell');
    sparkCell.append(sparkline(measure.records, settings));
    tr.append(sparkCell);

    const deltaCell = createElement('td', 'sdd-delta', formatDelta(measure.delta));
    deltaCell.style.color = deltaColor(measure.delta);
    deltaCell.style.fontWeight = '600';
    tr.append(deltaCell);

    tbody.append(tr);
  });
  table.append(tbody);
  instance.listingWrap.append(table);

  const footnote = createElement(
    'p',
    'sdd-table-footnote',
    'One row per measure collected for the selected participant. In each sparkline, ' +
      'baseline visits are filled blue, comparison visits filled orange, and other visits ' +
      'empty gray. Change-over-time values are green when above 0, red when below 0, and ' +
      'gray when 0 or missing (NA).'
  );
  instance.listingWrap.append(footnote);
}
