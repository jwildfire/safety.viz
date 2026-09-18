// The narrative kinds (#146): the skill slug the runtime addresses, the
// camelCase slot name the renderer's `narratives` settings block uses, and
// the text a card shows for each refusal reason (shared/refusal-catalog.md).

/** Skill slug → renderer slot name. */
export const NARRATIVE_KINDS = {
  'subject-summary': 'subjectSummary',
  'event-context': 'eventContext',
  'lab-trajectory': 'labTrajectory',
  'dose-journey': 'doseJourney',
  disposition: 'disposition'
};

/** Renderer slot name → skill slug. */
export const SLUG_BY_SLOT = Object.fromEntries(
  Object.entries(NARRATIVE_KINDS).map(([slug, slot]) => [slot, slug])
);

/** What a card says for each `refused:<reason>` flag. */
export const REFUSAL_TEXT = {
  'insufficient-data': 'Not enough recorded data to draft a narrative.',
  'anchor-not-found': 'The anchored event could not be found in the record.',
  'ambiguous-scope': 'The request matched more than one record; narrow it.',
  'disallowed-claim': 'A narrative here would need a claim this tool does not make.',
  validation: 'The draft did not pass validation and was withheld.',
  'provider-error': 'The narrative service did not answer.',
  'provider-refusal': 'The narrative service declined this request.',
  reidentification: 'This tool does not describe the person, only the record.',
  cancelled: ''
};

/**
 * The refusal reason of a draft, or null when it is not a refusal.
 * @param {Object} draft A narrative draft.
 * @returns {?string} The reason after `refused:`.
 */
export function refusalReason(draft) {
  const flag = (draft?.flags || []).find((entry) => String(entry).startsWith('refused:'));
  return flag ? String(flag).slice('refused:'.length) : null;
}
