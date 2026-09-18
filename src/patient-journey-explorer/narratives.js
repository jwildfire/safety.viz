// The AI narrative cards of the patient-journey-explorer module (#146,
// obot.roadmap#351, PJE-NARR-009 … 014). DOM only: the orchestrator owns the
// entries (which narrative is requested, its draft, its scope hash) and this
// file turns one entry into one light-blue "AI narrative" card — a labelled
// region, a one-line blurb, the full draft behind a toggle, a `Draft — AI
// generated` chip on every sentence, clickable citation chips, the stale
// notice with Regenerate, and the reviewer actions that only emit events.
//
// Nothing here calls a model, stores anything, or marks a draft accepted:
// acceptance arrives from the host through refreshNarrative() as a draft
// whose status is `accepted`, and the chip changes to say so (design §8).

import { createElement } from '../shell.js';
import { REFUSAL_TEXT, refusalReason } from '../patientJourneyNarratives/kinds.js';

/** The card label (@jwildfire's UX guidance, 2026-09-18). */
export const CARD_LABEL = 'AI narrative';
/** The per-sentence chip until a reviewer accepts (design §2). */
export const DRAFT_CHIP = 'Draft — AI generated';
/** The chip once the host passes the draft back as accepted. */
export const ACCEPTED_CHIP = 'Accepted';
/** The stale notice (PJE-NARR-012). */
export const STALE_NOTICE =
  'The rows under this narrative changed since it was drafted; regenerate before relying on it.';
/** The standing caution at the foot of every card. */
export const CARD_CAUTION =
  'An AI draft from the recorded rows, not a clinical assessment. Co-occurrence is not causation.';

const TITLES = {
  'subject-summary': 'Participant summary',
  'event-context': 'Event context',
  'lab-trajectory': 'Lab trajectory',
  'dose-journey': 'Dose journey',
  disposition: 'Disposition'
};

/**
 * The card title for an entry: the kind, plus the anchor term or test.
 * @param {Object} entry A narrative entry.
 * @returns {string} The title.
 */
export function cardTitle(entry) {
  const base = TITLES[entry.kind] || entry.kind;
  if (entry.kind === 'event-context' && entry.label) return `${base}: ${entry.label}`;
  if (entry.kind === 'lab-trajectory' && entry.label) return `${base}: ${entry.label}`;
  return base;
}

/**
 * The chip text of a draft by its status.
 * @private
 */
function chipText(draft) {
  if (draft.status === 'accepted') return ACCEPTED_CHIP;
  if (draft.status === 'edited') return 'Draft — edited';
  if (draft.status === 'rejected') return 'Rejected';
  return DRAFT_CHIP;
}

/**
 * One citation chip: a real button that lights the cited mark (click) or
 * opens its source row (Shift+click).
 * @private
 */
function citationChip(rowId, describe, onCite) {
  const info = describe ? describe(rowId) : null;
  const button = createElement('button', 'sv-pje-ai-cite', info && info.label ? info.label : rowId);
  button.type = 'button';
  button.dataset.rowId = rowId;
  if (info && info.onTimeline === false) button.classList.add('is-off-timeline');
  button.title =
    `${rowId}${info && info.label ? ` — ${info.label}` : ''}. ` +
    (info && info.onTimeline === false
      ? 'Not on the timeline right now; click to open its source record.'
      : 'Click to light this mark on the timeline; Shift+click to open its source record.');
  button.setAttribute(
    'aria-label',
    `Citation ${rowId}${info && info.label ? `, ${info.label}` : ''}`
  );
  button.onclick = (event) => onCite(rowId, { jump: Boolean(event.shiftKey) });
  return button;
}

/**
 * One sentence block: chip, text, citations.
 * @private
 */
function sentenceBlock(sentence, draft, index, { describe, onCite }) {
  const p = createElement('p', 'sv-pje-ai-sentence');
  p.dataset.index = String(index);
  p.dataset.confidence = sentence.confidence || '';
  const chip = createElement('span', 'sv-pje-ai-chip', chipText(draft));
  chip.classList.toggle('is-accepted', draft.status === 'accepted');
  p.append(chip, document.createTextNode(` ${sentence.text} `));
  const cites = createElement('span', 'sv-pje-ai-cites');
  cites.setAttribute('aria-label', 'Citations');
  for (const rowId of sentence.citations || []) cites.append(citationChip(rowId, describe, onCite));
  p.append(cites);
  if (sentence.confidence) {
    const conf = createElement('span', 'sv-pje-ai-conf', `confidence ${sentence.confidence}`);
    p.append(conf);
  }
  return p;
}

/**
 * The provenance line at the foot of a card.
 * @private
 */
function provenanceLine(draft) {
  const prov = draft.provenance || {};
  const parts = [];
  if (prov.model) parts.push(prov.model);
  if (prov.skill) parts.push(prov.skill);
  if (prov.generated_at) parts.push(prov.generated_at.replace('T', ' ').replace(/\.\d+Z$/, 'Z'));
  if (Array.isArray(prov.tool_calls)) parts.push(`${prov.tool_calls.length} tool calls`);
  if (prov.input_hash) parts.push(prov.input_hash.slice(0, 19));
  const line = createElement('p', 'sv-pje-ai-prov', parts.join(' · '));
  if (prov.input_hash) line.title = prov.input_hash;
  return line;
}

/**
 * Render one narrative entry as a card.
 * @param {Object} entry `{ kind, slot, subject, key, label, status: 'loading'|'ready'|'error', draft, stale, expanded, collapsible, error }`.
 * @param {Object} handlers `describe(rowId) → { label, onTimeline }`, `onCite(rowId, { jump })`, `onAction(type, entry, extra)`, `onToggle(entry, expanded)`, `onEditSave(entry, sentences)`.
 * @returns {HTMLElement} The card.
 */
export function renderNarrativeCard(entry, handlers) {
  const { describe, onCite, onAction, onToggle } = handlers;
  const card = createElement('section', 'sv-pje-ai');
  card.dataset.kind = entry.kind;
  card.dataset.status = entry.status;
  if (entry.key) card.dataset.key = entry.key;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', `${CARD_LABEL}: ${cardTitle(entry)}`);
  card.classList.toggle('is-stale', Boolean(entry.stale));
  card.classList.toggle('is-loading', entry.status === 'loading');
  card.classList.toggle('is-collapsed', Boolean(entry.collapsible && !entry.expanded));

  const head = createElement('div', 'sv-pje-ai-head');
  head.append(
    createElement('span', 'sv-pje-ai-label', CARD_LABEL),
    createElement('span', 'sv-pje-ai-title', cardTitle(entry))
  );
  const draft = entry.draft;
  if (draft && draft.status === 'accepted') {
    head.append(createElement('span', 'sv-pje-ai-chip is-accepted', ACCEPTED_CHIP));
  } else if (entry.status === 'ready') {
    head.append(createElement('span', 'sv-pje-ai-chip', DRAFT_CHIP));
  }
  let toggle = null;
  if (entry.collapsible && entry.status === 'ready') {
    toggle = createElement(
      'button',
      'sv-pje-ai-toggle',
      entry.expanded ? 'Hide full narrative' : 'Show full narrative'
    );
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(Boolean(entry.expanded)));
    toggle.setAttribute('data-sv-focus', `ai-toggle-${entry.slot}`);
    toggle.onclick = () => onToggle(entry, !entry.expanded);
    head.append(toggle);
  }
  card.append(head);

  if (entry.status === 'loading') {
    card.setAttribute('aria-busy', 'true');
    card.append(
      createElement('p', 'sv-pje-ai-summary is-pending', 'Drafting from the recorded rows…')
    );
    return card;
  }
  if (entry.status === 'error' || !draft) {
    card.append(
      createElement(
        'p',
        'sv-pje-ai-summary is-refused',
        entry.error || 'The narrative could not be drafted.'
      )
    );
    const actions = createElement('div', 'sv-pje-ai-actions');
    actions.append(actionButton('regenerate', 'Regenerate', entry, onAction));
    card.append(actions);
    return card;
  }

  const refusal = refusalReason(draft);
  const summary = createElement(
    'p',
    `sv-pje-ai-summary${refusal ? ' is-refused' : ''}`,
    refusal
      ? REFUSAL_TEXT[refusal] || draft.summary || `Narrative withheld (${refusal}).`
      : draft.summary || ''
  );
  card.append(summary);

  const body = createElement('div', 'sv-pje-ai-body');
  body.id = `${entry.id}-body`;
  if (toggle) toggle.setAttribute('aria-controls', body.id);
  body.hidden = Boolean(entry.collapsible && !entry.expanded);

  if (entry.stale) {
    body.append(createElement('p', 'sv-pje-ai-stale', STALE_NOTICE));
  }
  if (!refusal) {
    if (entry.editing) {
      body.append(editForm(entry, handlers));
    } else {
      draft.sentences.forEach((sentence, index) =>
        body.append(sentenceBlock(sentence, draft, index, { describe, onCite }))
      );
      if (!draft.sentences.length) {
        body.append(createElement('p', 'sv-pje-empty', 'The draft has no sentences.'));
      }
    }
  }
  const flags = (draft.flags || []).filter((flag) => !String(flag).startsWith('refused:'));
  if (flags.length) {
    const list = createElement('p', 'sv-pje-ai-flags');
    for (const flag of flags) list.append(createElement('span', 'sv-pje-ai-flag', flag));
    body.append(list);
  }

  if (!entry.editing) {
    const actions = createElement('div', 'sv-pje-ai-actions');
    if (!refusal && draft.status !== 'accepted') {
      actions.append(actionButton('accept', 'Accept', entry, onAction));
      actions.append(actionButton('reject', 'Reject', entry, onAction));
      actions.append(actionButton('edit', 'Edit', entry, onAction));
    }
    actions.append(actionButton('regenerate', 'Regenerate', entry, onAction));
    body.append(actions);
  }
  body.append(provenanceLine(draft));
  body.append(createElement('p', 'sv-pje-ai-foot', CARD_CAUTION));
  card.append(body);
  return card;
}

/**
 * A reviewer action button.
 * @private
 */
function actionButton(type, label, entry, onAction) {
  const button = createElement('button', `sv-pje-btn sv-pje-ai-action is-${type}`, label);
  button.type = 'button';
  button.dataset.action = type;
  button.setAttribute('data-sv-focus', `ai-${type}-${entry.slot}`);
  button.onclick = () => onAction(type, entry);
  return button;
}

/**
 * The in-place edit form: one textarea per sentence, Save emits `edit`.
 * @private
 */
function editForm(entry, { onEditSave, onAction }) {
  const form = createElement('div', 'sv-pje-ai-edit');
  const areas = entry.draft.sentences.map((sentence, index) => {
    const wrap = createElement('label', 'sv-pje-ai-edit-row');
    wrap.append(createElement('span', 'sv-pje-ai-chip', `Sentence ${index + 1}`));
    const area = document.createElement('textarea');
    area.className = 'sv-pje-ai-textarea';
    area.rows = 2;
    area.value = sentence.text;
    area.setAttribute('aria-label', `Edit sentence ${index + 1}`);
    wrap.append(area);
    form.append(wrap);
    return { area, sentence };
  });
  const actions = createElement('div', 'sv-pje-ai-actions');
  const save = createElement('button', 'sv-pje-btn sv-pje-ai-action is-save', 'Save edits');
  save.type = 'button';
  save.dataset.action = 'save';
  save.onclick = () =>
    onEditSave(
      entry,
      areas.map(({ area, sentence }) => ({ ...sentence, text: area.value.trim() }))
    );
  const cancel = createElement('button', 'sv-pje-btn sv-pje-ai-action is-cancel', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.action = 'cancel';
  cancel.onclick = () => onAction('cancel-edit', entry);
  actions.append(save, cancel);
  form.append(actions);
  return form;
}

/**
 * The on-demand control shown on a lane before its narrative is requested.
 * @param {Object} spec `{ slot, label, focusKey }`.
 * @param {() => void} onRequest Click handler.
 * @returns {HTMLElement} The control.
 */
export function renderNarrativeRequest(spec, onRequest) {
  const wrap = createElement('div', 'sv-pje-ai-request');
  const button = createElement('button', 'sv-pje-btn sv-pje-ai-request-btn', spec.label);
  button.type = 'button';
  button.dataset.slot = spec.slot;
  button.setAttribute('data-sv-focus', spec.focusKey);
  button.onclick = () => onRequest();
  wrap.append(createElement('span', 'sv-pje-ai-label', CARD_LABEL), button);
  return wrap;
}
