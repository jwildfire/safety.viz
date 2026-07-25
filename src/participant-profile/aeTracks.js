// The two adverse-event tracks of the participant profile (obot.roadmap#75,
// design decisions D5/D6/D7): a summary block — four figures, a severity mix
// bar and a body-system rollup, deliberately not a chart — and a timeline of
// one row per event drawn on the same study-day domain as the labs chart above
// it, so a rise in ALT and the event that may explain it sit on the same
// vertical.
//
// The block renders directly under the labs chart and before the measure table
// (D5), which is why the two time tracks can share an edge as well as an axis.
// All bar placement comes from ae.js's pure geometry, so this file only turns
// percentages into DOM.
//
// Requirement groups: PPRF-AESUM-* (summary), PPRF-AETL-* (timeline).

import { createElement } from '../shell.js';
import { summarizeAe, timelineGeometry, axisTicks } from './ae.js';

/** Gutters matching the spaghetti chart's plot area (see spaghetti.js PLOT_GUTTER). */
export const PLOT_GUTTER_LEFT = 56;
export const PLOT_GUTTER_RIGHT = 12;

/**
 * Render the four headline figures (PPRF-AESUM-001). The severity tile carries
 * a colour dot beside its label — never the colour alone.
 * @param {Object} summary The summarizeAe reduction.
 * @returns {HTMLElement} The tile row.
 * @private
 */
function renderTiles(summary) {
  const wrap = createElement('div', 'sv-profile-ae-tiles');
  const tiles = [
    { label: 'Events', value: String(summary.total) },
    { label: 'Highest severity', value: summary.worst.label, color: summary.worst.color },
    {
      label: 'Serious',
      value: String(summary.serious),
      color: summary.serious ? summary.worst.color : null
    },
    { label: 'No end date', value: String(summary.openEnded) }
  ];
  tiles.forEach((tile) => {
    const node = createElement('div', 'sv-profile-ae-tile');
    const value = createElement('div', 'sv-profile-ae-tile-value');
    if (tile.color) {
      const dot = createElement('span', 'sv-profile-ae-dot');
      dot.style.background = tile.color;
      value.append(dot);
    }
    value.append(createElement('span', null, tile.value));
    node.append(value, createElement('div', 'sv-profile-ae-tile-label', tile.label));
    wrap.append(node);
  });
  return wrap;
}

/**
 * Render the severity mix bar and its legend (PPRF-AESUM-002). Segments are
 * proportional; each level is named in the legend so severity never depends on
 * hue alone.
 * @param {Object} summary The summarizeAe reduction.
 * @returns {HTMLElement} The mix block.
 * @private
 */
function renderMix(summary) {
  const wrap = createElement('div', 'sv-profile-ae-mix-wrap');
  const bar = createElement('div', 'sv-profile-ae-mix');
  bar.setAttribute('role', 'img');
  bar.setAttribute(
    'aria-label',
    `Severity mix: ${summary.mix.map((entry) => `${entry.label} ${entry.count}`).join(', ')}`
  );
  summary.mix.forEach((entry) => {
    const segment = createElement('div', 'sv-profile-ae-mix-seg');
    segment.style.flexGrow = String(entry.count);
    segment.style.background = entry.color;
    segment.title = `${entry.label}: ${entry.count}`;
    bar.append(segment);
  });
  const legend = createElement('div', 'sv-profile-ae-legend');
  summary.mix.forEach((entry) => {
    const item = createElement('span', 'sv-profile-ae-legend-item');
    const dot = createElement('span', 'sv-profile-ae-dot');
    dot.style.background = entry.color;
    item.append(dot, createElement('span', null, `${entry.label} ${entry.count}`));
    legend.append(item);
  });
  wrap.append(bar, legend);
  return wrap;
}

/**
 * Render the body-system rollup (PPRF-AESUM-003): the systems this participant
 * has events in, most first, with counts.
 * @param {Object} summary The summarizeAe reduction.
 * @param {number} [limit=4] Systems listed before the rest are folded away.
 * @returns {HTMLElement} The rollup block.
 * @private
 */
function renderBodySystems(summary, limit = 4) {
  const wrap = createElement('div', 'sv-profile-ae-soc-wrap');
  wrap.append(createElement('div', 'sv-profile-ae-track-label', 'Body systems'));
  const list = createElement('ul', 'sv-profile-ae-soc');
  summary.bodySystems.slice(0, limit).forEach((entry) => {
    const item = createElement('li');
    item.append(
      createElement('span', 'sv-profile-ae-soc-name', entry.name),
      createElement('span', 'sv-profile-ae-soc-count', String(entry.count))
    );
    list.append(item);
  });
  wrap.append(list);
  const rest = summary.bodySystems.length - limit;
  if (rest > 0) {
    wrap.append(
      createElement(
        'p',
        'sv-profile-ae-more',
        `${rest} more body system${rest === 1 ? '' : 's'} not listed.`
      )
    );
  }
  return wrap;
}

/**
 * The accessible sentence for one event's bar.
 * @param {Object} event A cleaned event.
 * @returns {string} The description.
 * @private
 */
function eventDescription(event) {
  const parts = [event.__ae_verbatim || event.__ae_term, event.__ae_severity.label];
  if (event.__ae_serious) parts.push('serious');
  const end = event.__ae_open ? 'no end date recorded' : `day ${event.__ae_end}`;
  parts.push(event.__ae_placeable ? `day ${event.__ae_start} to ${end}` : 'no start day recorded');
  return parts.join(' · ');
}

/**
 * Render the timeline: one row per event on the shared domain (PPRF-AETL-001).
 * The term rides above its own bar rather than in a left gutter — the gutter is
 * only as wide as the lab chart's y-axis, which truncates MedDRA terms, and
 * starting the label at the onset makes it carry information rather than just
 * name the row.
 * @param {Object[]} events The participant's events, in row order.
 * @param {?number[]} domain The shared day domain.
 * @param {Object} settings Normalized AE settings (for max_rows).
 * @returns {HTMLElement} The timeline block.
 * @private
 */
function renderTimeline(events, domain, settings) {
  const wrap = createElement('div', 'sv-profile-ae-timeline');
  wrap.style.paddingLeft = `${PLOT_GUTTER_LEFT}px`;
  wrap.style.paddingRight = `${PLOT_GUTTER_RIGHT}px`;

  const placeable = events.filter((event) => event.__ae_placeable);
  const shown = placeable.slice(0, settings.max_rows);
  const geometry = timelineGeometry(shown, domain);

  const plot = createElement('div', 'sv-profile-ae-plot');
  shown.forEach((event, index) => {
    const bars = geometry[index];
    if (!bars) return;
    const row = createElement('div', 'sv-profile-ae-row');
    const term = createElement('div', 'sv-profile-ae-term');
    term.textContent =
      event.__ae_term +
      (event.__ae_serious ? ' · serious' : '') +
      (event.__ae_open ? ' · no end date' : '');
    // Labels start at the onset, but flip to right-aligned when the onset is so
    // late that the term would run off the rail.
    if (bars.left > 55) {
      term.classList.add('is-flipped');
      term.style.right = `${100 - bars.left - bars.width}%`;
      term.style.maxWidth = `${bars.left + bars.width}%`;
    } else {
      term.style.left = `${bars.left}%`;
      term.style.maxWidth = `${100 - bars.left}%`;
    }

    const bar = createElement('div', 'sv-profile-ae-bar');
    bar.style.left = `${bars.left}%`;
    bar.style.width = `${bars.width}%`;
    bar.style.background = event.__ae_severity.color;
    if (bars.open) bar.classList.add('is-open-ended');
    if (bars.clipped) bar.classList.add('is-clipped');
    if (event.__ae_serious) bar.classList.add('is-serious');
    const description = eventDescription(event);
    bar.title = description;
    term.title = description;
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', description);

    row.append(term, bar);
    plot.append(row);
  });
  wrap.append(plot);

  const axis = createElement('div', 'sv-profile-ae-axis');
  axisTicks(domain).forEach((tick) => {
    const label = createElement('span', 'sv-profile-ae-tick', String(Math.round(tick.value)));
    label.style.left = `${tick.position}%`;
    axis.append(label);
  });
  wrap.append(axis);

  const hidden = placeable.length - shown.length;
  if (hidden > 0) {
    wrap.append(
      createElement(
        'p',
        'sv-profile-ae-more',
        `${hidden} more event${hidden === 1 ? '' : 's'} not drawn — see the record listing.`
      )
    );
  }

  // Events with no usable start day cannot be placed on a day axis, so they are
  // named here rather than dropped without trace.
  const unplaceable = events.filter((event) => !event.__ae_placeable);
  if (unplaceable.length) {
    const note = createElement(
      'p',
      'sv-profile-ae-unplaceable',
      `No start day recorded, so not on the timeline: ${unplaceable
        .map((event) => event.__ae_term)
        .join(', ')}.`
    );
    wrap.append(note);
  }

  return wrap;
}

/**
 * Render the adverse-event block for one participant (PPRF-AESUM-001,
 * PPRF-AETL-001): summary first, then the timeline on the shared axis. Returns
 * the section element so the caller places it — the profile inserts it directly
 * after the labs chart (design decision D5).
 * @param {Object[]} events The participant's cleaned events, in row order.
 * @param {?number[]} domain The shared day domain, or null when no study day resolves.
 * @param {Object} settings Normalized AE settings.
 * @returns {HTMLElement} The adverse-events section.
 */
export function renderAeTracks(events, domain, settings) {
  const section = createElement('section', 'sv-profile-ae');
  section.setAttribute('aria-label', 'Adverse events');
  section.append(createElement('h3', 'sv-profile-ae-title', 'Adverse events'));

  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    section.append(
      createElement(
        'p',
        'sv-profile-ae-empty',
        'No adverse events recorded for this participant.'
      )
    );
    return section;
  }

  const summary = summarizeAe(list, settings);
  section.append(renderTiles(summary));
  section.append(renderMix(summary));

  if (!domain) {
    // Without a study day there is no shared clock to draw against, and
    // inventing one would be worse than saying so (design decision D7).
    section.append(
      createElement(
        'p',
        'sv-profile-ae-empty',
        'No study day resolves for this participant’s laboratory records, so the event timeline is not drawn.'
      )
    );
  } else {
    section.append(
      createElement(
        'div',
        'sv-profile-ae-track-label',
        'Timeline, on the labs chart’s study-day axis'
      )
    );
    section.append(renderTimeline(list, domain, settings));
  }

  section.append(renderBodySystems(summary));
  return section;
}
