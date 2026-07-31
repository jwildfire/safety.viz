// The eDISH/mDISH scatter view of the hep-explorer module (obot.roadmap#43,
// safety.viz#91): one point per participant plotting that participant's peak
// standardized ALT (x) against their peak standardized total bilirubin (y),
// with the Hy's-Law quadrant cut-lines and labels, the color-by legend, the
// quadrant summary table, and the click-to-inspect visit-path overlay. Moved
// VERBATIM out of src/hep-explorer.js; the orchestrator kept the lifecycle, the
// shell, the controls scaffold and the single-participant drill-down.
//
// THE VIEW CONTRACT. Every file in this directory default-exports the same
// shape, and src/hep-explorer.js is the only place that chooses between them:
//
//   id, label                                  identity; id matches VIEW_MODES
//   slots                                      which shell containers to show
//   usesRRatioFilter                           wants the shared R-Ratio range filter
//   contributeControls(host, builders)         this view's Settings controls
//   contributeFilters(host, builders, parent)  this view's Filters controls
//   teardown(host)                             reset view-local state before a render
//   render(host, { carriedIds })               draw, restoring a carried selection
//   selectedIds(host)                          the view's sticky selection
//   onParticipantsChanged(host, ids)           the shared Participants control changed
//   clearSelection(host)                       the shared Clear selection button
//   highlight(host)                            restyle to the current hover/selection
//
// Views are SIBLINGS: no file in views/ may import another (pinned by
// tests/unit/hep-explorer/views-isolation.test.js). Whatever two views both
// need lives in ../selection.js, ../../hep-core/ or the module's helpers.
//
// Requirement groups: HEP-CHART-*, HEP-QUAD-*, HEP-CTRL-*, HEP-DISPLAY-*,
// HEP-SELECT-*.

import { Chart } from 'chart.js';

import { createElement, option } from '../../shell.js';
import {
  AXIS_TYPES,
  DISPLAY_MODES,
  GROUP_NONE,
  LOG_BASES,
  POINT_SIZE_OPTIONS,
  cutFor
} from '../configure.js';
import { applyFilters, buildPoints, classifyQuadrants, unique } from '../structureData.js';
import { cutHandleAt, cutValueFor } from '../cutDrag.js';
import { availableDisplays, groupOrder } from '../availability.js';
import { MARGINAL_MODES, marginalPlugin, scatterPadding } from '../marginals.js';
import {
  DROPPED_PARTICIPANT_COLUMNS,
  csvDownloadLink,
  droppedRowColumns,
  toCsv
} from '../dropped.js';
import { buildScales, edishDomain, formatNumber } from '../getScales.js';
import {
  CLINICAL_CAUTION,
  GROUP_COLORS,
  QUADRANT_MEANINGS,
  SELECTION_COLOR,
  groupColorScale,
  groupLegendEntries,
  hexToRgba,
  pointSizeNote,
  pointTooltip,
  quadrantPlugin
} from '../getPlugins.js';
import { HIGHLIGHT } from '../selection.js';
import {
  animationDuration,
  buildAnimationFrames,
  pointsAtDay,
  studyDayRange,
  trailSegments
} from '../animation.js';

// Base point color when no grouping is active (HEP-CTRL-009 default).
const BASE_POINT_COLOR = GROUP_COLORS[0];

// Study-day playback (HEP-ANIM-*). The trail buffer holds this many frames, so
// a motion trail is a short fading tail behind the point rather than a
// permanent scribble across the plot — the original fades each trail out over
// ten frame-durations.
const TRAIL_FRAMES = 10;
// Frames per second the play-through advances at; the day step is derived from
// this and the duration so a long study skips days instead of slowing down.
const ANIMATION_FPS = 20;

/**
 * Add a reference-line (cutpoint) number input for one axis; edits write the
 * per-measure, per-display cut into state.cuts and clamp it to >= 0 so it cannot
 * fall below the axis minimum (HEP-QUAD-001).
 * @private
 */
function addCutControl(host, addControl, parent, axisKey) {
  const measureKey = host.state[axisKey];
  const input = addControl(`${measureKey} Reference Line`, document.createElement('input'), parent);
  input.type = 'number';
  input.step = '0.1';
  input.min = '0';
  const current = cutFor(host.state.cuts, measureKey, host.state.display);
  input.value = Number.isFinite(current) ? current : '';
  input.onchange = () => {
    const value = Math.max(0, Number(input.value) || 0);
    if (!host.state.cuts[measureKey]) host.state.cuts[measureKey] = {};
    host.state.cuts[measureKey][host.state.display] = value;
    input.value = value;
    host.render();
  };
  // Either control updates the other (HEP-QUAD-006): a drag on the plot writes
  // the value it lands on straight into this box.
  if (!host.cutInputs) host.cutInputs = {};
  host.cutInputs[axisKey === 'measureX' ? 'x' : 'y'] = input;
}

/**
 * Move one cut-line to a new value and let everything that reads it follow —
 * the state, the number input, the quadrant classification, the corner labels
 * and the summary table (HEP-QUAD-006). Deliberately NOT a full render: a
 * render rebuilds the scales and clears the selection, which is not what
 * dragging a line means, and the whole point of the gesture is that the counts
 * move under the pointer.
 * @private
 */
function moveCut(host, axis, value) {
  const measureKey = axis === 'x' ? host.state.measureX : host.state.measureY;
  if (!host.state.cuts[measureKey]) host.state.cuts[measureKey] = {};
  host.state.cuts[measureKey][host.state.display] = value;
  host.state[axis === 'x' ? 'xCut' : 'yCut'] = value;
  const input = host.cutInputs && host.cutInputs[axis];
  if (input) input.value = String(value);
  host.quadrants = classifyQuadrants(host.points, host.state.xCut, host.state.yCut);
  drawQuadrantSummary(host);
  if (host.chart) host.chart.update('none');
}

/**
 * Make the cut-lines draggable (HEP-QUAD-006). Bound ONCE to the shell canvas,
 * which outlives every redraw, and reading the live chart and state each time —
 * binding per render would stack a new set of listeners on every control change.
 *
 * The listeners are registered in the CAPTURE phase so a drag that starts on a
 * cut-line is claimed before Chart.js's own handlers see it; a gesture that is
 * not on a line falls straight through to the chart's hover and click.
 * @private
 */
function bindCutDrag(host) {
  if (host.cutDragBound) return;
  host.cutDragBound = true;
  const canvas = host.canvas;
  host.cutDrag = null;

  const at = (event) => {
    const bounds = canvas.getBoundingClientRect
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0 };
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const handleAt = (event) => {
    // Only while THIS view owns the canvas: the shell's canvas is shared, and
    // another view's chart carries no Hy's-Law cut-lines to take hold of.
    if (!host.chart || host.chart !== host.scatterChart) return null;
    const { x, y } = at(event);
    return cutHandleAt(host.chart, host.state, x, y);
  };

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      const axis = handleAt(event);
      if (!axis) return;
      event.preventDefault();
      event.stopPropagation();
      host.cutDrag = { axis, moved: false };
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    },
    true
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!host.cutDrag) {
        // Not dragging: the cursor is the only affordance a dashed line has.
        host.cutHoverAxis = handleAt(event);
        if (host.cutHoverAxis) {
          canvas.style.cursor = host.cutHoverAxis === 'x' ? 'col-resize' : 'row-resize';
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const { x, y } = at(event);
      const axis = host.cutDrag.axis;
      host.cutDrag.moved = true;
      moveCut(host, axis, cutValueFor(host.chart, axis, axis === 'x' ? x : y));
    },
    true
  );

  const end = (event) => {
    if (!host.cutDrag) return;
    // A drag that moved must not also read as a click on the plot background,
    // which would clear the selection the reader still has open.
    host.cutDragged = host.cutDrag.moved;
    host.cutDrag = null;
    if (canvas.releasePointerCapture && event.pointerId != null) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer was never captured (or is already gone); nothing to release.
      }
    }
  };
  canvas.addEventListener('pointerup', end, true);
  canvas.addEventListener('pointercancel', end, true);
}

/**
 * The shown scatter points after the categorical filters and the R-Ratio range
 * (HEP-CTRL-010, HEP-CTRL-011). Points with an unknown (NA) R-Ratio are
 * retained.
 * @private
 */
function filteredPoints(host) {
  const filtered = applyFilters(host.allPoints, host.state.filters);
  const { min, max } = host.effectiveRRatio();
  return filtered.filter((point) => {
    if (!Number.isFinite(point.rRatio)) return true;
    return point.rRatio >= min && point.rRatio <= max;
  });
}

/**
 * Refresh the shown/total participant counts, the removed-record note, and the
 * dropped-participant note (HEP-DATA-003, HEP-DISPLAY-004).
 * @private
 */
function updateNotes(host) {
  const totalParticipants = unique(host.cleanRows.map((row) => row[host.settings.id_col])).length;
  const shown = host.points.length;
  const pct = totalParticipants ? ((shown / totalParticipants) * 100).toFixed(1) : '0.0';
  host.notes.innerHTML = '';
  host.notes.append(
    createElement('span', null, `${shown} of ${totalParticipants} participants shown (${pct}%).`)
  );

  // Every count that says data left the chart carries the download that says
  // WHICH data and why (HEP-DROP-003) — a count alone cannot be checked against
  // the source dataset.
  if (host.removedRecords) {
    const note = createElement(
      'span',
      'sv-warning',
      `${host.removedRecords} missing or non-numeric results removed. `
    );
    const rows = host.droppedRows || [];
    if (rows.length) {
      note.append(
        csvDownloadLink(
          () => toCsv(rows, droppedRowColumns(rows)),
          'hepExplorerDroppedRows',
          'Download the removed records (CSV)'
        )
      );
    }
    host.notes.append(note);
  }

  if (host.droppedParticipants) {
    const dropReason =
      host.state.display === 'relative_baseline'
        ? `missing ${host.state.measureX}/${host.state.measureY} peak or baseline`
        : `missing ${host.state.measureX}/${host.state.measureY} peak`;
    const note = createElement(
      'span',
      'sv-warning',
      `${host.droppedParticipants} participants dropped (${dropReason}). `
    );
    const dropped = host.droppedParticipantList || [];
    if (dropped.length) {
      note.append(
        csvDownloadLink(
          () => toCsv(dropped, DROPPED_PARTICIPANT_COLUMNS),
          'hepExplorerDroppedParticipants',
          'Download the dropped participants (CSV)'
        )
      );
    }
    host.notes.append(note);
  }

  // A withdrawn display mode is a visible absence — the control simply has one
  // fewer option — so the reason is stated rather than left to be noticed
  // (HEP-DISPLAY-006).
  const availability = host.displayAvailability;
  if (availability && availability.note) {
    host.notes.append(createElement('span', 'sv-warning', availability.note));
  }

  // Imputation is a change to the plotted values, so it is reported wherever
  // the drops are (HEP-IMPUTE-002) rather than left to the console.
  if (host.imputedRecords) {
    const limits = Object.entries(host.imputationLimits || {})
      .map(([measure, limit]) => `${measure} < ${formatNumber(limit)}`)
      .join(', ');
    host.notes.append(
      createElement(
        'span',
        null,
        `${host.imputedRecords} result${host.imputedRecords > 1 ? 's' : ''} below the limit of ` +
          `quantitation imputed to half the limit${limits ? ` (${limits})` : ''}.`
      )
    );
  }
}

/**
 * The scatter participant being traced: the hovered participant takes priority
 * over the clicked (sticky) selection, or null when neither is active — the same
 * hover-over-select rule the composite view uses (HEP-SELECT-001).
 * @private
 */
function activeId(host) {
  return host.state.hoverId != null ? host.state.hoverId : host.state.selectedId;
}

/**
 * Whether any scatter participant is currently traced — hovered, or in the
 * control-driven multi-highlight (HEP-SELECT-001, HEP-COMP-007).
 * @private
 */
function anyActive(host) {
  return host.state.hoverId != null || host.scatterSelectedIds.length > 0;
}

/**
 * Whether a scatter point is currently traced: hovered, or one of the
 * Participants-control multi-highlight (a click selection is always mirrored
 * there) (HEP-SELECT-001).
 * @private
 */
function isActive(host, point) {
  if (!point) return false;
  const id = String(point.id);
  if (host.state.hoverId != null && String(host.state.hoverId) === id) return true;
  return host.scatterSelectedIds.includes(id);
}

/**
 * Whether the given participant id is the sticky (clicked) selection.
 * @private
 */
function isSelectedId(host, id) {
  return host.state.selectedId != null && String(host.state.selectedId) === String(id);
}

/**
 * Refresh the shared trace header from the scatter view's hover +
 * multi-highlight (HEP-SELECT-001).
 * @private
 */
function updateHeader(host) {
  host.selection.updateTraceHeader(host.state.hoverId, host.scatterSelectedIds);
}

/**
 * Set the transient hovered scatter participant and restyle the scatter +
 * overlay annotation when it changes, without triggering the drill-down (which
 * stays a click action). The overlay follows the hover, then reverts to the
 * sticky selection when the pointer leaves (HEP-SELECT-001).
 * @private
 */
function setHover(host, id) {
  const norm = id ?? null;
  if (String(norm ?? '') === String(host.state.hoverId ?? '')) return;
  host.state.hoverId = norm;
  if (host.chart) host.chart.update('none');
  const traced = activeId(host);
  host.mainAnnotation.textContent =
    traced == null ? '' : host.selection.annotationText(traced, isSelectedId(host, traced));
  updateHeader(host);
}

/**
 * The palette color for a point given the active grouping (HEP-CTRL-009).
 * @private
 */
function colorFor(host, point) {
  if (host.groupValues.length && point.group != null) {
    return host.colorScale.get(String(point.group)) || BASE_POINT_COLOR;
  }
  return BASE_POINT_COLOR;
}

/**
 * The point radius for the active Point Size mode (HEP-CTRL-007): a uniform
 * radius, or a radius scaled by the participant R-Ratio.
 * @private
 */
function radiusFor(host, point) {
  if (host.state.pointSize !== 'rRatio') return 5;
  const values = host.points.map((candidate) => candidate.rRatio).filter(Number.isFinite);
  const rMax = values.length ? Math.max(...values) : 0;
  if (!Number.isFinite(point.rRatio) || rMax <= 0) return 3;
  return 3 + 7 * (point.rRatio / rMax);
}

/**
 * Whether the scatter is currently showing a study day rather than the static
 * peak-vs-peak reduction (HEP-ANIM-003).
 * @private
 */
function animating(host) {
  return host.state.animation && host.state.animation.day != null;
}

/**
 * The animated position of one shown point, or null when playback is off or
 * that participant carries no dated series to walk along (HEP-ANIM-003). A
 * point with no frame simply holds its peak position for the whole
 * play-through — the alternative, dropping it, would make the cloud change size
 * for a reason that has nothing to do with time.
 * @private
 */
function animatedAt(host, index) {
  return animating(host) && host.animationPositions ? host.animationPositions[index] : null;
}

/**
 * Rebuild the per-participant animation frames for the SHOWN points, in the
 * same order as `host.points` so a Chart.js data index means the same
 * participant whether the scatter is static or playing (HEP-ANIM-002).
 * @private
 */
function rebuildAnimationFrames(host) {
  host.animationRange = studyDayRange(host.cleanRows, host.settings);
  const frames = buildAnimationFrames(host.cleanRows, host.settings, host.state);
  const byId = new Map(frames.map((frame) => [String(frame.id), frame]));
  host.animationFrames = host.points.map((point) => byId.get(String(point.id)) || null);
  host.animationPositions = null;
  host.animationTrail = [];
}

/**
 * Position the cloud on one study day and redraw (HEP-ANIM-003, HEP-ANIM-004):
 * every point moves to its most recent value at or before the day, the segment
 * each moving point just travelled is pushed onto the fading trail buffer, and
 * the day readout and slider follow. Deliberately a `chart.update('none')`
 * rather than a render: a render rebuilds the scales and clears the selection,
 * and a play-through that reset the axes under the moving points would be
 * unreadable.
 * @private
 */
function showDay(host, day) {
  const frames = host.animationFrames || [];
  const previous = host.animationPositions;
  const dated = frames.filter(Boolean);
  const positionsByFrame = dated.length ? pointsAtDay(dated, day) : [];
  const byId = new Map(positionsByFrame.map((point) => [String(point.id), point]));
  const positions = frames.map((frame, index) => {
    const point = host.points[index];
    if (!frame) return { id: point.id, x: point.x, y: point.y, outOfRange: false, enrolled: true };
    return byId.get(String(frame.id)) || null;
  });

  // The trail is the path the points just took, not a decoration: it is built
  // from the two positions that actually bracket this step.
  if (previous) {
    const segments = trailSegments(previous.filter(Boolean), positions.filter(Boolean));
    if (segments.length) host.animationTrail.push(segments);
    while (host.animationTrail.length > TRAIL_FRAMES) host.animationTrail.shift();
  }

  host.animationPositions = positions;
  host.state.animation.day = day;

  const chart = host.chart;
  if (chart) {
    chart.data.datasets[0].data = positions.map((position, index) =>
      position
        ? { x: position.x, y: position.y }
        : { x: host.points[index].x, y: host.points[index].y }
    );
    chart.data.datasets[2].data = trailData(host);
    chart.update('none');
  }
  if (host.animationSlider) host.animationSlider.value = String(day);
  if (host.animationLabel) host.animationLabel.textContent = `Showing data from: Day ${day}`;
}

/**
 * Flatten the trail buffer into one gap-separated line dataset, oldest frame
 * first so the fade runs from faint to solid (HEP-ANIM-004).
 * @private
 */
function trailData(host) {
  const data = [];
  (host.animationTrail || []).forEach((segments) => {
    segments.forEach((segment) => {
      // The third vertex is the gap: Chart.js skips a NaN-valued point and,
      // with spanGaps off, breaks the line there — a literal null would fail
      // object-mode parsing instead of separating the segments.
      data.push(
        { x: segment.x1, y: segment.y1 },
        { x: segment.x2, y: segment.y2 },
        { x: NaN, y: NaN }
      );
    });
  });
  return data;
}

/**
 * The opacity a trail vertex is drawn at: the oldest buffered frame is nearly
 * gone, the newest is at full trail strength (HEP-ANIM-004).
 * @private
 */
function trailAlpha(host, dataIndex) {
  const frames = host.animationTrail || [];
  let offset = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const span = frames[i].length * 3;
    if (dataIndex < offset + span) return (0.15 + 0.45 * (i + 1)) / (frames.length + 1);
    offset += span;
  }
  return 0;
}

/**
 * Stop a running play-through, leaving the cloud where it stopped (HEP-ANIM-005).
 * Idempotent, and safe to call from teardown when nothing is playing.
 * @private
 */
function stopPlayback(host) {
  if (host.animationTimer) {
    clearInterval(host.animationTimer);
    host.animationTimer = null;
  }
  if (host.state.animation) host.state.animation.playing = false;
  syncPlayButton(host);
  // The quadrant labels and summary describe the peak-vs-peak classification,
  // so they come back the moment the cloud stops moving (HEP-ANIM-006).
  if (host.quadrantWrap) host.quadrantWrap.style.opacity = '';
  if (host.chart) host.chart.update('none');
}

/**
 * Start (or restart) the play-through from the current day to the end of the
 * study-day range (HEP-ANIM-005). The step size is derived from the ported
 * duration formula and a fixed frame rate, so a long study skips days rather
 * than crawling.
 * @private
 */
function startPlayback(host) {
  const range = host.animationRange;
  if (!range) return;
  stopPlayback(host);
  const start = host.state.animation.day == null ? range[0] : host.state.animation.day;
  const from = start >= range[1] ? range[0] : start;
  const duration = animationDuration(from, range[1]);
  const frameCount = Math.max(1, Math.round((duration / 1000) * ANIMATION_FPS));
  const step = (range[1] - from) / frameCount;
  host.state.animation.playing = true;
  host.animationTrail = [];
  syncPlayButton(host);
  if (host.quadrantWrap) host.quadrantWrap.style.opacity = '0.35';
  showDay(host, from);
  let frame = 0;
  host.animationTimer = setInterval(() => {
    frame += 1;
    const day = frame >= frameCount ? range[1] : Math.round(from + step * frame);
    showDay(host, day);
    if (frame >= frameCount) stopPlayback(host);
  }, 1000 / ANIMATION_FPS);
}

/**
 * Return the scatter to the static peak-vs-peak reduction (HEP-ANIM-007): the
 * whole point of the animation is that you can leave it, and a reader who has
 * scrubbed to day 40 needs one gesture back to the chart every other control
 * describes.
 * @private
 */
function resetPlayback(host) {
  stopPlayback(host);
  host.state.animation.day = null;
  host.animationPositions = null;
  host.animationTrail = [];
  if (host.animationLabel) host.animationLabel.textContent = 'Showing peak values (all days)';
  if (host.chart) {
    host.chart.data.datasets[0].data = host.points.map((point) => ({ x: point.x, y: point.y }));
    host.chart.data.datasets[2].data = [];
    host.chart.update('none');
  }
}

/** Keep the play/stop button's glyph, title and aria-label on the live state. @private */
function syncPlayButton(host) {
  const button = host.animationPlayBtn;
  if (!button) return;
  const playing = Boolean(host.state.animation && host.state.animation.playing);
  button.textContent = playing ? '■' : '▶';
  button.title = playing ? 'Stop the study-day playback' : 'Play the study-day animation';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(playing));
}

/**
 * Render the study-day playback bar beneath the plot (HEP-ANIM-001): a play /
 * stop button, a day slider annotated with the range endpoints, the day
 * readout, and the reset back to the peak-vs-peak view. Drawn only when the
 * data carries usable study days — an animation over undated records would move
 * points along an axis that does not exist (HEP-ANIM-008).
 * @private
 */
function drawAnimationBar(host) {
  host.animationPlayBtn = null;
  host.animationSlider = null;
  host.animationLabel = null;
  if (!host.animationWrap) return;
  const range = host.animationRange;
  if (!range || range[0] === range[1]) {
    if (range) {
      host.animationWrap.append(
        createElement(
          'span',
          'hep-animation-note',
          'Study-day playback needs records on more than one study day.'
        )
      );
    }
    return;
  }

  const bar = createElement('div', 'hep-animation-bar');
  const play = createElement('button', 'hep-animation-play');
  play.type = 'button';
  host.animationPlayBtn = play;
  play.onclick = () => {
    if (host.state.animation.playing) stopPlayback(host);
    else startPlayback(host);
  };

  bar.append(play, createElement('span', 'hep-animation-end', String(range[0])));
  const slider = createElement('input', 'hep-animation-slider');
  slider.type = 'range';
  slider.min = String(range[0]);
  slider.max = String(range[1]);
  slider.step = '1';
  slider.value = String(host.state.animation.day == null ? range[0] : host.state.animation.day);
  slider.setAttribute('aria-label', 'Study day');
  // Scrubbing is the same gesture as playing, one frame at a time, so it stops
  // a running play-through rather than fighting it for the day.
  slider.oninput = () => {
    stopPlayback(host);
    showDay(host, Number(slider.value));
  };
  host.animationSlider = slider;
  bar.append(slider, createElement('span', 'hep-animation-end', String(range[1])));

  const reset = createElement('button', 'hep-animation-reset', 'Reset');
  reset.type = 'button';
  reset.title = 'Return to the peak-value scatter';
  reset.onclick = () => resetPlayback(host);
  bar.append(reset);

  const label = createElement(
    'div',
    'hep-animation-label',
    host.state.animation.day == null
      ? 'Showing peak values (all days)'
      : `Showing data from: Day ${host.state.animation.day}`
  );
  host.animationLabel = label;
  host.animationWrap.append(bar, label);
  syncPlayButton(host);
}

/**
 * Draw the Chart.js eDISH scatter: dataset 0 = participant points styled by
 * group, timing, and selection; dataset 1 = the (initially empty) visit-path
 * line overlay; dataset 2 = the (initially empty) motion trails the study-day
 * playback leaves behind (HEP-ANIM-004). The quadrant plugin draws the
 * cut-lines and labels; clicking a point selects the participant, clicking
 * empty space clears the selection.
 * @private
 */
function drawScatter(host) {
  const points = host.points;
  const data = points.map((point) => ({ x: point.x, y: point.y }));
  const type = host.state.axisType === 'log' ? 'log' : 'linear';
  const xDomain = edishDomain(
    points.map((point) => point.x),
    host.state.xCut,
    type
  );
  const yDomain = edishDomain(
    points.map((point) => point.y),
    host.state.yCut,
    type
  );

  // A participant is "active" when hovered or selected (including the
  // Participants-control multi-highlight); the active points keep their color
  // with a dark ring while the rest dim — the same treatment the composite
  // view uses (HEP-SELECT-001, HEP-COMP-007).
  const traced = (point) => isActive(host, point);
  const fill = (ctx) => {
    const point = points[ctx.dataIndex];
    if (!point) return 'rgba(0,0,0,0)';
    const active = traced(point);
    const color = colorFor(host, point);
    // While a study day is being shown, the timing highlight is meaningless
    // (it compares two PEAK days) and the fill instead says whether that
    // participant has been enrolled yet (HEP-ANIM-003).
    const moving = animatedAt(host, ctx.dataIndex);
    if (moving) {
      if (!moving.enrolled) return 'rgba(0,0,0,0)';
      return hexToRgba(color, anyActive(host) ? (active ? 1 : HIGHLIGHT.DIM_FILL) : 0.5);
    }
    if (!point.withinWindow && !active) return 'rgba(0,0,0,0)';
    const opacity = anyActive(host) ? (active ? 1 : HIGHLIGHT.DIM_FILL) : 0.75;
    return hexToRgba(color, opacity);
  };
  const border = (ctx) => {
    const point = points[ctx.dataIndex];
    if (!point) return 'rgba(0,0,0,0)';
    const moving = animatedAt(host, ctx.dataIndex);
    if (moving && !moving.enrolled) return 'rgba(0,0,0,0)';
    if (traced(point)) return SELECTION_COLOR;
    const opacity = anyActive(host) ? HIGHLIGHT.DIM_BORDER : 0.9;
    return hexToRgba(colorFor(host, point), opacity);
  };
  // A point sitting outside its own measured span is drawn at half size, the
  // original's signal that it is being held rather than observed (HEP-ANIM-003).
  const animatedRadius = (index) => {
    const moving = animatedAt(host, index);
    const base = radiusFor(host, points[index]);
    return moving && moving.outOfRange ? base / 2 : base;
  };

  const chart = new Chart(host.canvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Participants',
          data,
          pointBackgroundColor: fill,
          pointBorderColor: border,
          pointBorderWidth: (ctx) =>
            traced(points[ctx.dataIndex]) ? HIGHLIGHT.BORDER_WIDTH : 1.25,
          pointRadius: (ctx) =>
            animatedRadius(ctx.dataIndex) +
            (traced(points[ctx.dataIndex]) ? HIGHLIGHT.RADIUS_BOOST : 0),
          pointHoverRadius: (ctx) => animatedRadius(ctx.dataIndex) + 2
        },
        {
          type: 'line',
          label: 'Visit path',
          data: [],
          showLine: true,
          borderColor: hexToRgba(SELECTION_COLOR, 0.7),
          borderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 4,
          pointBackgroundColor: SELECTION_COLOR,
          pointBorderColor: SELECTION_COLOR
        },
        {
          // Motion trails (HEP-ANIM-004): one two-vertex, gap-separated segment
          // per point that moved, fading with age across the trail buffer.
          type: 'line',
          label: 'Motion trails',
          data: [],
          showLine: true,
          spanGaps: false,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderColor: (ctx) =>
            hexToRgba(BASE_POINT_COLOR, trailAlpha(host, ctx.p0DataIndex ?? ctx.dataIndex ?? 0)),
          segment: {
            borderColor: (ctx) => hexToRgba(BASE_POINT_COLOR, trailAlpha(host, ctx.p0DataIndex))
          }
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      layout: { padding: scatterPadding(host.state.marginals) },
      plugins: {
        legend: { display: false },
        tooltip: {
          // Exclude the visit-path overlay (dataset 1) so hovering the path
          // line never pops an empty tooltip box; only the participant points
          // (dataset 0) carry a tooltip (HEP-CHART-004, HEP-SELECT-003).
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: () => '',
            label: (ctx) =>
              ctx.datasetIndex === 0
                ? pointTooltip(points[ctx.dataIndex], host.state, host.settings.measure_values)
                : ''
          }
        }
      },
      scales: buildScales(host.state, xDomain, yDomain, host.settings.measure_values),
      onHover: (event, active) => {
        const target = event?.native?.target;
        // A cut-line under the pointer owns the cursor: it is the only hint
        // that the line can be moved (HEP-QUAD-006).
        if (target && !host.cutHoverAxis) {
          target.style.cursor = active.length ? 'pointer' : 'default';
        }
        // Trace the hovered participant point (dataset 0 only, never the
        // visit-path overlay) with the same highlight as a selection.
        const hit = active.find((element) => element.datasetIndex === 0);
        setHover(host, hit ? points[hit.index].id : null);
      },
      onClick: (event, active) => {
        // The click that ends a cut-line drag is not a click on the plot.
        if (host.cutDragged) {
          host.cutDragged = false;
          return;
        }
        const hit = active.find((element) => element.datasetIndex === 0);
        if (hit) host.selectParticipant(points[hit.index].id);
        else host.clearSelection();
      }
    },
    plugins: [quadrantPlugin(host), marginalPlugin(host)]
  });
  host.chart = chart;
  host.scatterChart = chart;
  host.charts.push(chart);
  bindCutDrag(host);
}

/**
 * Render the color-by legend for the active grouping (HEP-CTRL-009).
 * @private
 */
function drawLegend(host) {
  host.legendEl.innerHTML = '';
  if (host.groupValues.length) {
    const groupLabel =
      (host.settings.groups.find((spec) => spec.value_col === host.state.groupBy) || {}).label ||
      host.state.groupBy;
    host.legendEl.append(createElement('strong', null, `${groupLabel}:`));
    // Each group with its n and its share of the plotted points (HEP-CTRL-013):
    // a swatch alone says which colour a group is, not how much of the chart
    // it accounts for.
    groupLegendEntries(host.groupValues, host.points).forEach((entry) => {
      const chip = createElement('span', 'hep-legend-item');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:.3rem';
      const swatch = createElement('span');
      swatch.style.cssText = `display:inline-block;width:.75rem;height:.75rem;border-radius:2px;background:${host.colorScale.get(
        entry.value
      )}`;
      chip.append(swatch, document.createTextNode(entry.label));
      host.legendEl.append(chip);
    });
  }
  // What point size encodes, when it encodes anything (HEP-CTRL-014).
  const sizeNote = pointSizeNote(host.state.pointSize);
  if (sizeNote) {
    const note = createElement('span', 'hep-legend-note', sizeNote);
    host.legendEl.append(note);
  }
}

/**
 * Render the quadrant summary table (Quadrant | # | %) below the chart from the
 * live classification (HEP-QUAD-005).
 * @private
 */
function drawQuadrantSummary(host) {
  host.quadrantWrap.innerHTML = '';
  const table = createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(createElement('th', null, 'Quadrant'));
  headRow.append(createElement('th', 'hep-num', '#'));
  headRow.append(createElement('th', 'hep-num', '%'));
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  host.quadrants.labels.forEach((entry) => {
    const tr = document.createElement('tr');
    const name = createElement('td', null, entry.label);
    // What landing in this region means, stated next to the count that says how
    // many participants did (HEP-QUAD-008).
    const meaning = QUADRANT_MEANINGS[entry.label];
    if (meaning) name.append(createElement('span', 'hep-quadrant-meaning', meaning));
    tr.append(name);
    tr.append(createElement('td', 'hep-num', String(entry.count)));
    tr.append(
      createElement(
        'td',
        'hep-num',
        `${Number.isFinite(entry.percent) ? entry.percent.toFixed(1) : '0.0'}%`
      )
    );
    tbody.append(tr);
  });
  table.append(tbody);
  host.quadrantWrap.append(table);
}

/**
 * Re-apply the participant selection that was live before a redraw or a view
 * switch. A single surviving participant reopens every coordinated panel —
 * visit path, lab-over-time chart, measure summary table, and listing — in the
 * active display units (HEP-SELECT-006); several survivors restore the
 * multi-highlight and the Participants control without the single-participant
 * drill-down; participants no longer shown (filtered out, or dropped by the
 * mDISH view for lacking a baseline) fall out, and listeners always hear the
 * surviving selection.
 * @private
 */
function restoreSelection(host, ids) {
  const shownIds = new Set(host.points.map((point) => String(point.id)));
  const survivors = ids.map(String).filter((id) => shownIds.has(id));
  if (survivors.length === 1) {
    host.selectParticipant(survivors[0]);
    return;
  }
  host.scatterSelectedIds = survivors;
  host.selection.sync(survivors);
  if (host.chart) host.chart.update('none');
  updateHeader(host);
  host.selection.dispatch([...survivors]);
}

/** The eDISH/mDISH scatter view component (see THE VIEW CONTRACT above). */
const scatterView = {
  id: 'scatter',
  label: 'eDISH scatter',

  // The shell containers this view occupies: the single scatter canvas, the
  // color-by legend, and the quadrant summary table (HEP-COMP-006).
  slots: ['chart', 'legend', 'quadrantSummary', 'animation'],

  // The R-Ratio range filter narrows the plotted points, so it belongs to this
  // view's pipeline (HEP-CTRL-010).
  usesRRatioFilter: true,

  /**
   * The scatter's own Settings controls (HEP-CTRL-001, HEP-CTRL-002,
   * HEP-QUAD-001, HEP-DISPLAY-001, HEP-CTRL-006, HEP-CTRL-007, HEP-CTRL-008),
   * appended to the shared Settings section in the order the shell renders them.
   */
  contributeControls(host, { addControl, settingsParent }) {
    // X-axis Measure (HEP-CTRL-001).
    const measureX = addControl('X-axis Measure', document.createElement('select'), settingsParent);
    host.settings.x_options.forEach((key) =>
      option(measureX, key, key, key === host.state.measureX)
    );
    measureX.onchange = () => {
      host.state.measureX = measureX.value;
      host.buildControls();
      host.render();
    };

    // Y-axis Measure — dropped when only one option (HEP-CTRL-002).
    if (host.settings.y_options.length > 1) {
      const measureY = addControl(
        'Y-axis Measure',
        document.createElement('select'),
        settingsParent
      );
      host.settings.y_options.forEach((key) =>
        option(measureY, key, key, key === host.state.measureY)
      );
      measureY.onchange = () => {
        host.state.measureY = measureY.value;
        host.buildControls();
        host.render();
      };
    }

    // Reference lines (the Hy's-Law cutpoints) for each axis (HEP-QUAD-001).
    addCutControl(host, addControl, settingsParent, 'measureX');
    addCutControl(host, addControl, settingsParent, 'measureY');

    // Quadrant Labels: the corner labels are guidance, not data, and a reader
    // working inside a dense cloud can turn them off (HEP-QUAD-007).
    const quadrantLabels = addControl(
      'Quadrant Labels',
      document.createElement('select'),
      settingsParent
    );
    [
      { value: 'shown', label: 'Shown' },
      { value: 'hidden', label: 'Hidden' }
    ].forEach((mode) =>
      option(quadrantLabels, mode.value, mode.label, mode.value === host.state.quadrantLabels)
    );
    quadrantLabels.onchange = () => {
      host.state.quadrantLabels = quadrantLabels.value;
      host.render();
    };

    // Display Type: eDISH / mDISH (HEP-DISPLAY-001), narrowed to the modes this
    // data can actually be plotted in (HEP-DISPLAY-006).
    const display = addControl('Display Type', document.createElement('select'), settingsParent);
    const supported = availableDisplays(host.cleanRows).modes;
    DISPLAY_MODES.filter((mode) => !supported.length || supported.includes(mode.value)).forEach(
      (mode) => option(display, mode.value, mode.label, mode.value === host.state.display)
    );
    display.onchange = () => {
      host.state.display = display.value;
      host.buildControls();
      host.render();
    };

    // Axis Type: linear / log (HEP-CTRL-006). Rebuilds the controls because the
    // Log Base picker below only exists while the axis is logarithmic.
    const axisType = addControl('Axis Type', document.createElement('select'), settingsParent);
    AXIS_TYPES.forEach((type) => option(axisType, type, type, type === host.state.axisType));
    axisType.onchange = () => {
      host.state.axisType = axisType.value;
      host.buildControls();
      host.render();
    };

    // Log Base: log10 / log2 (HEP-CTRL-017), offered only while the axis is
    // logarithmic — on a linear axis it names nothing. It moves the gridlines,
    // not the points: position on a log axis is base-independent.
    if (host.state.axisType === 'log') {
      const logBase = addControl('Log Base', document.createElement('select'), settingsParent);
      LOG_BASES.forEach((base) =>
        option(logBase, base.value, base.label, base.value === Number(host.state.logBase))
      );
      logBase.onchange = () => {
        host.state.logBase = Number(logBase.value);
        host.render();
      };
    }

    // Marginal distributions: the one-dimensional summary of each axis the
    // original renderer draws beside the cloud (HEP-MARG-003).
    const marginals = addControl(
      'Marginal Distributions',
      document.createElement('select'),
      settingsParent
    );
    MARGINAL_MODES.forEach((mode) =>
      option(marginals, mode.value, mode.label, mode.value === host.state.marginals)
    );
    marginals.onchange = () => {
      host.state.marginals = marginals.value;
      host.render();
    };

    // Point Size: uniform / rRatio-scaled (HEP-CTRL-007).
    const pointSize = addControl('Point Size', document.createElement('select'), settingsParent);
    POINT_SIZE_OPTIONS.forEach((value) =>
      option(pointSize, value, value, value === host.state.pointSize)
    );
    pointSize.onchange = () => {
      host.state.pointSize = pointSize.value;
      host.render();
    };

    // Timing window (HEP-CTRL-008).
    const window = addControl(
      'Highlight Points Based on Timing',
      document.createElement('input'),
      settingsParent
    );
    window.type = 'number';
    window.min = '0';
    window.step = '1';
    window.value = host.state.visitWindow;
    window.onchange = () => {
      const value = Number(window.value);
      host.state.visitWindow = Number.isFinite(value) && value >= 0 ? value : 0;
      window.value = host.state.visitWindow;
      host.render();
    };
  },

  /**
   * The R-Ratio range filter: min/max number inputs plus a Reset button that
   * restores the initial range (HEP-CTRL-010).
   */
  contributeFilters(host, { addRow, addControl }, parent) {
    const { max, dataMax } = host.effectiveRRatio();
    const row = addRow(parent);
    const min = addControl('R Ratio min', document.createElement('input'), row);
    min.type = 'number';
    min.step = '0.1';
    min.value = Number.isFinite(host.state.rRatio[0]) ? host.state.rRatio[0] : 0;
    min.onchange = () => {
      host.state.rRatio[0] = min.value === '' ? 0 : Number(min.value);
      host.render();
    };
    const maxInput = addControl('R Ratio max', document.createElement('input'), row);
    maxInput.type = 'number';
    maxInput.step = '0.1';
    maxInput.value = formatNumber(max) || dataMax;
    maxInput.onchange = () => {
      host.state.rRatio[1] = maxInput.value === '' ? null : Number(maxInput.value);
      host.render();
    };
    const reset = addControl(' ', document.createElement('button'), parent);
    reset.type = 'button';
    reset.textContent = 'Reset R Ratio';
    reset.style.cssText =
      'width:100%;padding:.3rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.8rem;cursor:pointer';
    reset.onclick = () => {
      host.state.rRatio = [...host.settings.r_ratio];
      host.buildControls();
      host.render();
    };
  },

  /**
   * The one thing that must not survive a redraw: a running play-through
   * (HEP-ANIM-005). Its interval holds the OLD Chart.js instance, so leaving it
   * running across a control change would keep writing into a destroyed chart.
   * Everything else view-local is already cleared by the orchestrator's render
   * preamble — the hover, the sticky selection and the multi-highlight.
   */
  teardown(host) {
    stopPlayback(host);
    if (host.state.animation) host.state.animation.day = null;
    host.animationPositions = null;
    host.animationTrail = [];
  },

  /**
   * Draw the scatter from the cleaned rows: build the per-participant points,
   * apply the filters, refresh the notes, resolve the grouping colors, classify
   * the quadrants, then draw the plot, the legend and the summary table, mount
   * the Participants control, and restore any carried selection
   * (HEP-SELECT-006).
   */
  render(host, { carriedIds = [] } = {}) {
    const built = buildPoints(host.cleanRows, host.settings, host.state);
    host.allPoints = built.points;
    host.droppedParticipants = built.droppedParticipants;
    host.droppedParticipantList = built.droppedList;
    host.points = filteredPoints(host);
    updateNotes(host);

    if (!host.points.length) {
      host.mainAnnotation.textContent = 'No participants to plot for the current selection.';
      if (carriedIds.length) host.selection.dispatch([]);
      return;
    }

    const grouped = host.state.groupBy && host.state.groupBy !== GROUP_NONE;
    host.groupValues = grouped
      ? groupOrder(
          unique(host.points.map((point) => point.group)).filter(
            (value) => value !== null && value !== undefined
          ),
          host.points,
          host.settings.group_order_col
        )
      : [];
    host.colorScale = groupColorScale(host.groupValues);

    host.quadrants = classifyQuadrants(host.points, host.state.xCut, host.state.yCut);
    drawScatter(host);
    // The playback frames are rebuilt AFTER the points, because they are the
    // same participants in the same order (HEP-ANIM-002).
    rebuildAnimationFrames(host);
    drawAnimationBar(host);
    drawLegend(host);
    drawQuadrantSummary(host);
    host.selection.mount(
      host.compositeSelectSection,
      unique(host.points.map((point) => String(point.id))).map((id) => ({ id }))
    );
    if (carriedIds.length) restoreSelection(host, carriedIds);
  },

  /** The scatter's sticky selection: the Participants-control multi-highlight. */
  selectedIds(host) {
    return host.scatterSelectedIds;
  },

  /**
   * Apply a Participants-control selection to the scatter view (HEP-SELECT-001,
   * HEP-COMP-007): exactly one participant opens the full drill-down (the same
   * path as clicking their point), none clears everything, and several highlight
   * those participants across the scatter — dimming the rest and counting them
   * in the header — while the single-participant drill-down closes.
   */
  onParticipantsChanged(host, ids) {
    if (ids.length === 1) {
      host.selectParticipant(ids[0]);
      return;
    }
    if (!ids.length) {
      host.clearSelection();
      return;
    }
    host.closeDrillDown();
    host.scatterSelectedIds = ids.map(String);
    host.selection.sync(host.scatterSelectedIds);
    if (host.chart) host.chart.update('none');
    updateHeader(host);
    host.selection.dispatch([...host.scatterSelectedIds]);
  },

  /** The Clear selection gesture: the module's public clearSelection. */
  clearSelection(host) {
    host.clearSelection();
  },

  /** Restyle the scatter to the current trace and refresh the header. */
  highlight(host) {
    if (host.chart) host.chart.update('none');
    updateHeader(host);
  }
};

export default scatterView;
