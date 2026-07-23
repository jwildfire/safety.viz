// Treatment-arm discovery, placebo designation, left/right Sankey sides and the
// arm palettes for the safety.viz hepatic tools (obot.roadmap#43,
// safety.viz#91).
//
// The arm is structural for the bidirectional migration Sankey (Amirzadegan
// 2025 Fig 3) and the ALT waterfall (Fig 5): it decides which side of the
// pinned centre column a participant's flow leaves from, and which half of the
// waterfall their bar sits in. The failure mode this layer exists to prevent is
// the silent one — every participant collapsing into a single bucket and the
// chart rendering confidently wrong — so an arm that is designated neither
// placebo nor active resolves to NO side and is excluded with a counted note
// (HEP-ARM-004), never quietly pooled.
//
// Requirement groups: HEP-ARM-*, HEP-CORE-007.

/**
 * Column names searched for the treatment arm when `settings.arm_col` names a
 * column the data does not carry (HEP-ARM-001), in priority order.
 * @type {string[]}
 */
export const ARM_COL_CANDIDATES = ['ARM', 'ACTARM', 'TRT01A', 'TREATMENT'];

/**
 * Fixed semantic bar/ribbon colours per arm side (HWF-COLOR-001): placebo blue,
 * active bronze. Deliberately NOT the cycling group color scale, whose
 * index-based assignment would swap the two if the arm ordering changed.
 * @type {{placebo: string, active: string}}
 */
export const ARM_SIDE_COLORS = { placebo: '#1f78b4', active: '#b5651d' };

/**
 * Bar colour for a participant with new-onset jaundice (HWF-COLOR-002). Jaundice
 * OVERRIDES the arm colour in the waterfall, exactly as the paper's caption
 * describes, so the legend has to state the precedence out loud.
 * @type {string}
 */
export const JAUNDICE_COLOR = '#2e8b3d';

/** Matches the arm values that name themselves as the control arm. */
const PLACEBO_PATTERN = /placebo|control/i;

/** Arm values that ARE the control arm, rather than merely containing the word. */
const PLACEBO_EXACT = ['placebo', 'control'];

/**
 * Read one subject's arm value as a string: from the retained meta column when
 * a column is named, else from the subject's own resolved `arm` field. Missing
 * values normalize to '' so they can never be designated a side.
 * @param {Object} subject A hep subject (or any record with a `raw` bag).
 * @param {?string} armCol The retained meta column holding the arm, or null.
 * @returns {string} The arm value, or ''.
 * @private
 */
function armValue(subject, armCol) {
  if (!subject) return '';
  const value = armCol
    ? subject.raw && subject.raw[armCol] !== undefined
      ? subject.raw[armCol]
      : subject[armCol]
    : subject.arm;
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Resolve the column holding the treatment arm (HEP-ARM-001): `settings.arm_col`
 * when the data carries it, else the first of ARM_COL_CANDIDATES present in the
 * data. Returns null when `arm_col` is explicitly unset (arm handling disabled)
 * or when no candidate column is present — the caller then renders the
 * migration view's arm warning rather than throwing.
 * @param {Object[]} rows Raw or cleaned records.
 * @param {Object} settings Normalized settings.
 * @returns {?string} The resolved column name, or null.
 */
export function resolveArmCol(rows, settings) {
  const named = settings ? settings.arm_col : null;
  if (!named) return null;
  const data = Array.isArray(rows) ? rows : [];
  const present = (col) => data.some((row) => row && row[col] !== undefined);
  if (present(named)) return named;
  return ARM_COL_CANDIDATES.find(present) || null;
}

/**
 * The distinct arm values across a set of subjects (HEP-ARM-001), sorted so the
 * designation is stable no matter what order the data arrived in. Blank and
 * missing arms are dropped: they cannot be designated a side.
 * @param {Object[]} subjects Hep subjects, or any records carrying the arm.
 * @param {?string} [armCol] The retained meta column holding the arm; omit to
 *   read each subject's resolved `arm` field.
 * @returns {string[]} The distinct arm values, sorted.
 */
export function distinctArms(subjects, armCol) {
  const values = new Set();
  (subjects || []).forEach((subject) => {
    const value = armValue(subject, armCol);
    if (value !== '') values.add(value);
  });
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * Designate the placebo (left-hand) arm, reporting HOW it was reached
 * (HEP-ARM-002/003). Resolution order:
 *
 *   1. `configured` — the `placebo_arm` setting, when the data carries it.
 *   2. The single arm whose value IS 'placebo' or 'control' (case-insensitive,
 *      trimmed) — an exact match beats any substring match.
 *   3. The single arm whose name merely CONTAINS placebo/control.
 *   4. Otherwise null, with `ambiguous: true` when two or more arms matched and
 *      no exact match broke the tie.
 *
 * The exact-before-substring rule is not cosmetic. safety.viz's own demo dataset
 * carries five arms — 'CLD: Placebo', 'CLD: Study Drug', 'Placebo', 'Xanomeline
 * High Dose', 'Xanomeline Low Dose' — where 'CLD: Placebo' is a small synthetic
 * chronic-liver-disease cohort and 'Placebo' is the real control arm. Taking the
 * FIRST alphabetical substring match designated 'CLD: Placebo' as the comparator
 * and pushed every real placebo participant onto the ACTIVE side, which renders
 * the whole "does the drug arm shift upward more than placebo" comparison
 * confidently backwards. Exact match resolves it; a genuine tie is REPORTED so
 * the caller can tell the reviewer to set `placebo_arm` instead of handing them
 * a silently mis-sided chart.
 * @param {string[]} arms The distinct arm values.
 * @param {?string} configured The `placebo_arm` setting, or null.
 * @returns {{arm: ?string, ambiguous: boolean, candidates: string[], source: string}}
 *   The designation, the tie flag, the arms that matched the pattern, and how it
 *   was reached ('configured' | 'exact' | 'pattern' | 'none' | 'ambiguous').
 */
export function resolvePlaceboArmDetail(arms, configured) {
  const values = arms || [];
  const candidates = values.filter((arm) => PLACEBO_PATTERN.test(arm));
  if (configured && values.includes(String(configured))) {
    return { arm: String(configured), ambiguous: false, candidates, source: 'configured' };
  }
  const exact = values.filter((arm) => PLACEBO_EXACT.includes(String(arm).trim().toLowerCase()));
  if (exact.length === 1) {
    return { arm: exact[0], ambiguous: false, candidates, source: 'exact' };
  }
  if (candidates.length === 1) {
    return { arm: candidates[0], ambiguous: false, candidates, source: 'pattern' };
  }
  if (candidates.length > 1) {
    return { arm: null, ambiguous: true, candidates, source: 'ambiguous' };
  }
  return { arm: null, ambiguous: false, candidates, source: 'none' };
}

/**
 * Designate the placebo (left-hand) arm (HEP-ARM-002/003) — the value half of
 * `resolvePlaceboArmDetail`. Returns null both when nothing matches AND when
 * several arms match with no exact winner, so the Sankey degrades to a
 * unidirectional layout with a warning rather than inventing a comparator.
 * @param {string[]} arms The distinct arm values.
 * @param {?string} configured The `placebo_arm` setting, or null.
 * @returns {?string} The placebo arm value, or null.
 */
export function resolvePlaceboArm(arms, configured) {
  return resolvePlaceboArmDetail(arms, configured).arm;
}

/**
 * Map every arm value to its Sankey side AND report how the placebo side was
 * designated (HEP-CORE-007, HEP-ARM-002/003). Sides are 'placebo' (left),
 * 'active' (right), or null for an arm the settings designate as neither.
 * `active_arms` names the right side explicitly; when it is null every
 * non-placebo arm pools right, with the pooled arms named in the notes.
 *
 * When several arms match the placebo pattern and none is an exact match, NO arm
 * is designated placebo and `warning` carries a reviewer-facing sentence naming
 * the candidates — a view renders it as a `.sv-warning` so the reader is told to
 * set `placebo_arm`, rather than being handed a guess.
 * @param {string[]} arms The distinct arm values.
 * @param {Object} settings Normalized settings (`placebo_arm`, `active_arms`).
 * @returns {{sides: Map<string, ?string>, placeboArm: ?string, ambiguous: boolean, candidates: string[], warning: ?string}}
 */
export function resolveArmDesignation(arms, settings) {
  const values = arms || [];
  const detail = resolvePlaceboArmDetail(values, settings ? settings.placebo_arm : null);
  const placeboArm = detail.arm;
  const configuredActive = settings && settings.active_arms ? settings.active_arms : null;
  const active = configuredActive
    ? new Set((Array.isArray(configuredActive) ? configuredActive : [configuredActive]).map(String))
    : null;
  const sides = new Map(
    values.map((arm) => {
      if (placeboArm !== null && arm === placeboArm) return [arm, 'placebo'];
      if (active) return [arm, active.has(arm) ? 'active' : null];
      return [arm, 'active'];
    })
  );
  const warning = detail.ambiguous
    ? `Placebo arm is ambiguous: ${detail.candidates.join(', ')} all look like control arms. ` +
      'Set the placebo_arm setting to pick one; until then no arm is designated placebo.'
    : null;
  return { sides, placeboArm, ambiguous: detail.ambiguous, candidates: detail.candidates, warning };
}

/**
 * Map every arm value to its Sankey side (HEP-CORE-007) — the Map half of
 * `resolveArmDesignation`.
 * @param {string[]} arms The distinct arm values.
 * @param {Object} settings Normalized settings (`placebo_arm`, `active_arms`).
 * @returns {Map<string, ?string>} arm value -> 'placebo' | 'active' | null.
 */
export function resolveArmSides(arms, settings) {
  return resolveArmDesignation(arms, settings).sides;
}
