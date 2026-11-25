// Demo app: the study builder's rules, with no document in them. The Build a
// study tab (builder-view.js) asks a reader a few facts about a trial, and R
// in the browser has gsm.datasim simulate it (site/builder/builder.R). This
// module is what the form may hold, what R is asked for, and the sentences.
//
// What the form asks is what gsm.datasim can take. Participants, sites and
// months shape the data. So does the outlier dial. Phase and therapeutic area
// do not: gsm.datasim draws both at random and neither changes a row, so here
// a phase fills in a typical size, which the reader may change, and both are
// written into the study file as chosen. The tab says so.

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';
const counted = (count, noun) =>
  `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;

/** The tab's address in the app. */
export const BUILDER_TAB_ID = 'build';

/** The limits of each number the form asks for; site/builder/builder.R holds the same. */
export const BUILDER_LIMITS = Object.freeze({
  participants: Object.freeze({ min: 20, max: 500 }),
  sites: Object.freeze({ min: 2, max: 100 }),
  months: Object.freeze({ min: 3, max: 12 })
});

/**
 * The phases, each with the size it fills in. `id` is what gsm's study file
 * says of a phase.
 */
export const BUILDER_PHASES = Object.freeze([
  Object.freeze({ id: 'P1', label: 'Phase 1', participants: 40, sites: 4, months: 6 }),
  Object.freeze({ id: 'P2', label: 'Phase 2', participants: 150, sites: 20, months: 9 }),
  Object.freeze({ id: 'P3', label: 'Phase 3', participants: 500, sites: 60, months: 12 }),
  Object.freeze({ id: 'P4', label: 'Phase 4', participants: 300, sites: 40, months: 12 })
]);

/** The therapeutic areas gsm.datasim names. */
export const BUILDER_AREAS = Object.freeze(['Oncology', 'Virology', 'Inflammation']);

/** gsm.datasim's outlier dial, as three settings. */
export const BUILDER_OUTLIERS = Object.freeze([
  Object.freeze({ id: 'few', label: 'Few outliers', intensity: 0.5 }),
  Object.freeze({ id: 'typical', label: 'Typical', intensity: 1 }),
  Object.freeze({ id: 'many', label: 'Many outliers', intensity: 2.5 })
]);

/** What the form holds before the reader changes it. */
export const BUILDER_DEFAULTS = Object.freeze({
  name: 'BUILT-001',
  phase: 'P2',
  area: 'Oncology',
  participants: '150',
  sites: '20',
  months: '9',
  outliers: 'typical',
  seed: ''
});

/** What the tab says it changes or leaves out, one sentence each. */
export const BUILDER_CAVEATS = Object.freeze([
  'Every row is synthetic, made by gsm.datasim. No real participant or site is in it.',
  'Phase and therapeutic area are labels. gsm.datasim does not shape the data by either, so a phase only fills in a typical size, which you can change.',
  'Only the study’s last monthly snapshot is loaded: as gsm’s raw files for the RBQM tab, and as three standard files (participants, adverse events, vital signs) for the other charts.',
  'gsm.datasim makes no lab results, only toxicity grades, so the Labs and vitals charts draw its eight vital signs. Their units are the ones its averages are in; it states none.',
  'Adverse event terms are gsm.datasim’s placeholders (term1, soc1). Severity is the toxicity grade in words: 1 mild, 2 moderate, 3 or more severe.',
  'Study days count from the first dose, or from enrolment for a participant with none.',
  'gsm.datasim makes no treatment arms and no ECGs. Charts that compare arms show one group, All participants.',
  'Site ids are written SITE1234 where gsm.datasim writes 0X1234, which R would read back as a number.'
]);

/**
 * The form with a phase chosen: the phase, and the size it fills in.
 * @param {Object} form The form's values.
 * @param {string} phase A phase's id.
 * @returns {Object} The form's values after the choice; unchanged when the id names no phase.
 */
export function withPhase(form, phase) {
  const preset = BUILDER_PHASES.find((entry) => entry.id === phase);
  if (!preset) return { ...form };
  return {
    ...form,
    phase: preset.id,
    participants: String(preset.participants),
    sites: String(preset.sites),
    months: String(preset.months)
  };
}

/** A whole number a field holds, or null when it holds anything else. */
function whole(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * Read the form: every problem with it, each a sentence, and, when there is
 * none, what R is asked for.
 * @param {Object} form The form's values, each as the field holds it.
 * @returns {{problems: string[], args: ?Object}} The problems, and the arguments of `builder_run` less the simulator's folder.
 */
export function readForm(form) {
  const given = isRecord(form) ? form : {};
  const problems = [];
  const numbers = {};
  for (const [field, label] of [
    ['participants', 'Participants'],
    ['sites', 'Sites'],
    ['months', 'Months']
  ]) {
    const { min, max } = BUILDER_LIMITS[field];
    const number = whole(given[field]);
    if (number === null || number < min || number > max) {
      problems.push(`${label} must be a whole number from ${min} to ${max}.`);
    } else numbers[field] = number;
  }
  if (
    numbers.participants !== undefined &&
    numbers.sites !== undefined &&
    numbers.sites > numbers.participants
  ) {
    problems.push('Sites must be no more than participants.');
  }
  if (!isText(given.name)) problems.push('The study needs a name.');
  const phase = BUILDER_PHASES.find((entry) => entry.id === given.phase);
  if (!phase) problems.push('Choose a phase.');
  if (!BUILDER_AREAS.includes(given.area)) problems.push('Choose a therapeutic area.');
  const outliers = BUILDER_OUTLIERS.find((entry) => entry.id === given.outliers);
  if (!outliers) problems.push('Choose how many outliers.');
  const seedText = String(given.seed ?? '').trim();
  const seed = seedText === '' ? null : whole(seedText);
  if (seedText !== '' && (seed === null || seed > 2147483647)) {
    problems.push('The seed must be a whole number, or left empty.');
  }
  if (problems.length) return { problems, args: null };
  return {
    problems,
    args: {
      study_name: given.name.trim(),
      participants: numbers.participants,
      sites: numbers.sites,
      months: numbers.months,
      outlier_intensity: outliers.intensity,
      phase: phase.id,
      therapeutic_area: given.area,
      // A seed left empty is not sent: R then draws as it will.
      ...(seed === null ? {} : { seed })
    }
  };
}

/**
 * The files R returned, as the app loads raw files: each a name and its text.
 * @param {Object} answer What `builder_run` returned.
 * @param {string} [key] Which of its lists: `files`, gsm's raw files, or `standard`, the standard domains' files.
 * @returns {?Array<{name: string, text: string, rows: number}>} The files, or null when the answer does not hold any that can be read.
 */
export function builtFiles(answer, key = 'files') {
  const files = isRecord(answer) && Array.isArray(answer[key]) ? answer[key] : null;
  if (!files || !files.length) return null;
  const read = [];
  for (const file of files) {
    if (!isRecord(file) || !isText(file.name) || typeof file.text !== 'string' || !file.text) {
      return null;
    }
    read.push({ name: file.name, text: file.text, rows: Number(file.rows) || 0 });
  }
  return read;
}

/**
 * One sentence for a study that was built.
 * @param {Object} answer What `builder_run` returned.
 * @param {Object} args What R was asked for, as `readForm` gave it.
 * @returns {string} The sentence.
 */
export function builtSaid(answer, args) {
  const phase = BUILDER_PHASES.find((entry) => entry.id === args.phase);
  const version = isRecord(answer) && isText(answer.simulator) ? ` ${answer.simulator}` : '';
  const id = isRecord(answer) && isText(answer.study_id) ? answer.study_id : args.study_name;
  const seconds =
    isRecord(answer) && Number.isFinite(Number(answer.seconds))
      ? ` in ${counted(Number(answer.seconds), 'second')}`
      : '';
  return (
    `${id} is a simulated ${phase ? phase.label : 'study'} ${args.therapeutic_area} study: ` +
    `${counted(args.participants, 'participant')} at ${counted(args.sites, 'site')} over ` +
    `${counted(args.months, 'month')}, made by gsm.datasim${version} in this browser${seconds}. ` +
    'Every row is synthetic.'
  );
}

/**
 * What pressing Build downloads the first time, in a sentence.
 * @param {Array<{what: string, host: ?string, megabytes: number}>} downloads What starting R downloads; a null host is the page's own address.
 * @returns {string} The sentence, or '' when nothing is listed.
 */
export function downloadsSaid(downloads) {
  const list = Array.isArray(downloads) ? downloads.filter(isRecord) : [];
  if (!list.length) return '';
  const total = Math.round(list.reduce((sum, entry) => sum + (Number(entry.megabytes) || 0), 0));
  const hosts = [...new Set(list.map((entry) => entry.host).filter(isText))];
  const from = hosts.length ? ` from ${hosts.join(' and ')}` : '';
  return (
    `The first build starts R in this browser and downloads about ${total} MB${from}. ` +
    'Later builds reuse it. The study is made here and is sent nowhere.'
  );
}
