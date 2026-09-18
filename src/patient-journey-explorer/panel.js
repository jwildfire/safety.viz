// The anchor context side panel of the patient-journey-explorer module (#142,
// design §6.6, D8, D16, PC-17, PC-37). DOM only; consumes the ContextBundle
// (anchor.js) and prints every one of its honesty counters beside the count it
// qualifies, so a number never reads as more than the data supports.
//
// Every list row is a real button that jumps to the raw source row in the
// drawer (PJE-SRC-001). When a lane's row cap left some of a list's records
// undrawn, the section says so, so the panel count and the visible bar count
// are reconciled in the UI rather than left to disagree.

import { createElement } from '../shell.js';
import { DOMAIN_LABELS, dayLabel, ratioLine, spanLabel } from './getPlugins.js';
import { labBaseline } from './labs.js';

/** The standing sentence at the foot of the panel. */
export const CAUSATION_SENTENCE =
  'Co-occurrence is not causation. This panel lists what was recorded around the anchor; it does not assess relatedness.';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lowerDay = (text) => text.replace(/^Day\b/, 'day');

/**
 * One list row: a button naming the record, its detail line, and the source
 * anchor it jumps to.
 * @private
 */
function itemButton({ title, detail, anchorId, onJump }) {
  const li = document.createElement('li');
  const button = createElement('button', 'sv-pje-item');
  button.type = 'button';
  button.setAttribute('data-source-anchor', anchorId);
  button.append(document.createTextNode(title));
  if (detail) button.append(createElement('small', null, detail));
  button.title = 'Open the source record';
  button.onclick = () => onJump(anchorId);
  li.append(button);
  return li;
}

/**
 * A list of records, or its explicit empty state, plus the row-cap
 * reconciliation line when some listed records are not drawn (PC-17).
 * @private
 */
function itemList(parent, items, { emptyText, describe, drawnIds, onJump }) {
  if (!items.length) {
    parent.append(createElement('p', 'sv-pje-empty', emptyText));
    return;
  }
  const list = createElement('ul', 'sv-pje-items');
  for (const event of items) {
    const { title, detail } = describe(event);
    list.append(itemButton({ title, detail, anchorId: event.sourceAnchorId, onJump }));
  }
  parent.append(list);
  const notDrawn = items.filter((event) => !drawnIds.has(event.id)).length;
  if (notDrawn > 0) {
    parent.append(
      createElement(
        'p',
        'sv-pje-honesty',
        `${notDrawn} of these ${items.length} ${notDrawn === 1 ? 'is' : 'are'} not drawn on the timeline (row cap).`
      )
    );
  }
}

/**
 * The end-unrecorded sentence under the con-med heading (D16, final wording
 * per the 2026-09-18 resolution): all, some, or the one.
 * @private
 */
function endUnrecordedSentence(unrecorded, total) {
  if (unrecorded <= 0) return null;
  if (total === 1) {
    return 'This con-med has no recorded end date; it is shown as active because nothing records it stopping.';
  }
  if (unrecorded === total) {
    return `None of these ${total} has a recorded end date; they are shown as active because nothing records them stopping.`;
  }
  return `${unrecorded} of these ${total} have no recorded end date; they are shown as active because nothing records them stopping.`;
}

/**
 * Render the anchor context panel into the shell's rail (design §6.6): the
 * header with Expand and Clear anchor, the four context sections with counts,
 * explicit empty states and the honesty counters, the not-evaluated block, and
 * the standing causation sentence.
 * @param {HTMLElement} host The rail element (the shell's railWrap).
 * @param {import('./anchor.js').ContextBundle} context The current context bundle.
 * @param {Object} options Rendering options.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} options.settings The synced settings.
 * @param {string} options.mode The display mode (`'day'` or `'date'`).
 * @param {?string} options.refDate The subject's reference date, or null.
 * @param {Set<string>} options.drawnIds The ids of every event drawn on the timeline.
 * @param {Object[]} options.labPool The subject's lab EventRecords (for the baseline ratio).
 * @param {boolean} options.expanded Whether the rail is expanded.
 * @param {() => void} options.onClear Clear-anchor handler.
 * @param {(expanded: boolean) => void} options.onExpand Expand / collapse handler.
 * @param {(anchorId: string) => void} options.onJump Jump-to-source handler.
 * @returns {HTMLElement} The panel element.
 */
export function renderPanel(host, context, options) {
  const { settings, mode, refDate, drawnIds, labPool, expanded, onClear, onExpand, onJump } =
    options;
  const display = { mode, refDate };
  host.innerHTML = '';
  const panel = createElement('div', 'sv-pje-panel');

  // Header.
  const head = createElement('div', 'sv-pje-panel-head');
  const heading = createElement('div');
  const title = createElement('h2', 'sv-pje-panel-title', `Anchor: ${context.anchor.label}`);
  title.tabIndex = -1;
  const when = [DOMAIN_LABELS[context.anchor.domain] || context.anchor.domain];
  when.push(dayLabel(context.anchor.day, display));
  if (mode !== 'date' && context.anchor.date) when.push(context.anchor.date);
  when.push(`±${context.window.days} days`);
  heading.append(title, createElement('p', 'sv-pje-panel-sub', when.join(' · ')));
  const actions = createElement('div', 'sv-pje-panel-actions');
  const expand = createElement('button', 'sv-pje-btn', expanded ? 'Collapse' : 'Expand');
  expand.type = 'button';
  expand.setAttribute('data-sv-focus', 'rail-expand');
  expand.setAttribute('aria-pressed', String(Boolean(expanded)));
  expand.onclick = () => onExpand(!expanded);
  const clear = createElement('button', 'sv-pje-btn', 'Clear anchor');
  clear.type = 'button';
  clear.setAttribute('data-sv-focus', 'clear-anchor');
  clear.onclick = () => onClear();
  actions.append(expand, clear);
  head.append(heading, actions);
  panel.append(head);

  const body = createElement('div', 'sv-pje-panel-body');
  const section = (text, className = 'sv-pje-section') => {
    const el = createElement('section', className);
    el.append(createElement('h3', null, text));
    body.append(el);
    return el;
  };
  const common = { drawnIds, onJump };

  // 1. Con-meds active at the anchor, then those starting later in the window.
  const cm = section(`Con-meds active at the anchor (${context.counts.conMeds})`);
  cm.dataset.section = 'conMeds';
  const withoutStart = context.notEvaluated.conMedsWithoutStart;
  if (withoutStart > 0) {
    cm.append(
      createElement(
        'p',
        'sv-pje-honesty',
        `${plural(withoutStart, 'con-med')} ${withoutStart === 1 ? 'has' : 'have'} no start day and ${withoutStart === 1 ? 'was' : 'were'} not evaluated.`
      )
    );
  }
  const unrecorded = endUnrecordedSentence(
    context.notEvaluated.conMedsEndUnrecorded,
    context.counts.conMeds
  );
  if (unrecorded) cm.append(createElement('p', 'sv-pje-honesty', unrecorded));
  const describeConMed = (event) => ({
    title: event.label,
    detail: [spanLabel(event, display), event.category].filter(Boolean).join(' · ')
  });
  itemList(cm, context.conMeds, {
    ...common,
    emptyText: 'No con-meds were active at the anchor.',
    describe: describeConMed
  });
  const later = createElement('div');
  later.dataset.section = 'conMedsLater';
  later.append(
    createElement('h4', null, `Started later in the window (${context.counts.conMedsLater})`)
  );
  itemList(later, context.conMedsLater, {
    ...common,
    emptyText: 'None started later in the window.',
    describe: describeConMed
  });
  cm.append(later);

  // 2. Abnormal labs in the window: the ratio on every flag-based row (PC-37)
  //    and the baseline multiple when the change rule fired.
  const lb = section(`Abnormal labs in the window (${context.counts.abnormalLabs})`);
  lb.dataset.section = 'abnormalLabs';
  const baselines = new Map();
  const baselineFor = (test) => {
    if (!baselines.has(test)) {
      baselines.set(
        test,
        labBaseline(
          (labPool || []).filter((event) => event.test === test),
          settings
        )
      );
    }
    return baselines.get(test);
  };
  itemList(lb, context.abnormalLabs, {
    ...common,
    emptyText: 'No abnormal labs in the window.',
    describe: (event) => {
      const reason = event.flags.abnormalReason;
      const parts = [lowerDay(dayLabel(event.day, display))];
      const flag = String(event.flags.abnormal || '').trim();
      if (reason === 'flag' || reason === 'both') {
        const ratio = ratioLine(event);
        parts.push(flag ? `flagged ${flag}` : 'flagged');
        parts.push(ratio || 'no reference limit recorded');
      }
      if (reason === 'change' || reason === 'both') {
        const baseline = baselineFor(event.test);
        if (baseline && Number.isFinite(baseline.value) && baseline.value > 0) {
          const multiple = event.value / baseline.value;
          parts.push(
            `${multiple.toFixed(multiple >= 10 ? 0 : 1)} × baseline (${baseline.value}${event.unit ? ` ${event.unit}` : ''}, ${lowerDay(dayLabel(baseline.day, display))})`
          );
        }
      }
      return {
        title: `${event.test}: ${event.value}${event.unit ? ` ${event.unit}` : ''}`,
        detail: parts.join(' · ')
      };
    }
  });

  // 3. Dose changes in the window.
  const dose = section(`Dose changes in the window (${context.counts.doseChanges})`);
  dose.dataset.section = 'doseChanges';
  itemList(dose, context.doseChanges, {
    ...common,
    emptyText: 'No dose changes in the window.',
    describe: (event) => ({
      title: `${event.label}, ${lowerDay(dayLabel(event.day, display))}${event.flags.direction ? ` (${event.flags.direction})` : ''}`,
      detail: event.category
    })
  });

  // 4. Prior adverse events with the same preferred term, over the whole record.
  const prior = section(
    `Prior adverse events with the same preferred term (${context.counts.priorEvents})`
  );
  prior.dataset.section = 'priorEvents';
  prior.append(
    createElement('p', 'sv-pje-section-note', 'Any time before the anchor, not only in the window.')
  );
  itemList(prior, context.priorEvents, {
    ...common,
    emptyText: 'No prior adverse events with this preferred term.',
    describe: (event) => {
      const parts = [
        spanLabel(event, display),
        event.flags.severity ? event.flags.severity.label : 'severity not recorded'
      ];
      if (event.flags.serious) parts.push('SAE');
      return { title: event.label, detail: parts.join(' · ') };
    }
  });

  // Not evaluated: every remaining honesty counter, one line each, only when
  // non-zero (PC-30). The con-med counters are printed under their heading.
  const lines = [];
  const aeUnrecorded = context.notEvaluated.aeEndUnrecorded;
  if (aeUnrecorded > 0) {
    lines.push(
      `${plural(aeUnrecorded, 'adverse event')} in the window ${aeUnrecorded === 1 ? 'has' : 'have'} no recorded end and ${aeUnrecorded === 1 ? 'is' : 'are'} not asserted ongoing.`
    );
  }
  for (const [domain, count] of Object.entries(context.notEvaluated.unplaceableByDomain || {})) {
    if (!count || domain === 'CM') continue;
    const word = (DOMAIN_LABELS[domain] || domain).toLowerCase();
    lines.push(
      `${plural(count, `${word} record`)} ${count === 1 ? 'has' : 'have'} no usable study day and ${count === 1 ? 'was' : 'were'} not evaluated.`
    );
  }
  for (const [lane, count] of Object.entries(context.notEvaluated.truncatedByLane || {})) {
    if (!count) continue;
    const label = settings.lanes?.[lane]?.label || lane;
    lines.push(`${plural(count, 'row')} of ${label} not drawn (row cap).`);
  }
  if (lines.length) {
    const honesty = section('Not evaluated');
    honesty.dataset.section = 'notEvaluated';
    const list = createElement('ul', 'sv-pje-items');
    for (const line of lines) {
      const li = createElement('li', 'sv-pje-honesty', line);
      list.append(li);
    }
    honesty.append(list);
  }

  body.append(createElement('p', 'sv-pje-panel-foot', CAUSATION_SENTENCE));
  panel.append(body);
  host.append(panel);
  return panel;
}
