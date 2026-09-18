// The Chart.js plugin that paints a patient-journey lane (#142, design §6.3,
// §6.4, D20). WHY THIS FILE IS NOT CALLED getPlugins.js: every other module
// keeps its canvas code in `<module>/getPlugins.js`; here the pure,
// unit-tested dataset/geometry/text builders live in getPlugins.js and the
// canvas code — untested except through the browser suite — lives here, so the
// tested and the untested code are in different files (D20).
//
// One plugin instance per lane chart. Chart.js draws the floating bars, the lab
// trace and (invisibly) the scatter points; this plugin paints everything
// else on top and beneath: the context-window band and its edges, the lab
// reference band, the day-1 / disposition / anchor reference rules, the
// exposure notches at each dose change, the dose carets, the lab flag glyphs
// with their escalation rings, the adverse-event start dots, serious rings and
// severity hatching, and the end caps that carry the three terminal states
// (D16): a hard cap, an arrow over an open-ended mask (`ongoing`), a dotted
// fade (`unrecorded`).
//
// Four side-channels are recorded on the chart, in canvas (CSS) pixels, and
// they are the whole contract with keyboard.js and the browser suite (PC-13,
// RF-9): `chart.$pjeMarks` (one entry per drawn mark and per reference rule,
// in draw order), `chart.$pjeBand` (the lab reference rectangles, [] off the
// labs lane), `chart.$pjeWindow` (the context-window band's bounds and pixel
// box, or null when nothing is anchored) and `chart.$pjeLabels` (every text
// label painted in the plot — disposition names, ULN / LLN, the same-day count
// badge — with its pixel box, so a test can assert that none overlap).

import { PJE_DEEMPHASIS, PJE_MARKS } from './palette.js';
import { MIN_BAR_WIDTH, withAlpha } from './getPlugins.js';
import { toElapsed } from './getScales.js';

const HIGH_FLAGS = ['HIGH', 'HH', 'H'];
const LOW_FLAGS = ['LOW', 'LL', 'L'];
const DIM_FILL = 0.5;
const DIM_STROKE = PJE_DEEMPHASIS.strokeAlpha;
const CARET_BOX = 12;
const FONT = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_BOLD = `700 ${FONT}`;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Clip subsequent painting to the chart area, with a little vertical slack so
 * a serious ring on the top or bottom row is not shaved.
 * @private
 */
function clipToArea(ctx, area, slack = 0) {
  ctx.beginPath();
  ctx.rect(area.left, area.top - slack, area.right - area.left, area.bottom - area.top + 2 * slack);
  ctx.clip();
}

/**
 * A rounded-rectangle path (square corners where the canvas lacks roundRect).
 * @private
 */
function roundPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * An isoceles triangle path pointing up or down, centred on (cx, cy).
 * @private
 */
function trianglePath(ctx, cx, cy, size, up) {
  const h = size / 2;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + h, cy + h);
    ctx.lineTo(cx - h, cy + h);
  } else {
    ctx.moveTo(cx, cy + h);
    ctx.lineTo(cx + h, cy - h);
    ctx.lineTo(cx - h, cy - h);
  }
  ctx.closePath();
}

/**
 * A horizontal surface-coloured gradient: the open-ended mask (`toward` 'right'
 * fades the bar out to the right; 'left' fades a clipped start in).
 * @private
 */
function fadeMask(ctx, x, top, length, height, surface, toward) {
  if (length <= 0) return;
  const gradient = ctx.createLinearGradient(x, 0, x + length, 0);
  gradient.addColorStop(0, withAlpha(surface, toward === 'right' ? 0 : 1));
  gradient.addColorStop(1, withAlpha(surface, toward === 'right' ? 1 : 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x, top - 1, length, height + 2);
}

/**
 * The `ongoing` end cap: an open-ended mask and an arrow head in the mark's
 * own fill at the right edge.
 * @private
 */
function arrowCap(ctx, left, top, width, height, fill, surface) {
  const right = left + width;
  const head = Math.min(12, Math.max(4, width / 2));
  fadeMask(ctx, right - head - 16, top, 16, height, surface, 'right');
  ctx.fillStyle = surface;
  ctx.fillRect(right - head - 1, top - 2, head + 2, height + 4);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(right - head, top - 2);
  ctx.lineTo(right, top + height / 2);
  ctx.lineTo(right - head, top + height + 2);
  ctx.closePath();
  ctx.fill();
}

/**
 * The `unrecorded` end cap (D16): a dotted fade — the bar dissolves into three
 * dots rather than pointing onward, because nothing records it continuing.
 * @private
 */
function fadeCap(ctx, left, top, width, height, fill, surface) {
  const right = left + width;
  const length = Math.min(26, width * 0.6);
  fadeMask(ctx, right - length, top, length, height, surface, 'right');
  const r = Math.max(1.2, Math.min(2, height / 4));
  ctx.fillStyle = fill;
  for (const dx of [16, 10, 4]) {
    if (dx > width) continue;
    ctx.beginPath();
    ctx.arc(right - dx, top + height / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A 45° surface-coloured hatch over a bar: severity not recorded (PJE-ACC-002).
 * @private
 */
function hatch(ctx, left, top, width, height, surface) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.strokeStyle = surface;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = left - height; x < left + width + height; x += 4) {
    ctx.moveTo(x, top + height);
    ctx.lineTo(x + height, top);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The adverse-event start dot: filled when serious, open otherwise.
 * @private
 */
function startDot(ctx, cx, cy, height, color, surface, filled) {
  const r = Math.max(2.5, height / 2 + 1);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = filled ? color : surface;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/**
 * The serious ring: a 2px surface separator then a 2px escalation stroke.
 * @private
 */
function seriousRing(ctx, left, top, width, height, escalate, surface) {
  ctx.lineWidth = PJE_MARKS.escalateRingWidth;
  ctx.strokeStyle = surface;
  roundPath(ctx, left - 1, top - 1, width + 2, height + 2, 3);
  ctx.stroke();
  ctx.strokeStyle = escalate;
  roundPath(ctx, left - 3, top - 3, width + 6, height + 6, 5);
  ctx.stroke();
}

/**
 * A lab point glyph by `$pjeMarks.glyph`: open circle (normal), triangle up /
 * down (high / low), doubled triangle with an escalation ring (HH / LL), a
 * filled diamond for an abnormal indicator with no direction (`ABNORMAL`), a
 * dot when no indicator was recorded.
 * @private
 */
function labGlyph(ctx, cx, cy, size, glyph, color, surface, escalate) {
  ctx.lineWidth = 1.5;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (glyph) {
    case 'diamond': {
      const h = size / 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h);
      ctx.lineTo(cx + h, cy);
      ctx.lineTo(cx, cy + h);
      ctx.lineTo(cx - h, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'triangle-up':
      trianglePath(ctx, cx, cy, size, true);
      ctx.fill();
      break;
    case 'triangle-down':
      trianglePath(ctx, cx, cy, size, false);
      ctx.fill();
      break;
    case 'triangle-up-double':
    case 'triangle-down-double': {
      const up = glyph === 'triangle-up-double';
      const small = size * 0.62;
      trianglePath(ctx, cx, cy - size * 0.28, small, up);
      ctx.fill();
      trianglePath(ctx, cx, cy + size * 0.28, small, up);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2);
      ctx.lineWidth = PJE_MARKS.escalateRingWidth;
      ctx.strokeStyle = escalate;
      ctx.stroke();
      break;
    }
    case 'circle-open':
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 - 0.75, 0, Math.PI * 2);
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.5, size / 2 - 1.5), 0, Math.PI * 2);
      ctx.fill();
  }
}

/**
 * A dose-change caret by direction: up, down, pause (interruption), play
 * (restart).
 * @private
 */
function caret(ctx, cx, cy, glyph, color) {
  ctx.fillStyle = color;
  switch (glyph) {
    case 'caret-down':
      trianglePath(ctx, cx, cy, 10, false);
      ctx.fill();
      break;
    case 'caret-pause':
      ctx.fillRect(cx - 4.5, cy - 5, 3, 10);
      ctx.fillRect(cx + 1.5, cy - 5, 3, 10);
      break;
    case 'caret-restart':
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 5);
      ctx.lineTo(cx + 5, cy);
      ctx.lineTo(cx - 4, cy + 5);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      trianglePath(ctx, cx, cy, 10, true);
      ctx.fill();
  }
}

/**
 * Group a lab series' band entries into runs of identical limits, in day
 * order, so a per-record reference range draws as few rectangles as the data
 * allows.
 * @private
 */
function bandRuns(band) {
  const runs = [];
  for (const entry of [...band].sort((a, b) => a.day - b.day)) {
    const last = runs[runs.length - 1];
    if (last && last.lln === entry.lln && last.uln === entry.uln) continue;
    runs.push({ day: entry.day, lln: entry.lln, uln: entry.uln });
  }
  return runs;
}

/**
 * Text truncated to a pixel width with an ellipsis.
 * @private
 */
function truncate(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);
  return `${out}…`;
}

/**
 * Text with a surface-coloured halo, so a label painted over a trace or a
 * point stays legible (the halo is 3px, the trace 2px).
 * @private
 */
function haloText(ctx, text, x, y, surface) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = surface;
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

/**
 * The pixel box of a text label at the current font, from its anchor point
 * and alignment, for `chart.$pjeLabels`.
 * @private
 */
function labelBox(ctx, text, x, y, align, baseline, lineHeight = 11) {
  const width = ctx.measureText(text).width;
  const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  const top =
    baseline === 'bottom' ? y - lineHeight : baseline === 'middle' ? y - lineHeight / 2 : y;
  return { text, x: left, y: top, width, height: lineHeight };
}

/**
 * How many trace points and segments of a labs chart fall inside a pixel box.
 * @private
 */
function traceHits(chart, box) {
  let hits = 0;
  const inside = (px, py) =>
    px >= box.x - 4 &&
    px <= box.x + box.width + 4 &&
    py >= box.y - 4 &&
    py <= box.y + box.height + 4;
  chart.data.datasets.forEach((dataset, datasetIndex) => {
    const meta = chart.getDatasetMeta(datasetIndex);
    if (!meta || meta.hidden) return;
    let previous = null;
    for (const el of meta.data) {
      const p = el.getProps(['x', 'y'], true);
      if (!finite(p.x) || !finite(p.y)) continue;
      if (inside(p.x, p.y)) hits += 1;
      if (previous) {
        // Sample the segment at its midpoint and quarter points.
        for (const t of [0.25, 0.5, 0.75]) {
          if (inside(previous.x + (p.x - previous.x) * t, previous.y + (p.y - previous.y) * t))
            hits += 1;
        }
      }
      previous = p;
    }
  });
  return hits;
}

/**
 * The Chart.js plugin for one lane chart. `beforeDatasetsDraw` paints beneath
 * the marks (the context-window band, the lab reference band, the day-1 and
 * disposition rules); `afterDatasetsDraw` paints over them (end caps, hatching,
 * start dots, serious rings, notches, carets, lab glyphs, the anchor rule and
 * its pill) and records `chart.$pjeMarks`, `chart.$pjeBand` and
 * `chart.$pjeWindow`.
 * @param {Object} context The lane's drawing context.
 * @param {string} context.laneKey The lane key (`'labs'` for every lab chart).
 * @param {?string} [context.test] The lab test name (labs charts only).
 * @param {Object} context.theme The resolved theme tokens (resolveTheme).
 * @param {?{elapsedStart: number, elapsedEnd: number}} [context.bounds] The context-window bounds when anchored.
 * @param {?{id: string, day: number, label: string}} [context.anchor] The anchored event when anchored.
 * @param {boolean} [context.anchoredHere] Whether the anchored event is drawn in this chart (the pill goes here).
 * @param {number[]} [context.referenceDays] Elapsed days of the disposition reference rules.
 * @param {number[]} [context.doseChangeDays] Elapsed days of the dose changes (exposure notches).
 * @param {Array<{day: number, lln: number, uln: number}>} [context.band] The lab series' reference band (labs charts only).
 * @returns {Object} A Chart.js plugin.
 */
export function lanePlugin(context) {
  const {
    laneKey,
    test = null,
    theme,
    bounds = null,
    anchor = null,
    anchoredHere = false,
    referenceDays = [],
    doseChangeDays = [],
    band = null
  } = context;
  const surface = theme.surface;

  return {
    id: 'pjeLane',

    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: area, scales } = chart;
      const x = scales && scales.x;
      const rules = [];
      const labels = [];
      chart.$pjeBand = [];
      chart.$pjeWindow = null;
      chart.$pjeLabels = labels;
      if (!area || !x) {
        chart.$pjeRules = rules;
        return;
      }
      const height = area.bottom - area.top;
      ctx.save();
      clipToArea(ctx, area);

      // The context window band, beneath everything (design §6.4).
      if (bounds && finite(bounds.elapsedStart) && finite(bounds.elapsedEnd)) {
        const x0 = Math.max(area.left, x.getPixelForValue(bounds.elapsedStart));
        const x1 = Math.min(area.right, x.getPixelForValue(bounds.elapsedEnd + 1));
        if (x1 > x0) {
          ctx.fillStyle = theme.windowFill;
          ctx.fillRect(x0, area.top, x1 - x0, height);
          ctx.strokeStyle = theme.windowEdge;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          for (const edge of [x0, x1]) {
            ctx.beginPath();
            ctx.moveTo(Math.round(edge) + 0.5, area.top);
            ctx.lineTo(Math.round(edge) + 0.5, area.bottom);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          if (anchoredHere && anchor && x1 - x0 >= 90) {
            const days = bounds.elapsedEnd - (toElapsed(anchor.day) ?? bounds.elapsedEnd);
            ctx.font = FONT;
            ctx.fillStyle = theme.inkSecondary;
            ctx.textBaseline = 'bottom';
            ctx.textAlign = 'left';
            ctx.fillText(`−${days} d`, x0 + 3, area.bottom - 1);
            ctx.textAlign = 'right';
            ctx.fillText(`+${days} d`, x1 - 3, area.bottom - 1);
          }
        }
        chart.$pjeWindow = {
          elapsedStart: bounds.elapsedStart,
          elapsedEnd: bounds.elapsedEnd,
          x: x0,
          width: Math.max(0, x1 - x0)
        };
      }

      // The lab reference band (RF-14: a plugin-drawn rect, never a dataset fill).
      if (laneKey === 'labs' && Array.isArray(band) && band.length && scales.y) {
        const runs = bandRuns(band);
        const drawn = [];
        runs.forEach((run, index) => {
          const from = index === 0 ? area.left : x.getPixelForValue(toElapsed(run.day));
          const to =
            index === runs.length - 1
              ? area.right
              : x.getPixelForValue(toElapsed(runs[index + 1].day));
          const yTop = scales.y.getPixelForValue(run.uln);
          const yBottom = scales.y.getPixelForValue(run.lln);
          const top = Math.min(yTop, yBottom);
          const h = Math.abs(yBottom - yTop);
          ctx.fillStyle = theme.labBand;
          ctx.fillRect(from, top, to - from, h);
          drawn.push({
            test,
            x: from,
            y: top,
            width: to - from,
            height: h,
            lln: run.lln,
            uln: run.uln
          });
        });
        // The limit labels: both when the band is tall enough for two lines,
        // the upper limit alone when it is tall enough for one, painted with a
        // halo on whichever edge of the plot the trace leaves clearer — the
        // last point sits at the right edge, exactly where a right-aligned
        // label would cover it (UX-9).
        const last = drawn[drawn.length - 1];
        const first = drawn[0];
        if (last && first && last.height >= 14) {
          ctx.font = FONT;
          ctx.fillStyle = theme.inkSecondary;
          const both = last.height >= 26;
          const candidates = (run, align) => {
            const px = align === 'right' ? area.right - 3 : area.left + 3;
            const uln = { text: `ULN ${run.uln}`, x: px, y: run.y + 1, baseline: 'top' };
            const lln = {
              text: `LLN ${run.lln}`,
              x: px,
              y: run.y + run.height - 1,
              baseline: 'bottom'
            };
            return (both ? [uln, lln] : [uln]).map((label) => ({
              ...label,
              align,
              box: labelBox(ctx, label.text, label.x, label.y, align, label.baseline)
            }));
          };
          const right = candidates(last, 'right');
          const left = candidates(first, 'left');
          const score = (list) => list.reduce((sum, label) => sum + traceHits(chart, label.box), 0);
          // Painted in afterDatasetsDraw, over the trace and the reference
          // rules, with the halo keeping the text legible.
          chart.$pjeLimitLabels = score(left) < score(right) ? left : right;
        } else {
          chart.$pjeLimitLabels = [];
        }
        chart.$pjeBand = drawn;
      }

      // Day 1 and the disposition reference rules, on every lane.
      const rule = (elapsed, glyph, color, width, dash) => {
        if (!finite(elapsed) || elapsed < x.min || elapsed > x.max) return;
        const px = Math.round(x.getPixelForValue(elapsed)) + (width % 2 ? 0.5 : 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(px, area.top);
        ctx.lineTo(px, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        rules.push({
          id: glyph,
          lane: laneKey,
          test,
          kind: 'rule',
          glyph,
          emphasis: 'full',
          endCap: 'closed',
          x: px - width / 2,
          y: area.top,
          width,
          height,
          event: null
        });
      };
      rule(0, 'rule-day1', theme.ruleDay1, 1, []);
      for (const day of referenceDays)
        rule(day, 'rule-disposition', theme.ruleDisposition, 2, [6, 4]);

      ctx.restore();
      chart.$pjeRules = rules;
    },

    afterDatasetsDraw(chart) {
      const { ctx, chartArea: area, scales } = chart;
      const x = scales && scales.x;
      const marks = [...(chart.$pjeRules || [])];
      const labels = chart.$pjeLabels || (chart.$pjeLabels = []);
      if (!area || !x) {
        chart.$pjeMarks = marks;
        return;
      }
      ctx.save();
      clipToArea(ctx, area, 4);

      // Same-day records in the one-row lanes paint on the same pixel. For
      // disposition (COMPLETED and FINAL LAB VISIT both on day 184 for the
      // demo's opening participant) each pixel column's labels merge into one
      // line drawn once beside the first record; for medical history (eight
      // screening records on one day is the pilot's normal case) a count
      // badge says how many records the one ring stands for. The overlay
      // (keyboard.js) enumerates the group on the button that wins the pointer.
      const sameDay = new Map();
      if (laneKey === 'disposition' || laneKey === 'medicalHistory') {
        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (!meta || meta.hidden) return;
          dataset.data.forEach((point, i) => {
            const el = meta.data[i];
            const label = point && point.event && point.event.label;
            if (!el || !label) return;
            const px = el.getProps(['x'], true).x;
            if (!finite(px)) return;
            const key = Math.round(px);
            const group = sameDay.get(key) || { first: point, labels: [], px: key, dim: true };
            group.labels.push(String(label));
            if (point.emphasis !== 'dim') group.dim = false;
            sameDay.set(key, group);
          });
        });
      }
      // Disposition labels are laid out left to right so no label runs back
      // over the one painted before it: a label goes to the right of its dot
      // when there is room before the next dot, else to the left of it in the
      // room the previous label left free, else nowhere (the tooltip and the
      // accessible name still carry it) — UX-5.
      const dispositionText = new Map();
      if (laneKey === 'disposition') {
        ctx.font = FONT;
        const groups = [...sameDay.values()]
          .filter((group) => !group.dim)
          .sort((a, b) => a.px - b.px);
        let occupiedRight = area.left;
        groups.forEach((group, index) => {
          const text = group.labels.join(' · ');
          const px = group.px;
          const nextPx = index + 1 < groups.length ? groups[index + 1].px : Infinity;
          const rightRoom = Math.min(area.right - 8, nextPx - 6) - (px + 7);
          let placed = null;
          if (rightRoom > 40) {
            const shown = truncate(ctx, text, rightRoom);
            placed = { text: shown, x: px + 7, align: 'left' };
            occupiedRight = px + 7 + ctx.measureText(shown).width;
          } else {
            const leftRoom = px - 7 - Math.max(area.left + 1, occupiedRight + 4);
            if (leftRoom >= 20) {
              placed = { text: truncate(ctx, text, leftRoom), x: px - 7, align: 'right' };
            }
            occupiedRight = Math.max(occupiedRight, px + 4);
          }
          if (placed) dispositionText.set(px, placed);
        });
      }

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) return;
        dataset.data.forEach((point, i) => {
          const el = meta.data[i];
          const event = point && point.event;
          if (!el || !event) return;
          const dim = point.emphasis === 'dim';

          if (dataset.type === 'bar') {
            const p = el.getProps(['x', 'y', 'base', 'height'], true);
            const left = Math.min(p.x, p.base);
            const width = Math.max(Math.abs(p.x - p.base), MIN_BAR_WIDTH);
            const barHeight = p.height;
            const top = p.y - barHeight / 2;
            const fill = Array.isArray(dataset.backgroundColor)
              ? dataset.backgroundColor[i]
              : dataset.backgroundColor;
            const stroke = Array.isArray(dataset.borderColor)
              ? dataset.borderColor[i]
              : dataset.borderColor;
            if (point.clippedStart)
              fadeMask(ctx, left, top, Math.min(18, width), barHeight, surface, 'left');
            if (point.endCap === 'arrow') arrowCap(ctx, left, top, width, barHeight, fill, surface);
            else if (point.endCap === 'fade')
              fadeCap(ctx, left, top, width, barHeight, fill, surface);
            if (point.glyph === 'hatch-bar') hatch(ctx, left, top, width, barHeight, surface);
            if (laneKey === 'exposure') {
              for (const day of doseChangeDays) {
                const px = x.getPixelForValue(day);
                if (px < left - 1 || px > left + width + 1) continue;
                ctx.fillStyle = theme.doseNotch;
                ctx.fillRect(px - 1, top - 1, 2, barHeight + 2);
              }
            }
            if (laneKey === 'adverseEvents') {
              startDot(ctx, left, p.y, barHeight, stroke, surface, Boolean(point.serious));
              if (point.serious) {
                seriousRing(
                  ctx,
                  left,
                  top,
                  width,
                  barHeight,
                  dim ? withAlpha(theme.escalate, DIM_STROKE) : theme.escalate,
                  surface
                );
              }
            }
            marks.push({
              id: event.id,
              lane: laneKey,
              test: null,
              kind: event.kind,
              glyph: point.glyph,
              emphasis: point.emphasis,
              endCap: point.endCap,
              x: left,
              y: top,
              width,
              height: barHeight,
              event
            });
            return;
          }

          const p = el.getProps(['x', 'y'], true);
          if (!finite(p.x) || !finite(p.y)) return;
          if (laneKey === 'labs') {
            const size = /double$/.test(point.glyph)
              ? PJE_MARKS.labGlyphSizeExtreme
              : PJE_MARKS.labGlyphSize;
            const base = HIGH_FLAGS.includes(point.nrind)
              ? theme.labHigh
              : LOW_FLAGS.includes(point.nrind)
                ? theme.labLow
                : theme.lbTrace;
            labGlyph(
              ctx,
              p.x,
              p.y,
              size,
              point.glyph,
              dim ? withAlpha(base, DIM_FILL) : base,
              surface,
              dim ? withAlpha(theme.escalate, DIM_STROKE) : theme.escalate
            );
            marks.push({
              id: event.id,
              lane: laneKey,
              test,
              kind: 'point',
              glyph: point.glyph,
              emphasis: point.emphasis,
              endCap: 'closed',
              x: p.x - size / 2,
              y: p.y - size / 2,
              width: size,
              height: size,
              event
            });
            return;
          }

          if (laneKey === 'doseChanges') {
            caret(
              ctx,
              p.x,
              p.y,
              point.glyph,
              dim ? withAlpha(theme.doseCaret, DIM_FILL) : theme.doseCaret
            );
          } else if (laneKey === 'medicalHistory') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, PJE_MARKS.mhDotRadius, 0, Math.PI * 2);
            ctx.fillStyle = surface;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = dim ? withAlpha(theme.mh, DIM_STROKE) : theme.mh;
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, PJE_MARKS.mhDotRadius, 0, Math.PI * 2);
            ctx.fillStyle = dim ? withAlpha(theme.ds, DIM_FILL) : theme.ds;
            ctx.fill();
            const group = sameDay.get(Math.round(p.x));
            const placed = group && group.first === point ? dispositionText.get(group.px) : null;
            if (placed) {
              ctx.font = FONT;
              ctx.fillStyle = theme.inkSecondary;
              ctx.textBaseline = 'middle';
              ctx.textAlign = placed.align;
              ctx.fillText(placed.text, placed.x, p.y);
              labels.push({
                kind: 'disposition',
                ...labelBox(ctx, placed.text, placed.x, p.y, placed.align, 'middle')
              });
            }
          }
          if (laneKey === 'medicalHistory') {
            const group = sameDay.get(Math.round(p.x));
            if (group && group.labels.length > 1 && group.first === point) {
              const text = `×${group.labels.length}`;
              ctx.font = FONT_BOLD;
              ctx.fillStyle = dim ? withAlpha(theme.mh, DIM_STROKE) : theme.mh;
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'left';
              const bx = p.x + PJE_MARKS.mhDotRadius + 3;
              haloText(ctx, text, bx, p.y, surface);
              labels.push({ kind: 'count', ...labelBox(ctx, text, bx, p.y, 'left', 'middle') });
            }
          }
          marks.push({
            id: event.id,
            lane: laneKey,
            test: null,
            kind: event.kind,
            glyph: point.glyph,
            emphasis: point.emphasis,
            endCap: 'closed',
            x: p.x - CARET_BOX / 2,
            y: p.y - CARET_BOX / 2,
            width: CARET_BOX,
            height: CARET_BOX,
            event
          });
        });
      });

      // The lab limit labels, over the trace and the rules (placed in
      // beforeDatasetsDraw on the clearer side of the plot).
      if (laneKey === 'labs' && Array.isArray(chart.$pjeLimitLabels)) {
        ctx.font = FONT;
        ctx.fillStyle = theme.inkSecondary;
        for (const label of chart.$pjeLimitLabels) {
          ctx.textAlign = label.align;
          ctx.textBaseline = label.baseline;
          haloText(ctx, label.text, label.x, label.y, surface);
          labels.push({ kind: 'limit', ...label.box });
        }
      }

      // The anchor rule on every lane, and the pill on the anchored lane.
      const anchorElapsed = anchor ? toElapsed(anchor.day) : null;
      if (anchor && finite(anchorElapsed) && anchorElapsed >= x.min && anchorElapsed <= x.max) {
        const px = Math.round(x.getPixelForValue(anchorElapsed));
        ctx.strokeStyle = theme.ruleAnchor;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px, area.top - 4);
        ctx.lineTo(px, area.bottom + 4);
        ctx.stroke();
        marks.push({
          id: 'rule-anchor',
          lane: laneKey,
          test,
          kind: 'rule',
          glyph: 'rule-anchor',
          emphasis: 'full',
          endCap: 'closed',
          x: px - 1,
          y: area.top,
          width: 2,
          height: area.bottom - area.top,
          event: null
        });
        if (anchoredHere) {
          const own = marks.find((mark) => mark.event && mark.event.id === anchor.id);
          ctx.font = FONT_BOLD;
          const text = `Anchor · ${anchor.label}`;
          const w = Math.min(ctx.measureText(text).width + 10, area.right - area.left - 8);
          const h = 14;
          let py = own ? own.y - h - 3 : area.top + 2;
          if (py < area.top) py = own ? own.y + own.height + 3 : area.top + 2;
          if (py + h > area.bottom) py = Math.max(area.top, area.bottom - h);
          let ax = px + 4;
          if (ax + w > area.right) ax = Math.max(area.left, px - 4 - w);
          ctx.strokeStyle = surface;
          ctx.lineWidth = 3;
          roundPath(ctx, ax, py, w, h, 3);
          ctx.stroke();
          ctx.fillStyle = theme.ruleAnchor;
          roundPath(ctx, ax, py, w, h, 3);
          ctx.fill();
          ctx.fillStyle = surface;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(truncate(ctx, text, w - 10), ax + 5, py + h / 2 + 0.5);
        }
      }

      ctx.restore();
      chart.$pjeMarks = marks;
    }
  };
}
