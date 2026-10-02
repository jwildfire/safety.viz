// Portfolio app: the pre-filled mapping (#149, obot.roadmap#352). A user's
// file rarely names its columns the way the charts do. This module builds, for
// one domain, the mapping from each manifest column to the user's column, and
// from each key measure to what the user's data calls it — and records for
// every row how it was filled, because a guess the page does not label is the
// dangerous kind (design D2).
//
// Three sources, and no others:
//
//   same name   the user's column carries the manifest's name (any case), or a
//               measure carries the chart library's own default name
//   guessed     matched through the short lists of known alternatives below
//   chosen      set by hand on the page
//
// Nothing fuzzier is attempted: no edit distance, no substring match, no
// confidence number. A row the lists do not cover stays empty and the page
// says which charts need it.

/**
 * Known alternative names per manifest column, by domain: the SDTM and ADaM
 * spellings a study programmer's extract is most likely to carry. Order is
 * preference: the first one present is the guess.
 */
export const COLUMN_ALIASES = {
  subject: {
    USUBJID: ['SUBJID', 'SUBJECTID', 'SUBJECT'],
    ARM: ['TRT01A', 'TRT01P', 'TRTA', 'TRTP', 'ACTARM'],
    SITEID: ['SITE', 'SITENUM'],
    SEX: ['GENDER']
  },
  ae: {
    USUBJID: ['SUBJID', 'SUBJECTID', 'SUBJECT'],
    AEBODSYS: ['AESOC'],
    AEDECOD: ['AEPT'],
    ASTDY: ['AESTDY'],
    AENDY: ['AEENDY'],
    ARM: ['TRTA', 'TRT01A', 'TRTP', 'TRT01P', 'ACTARM'],
    AESEV: ['ASEV']
  },
  bds: {
    USUBJID: ['SUBJID', 'SUBJECTID', 'SUBJECT'],
    TEST: ['PARAM', 'LBTEST', 'VSTEST'],
    STRESN: ['AVAL', 'LBSTRESN', 'VSSTRESN'],
    STRESU: ['AVALU', 'LBSTRESU', 'VSSTRESU'],
    STNRLO: ['ANRLO', 'A1LO', 'LBSTNRLO'],
    STNRHI: ['ANRHI', 'A1HI', 'LBSTNRHI'],
    VISIT: ['AVISIT'],
    VISITNUM: ['AVISITN'],
    DY: ['ADY', 'LBDY', 'VSDY'],
    ARM: ['TRTA', 'TRT01A', 'TRTP', 'TRT01P', 'ACTARM'],
    SITEID: ['SITE', 'SITENUM'],
    SEX: ['GENDER']
  },
  eg: {
    USUBJID: ['SUBJID', 'SUBJECTID', 'SUBJECT'],
    TEST: ['PARAM', 'EGTEST'],
    STRESN: ['AVAL', 'EGSTRESN'],
    STRESU: ['AVALU', 'EGSTRESU'],
    ABLFL: ['EGBLFL'],
    ARM: ['TRTA', 'TRT01A', 'TRTP', 'TRT01P', 'ACTARM'],
    VISIT: ['AVISIT'],
    VISITNUM: ['AVISITN']
  }
};

/**
 * The key measures some charts find by name. `default` is the name the chart
 * library itself defaults to; `names` are the known alternatives, compared
 * after {@link normalizeName}. Order within a domain is the order the mapping
 * table lists them in.
 */
export const MEASURES = [
  {
    key: 'ALT',
    label: 'ALT',
    domain: 'bds',
    default: 'Aminotransferase, alanine (ALT)',
    names: ['Alanine Aminotransferase', 'ALT', 'SGPT', 'ALT (SGPT)']
  },
  {
    key: 'AST',
    label: 'AST',
    domain: 'bds',
    default: 'Aminotransferase, aspartate (AST)',
    names: ['Aspartate Aminotransferase', 'AST', 'SGOT', 'AST (SGOT)']
  },
  {
    key: 'TB',
    label: 'Total bilirubin',
    domain: 'bds',
    default: 'Total Bilirubin',
    names: ['Bilirubin', 'Bilirubin, total', 'TBIL', 'TBILI', 'BILI']
  },
  {
    key: 'ALP',
    label: 'Alkaline phosphatase',
    domain: 'bds',
    default: 'Alkaline phosphatase (ALP)',
    names: ['Alkaline Phosphatase', 'ALP', 'ALKPH', 'Alk Phos']
  },
  {
    key: 'CREAT',
    label: 'Creatinine',
    domain: 'bds',
    default: 'Creatinine',
    names: ['CREAT', 'Serum Creatinine', 'Creatinine, serum']
  },
  {
    key: 'QTcF',
    label: 'QTcF',
    domain: 'eg',
    default: 'QTcF',
    names: ['QTcF Interval, Aggregate', 'QTcF Interval', 'QTCFAG']
  },
  {
    key: 'QTcB',
    label: 'QTcB',
    domain: 'eg',
    default: 'QTcB',
    names: ['QTcB Interval, Aggregate', 'QTcB Interval', 'QTCBAG']
  },
  {
    key: 'HR',
    label: 'Heart rate',
    domain: 'eg',
    default: 'Heart Rate',
    names: ['ECG Mean Heart Rate', 'Mean Heart Rate', 'HR', 'EGHRMN']
  }
];

const EMPTY = Object.freeze({ value: null, source: null });

/**
 * Reduce a measure name to what is compared: lower case, with any bracketed
 * group (a unit, an abbreviation) and all punctuation and spacing removed, so
 * "Alanine Aminotransferase (U/L)" and "alanine aminotransferase" agree.
 * @param {string} name A measure name as the data or a list spells it.
 * @returns {string} The comparable form.
 */
export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Find the user's column for one manifest column: the same name first, in any
 * case, then the domain's known alternatives in order.
 * @param {string[]} columns The user's column names.
 * @param {string} domainId The manifest domain the file is placed in.
 * @param {string} column The manifest column to fill.
 * @returns {{value: ?string, source: ?string}} The user's column and how it was found, or an empty row.
 */
export function resolveColumn(columns, domainId, column) {
  const byUpper = new Map(columns.map((name) => [String(name).toUpperCase(), name]));
  if (byUpper.has(column.toUpperCase())) {
    return { value: byUpper.get(column.toUpperCase()), source: 'same name' };
  }
  const aliases = (COLUMN_ALIASES[domainId] || {})[column] || [];
  for (const alias of aliases) {
    if (byUpper.has(alias)) return { value: byUpper.get(alias), source: 'guessed' };
  }
  return { ...EMPTY };
}

/**
 * Find what the data calls one key measure among the measure column's values:
 * the chart library's default name first, then the known alternatives in order.
 * @param {string[]} values The distinct values of the measure column.
 * @param {Object} measure An entry of {@link MEASURES}.
 * @returns {{value: ?string, source: ?string}} The data's name for the measure and how it was found, or an empty row.
 */
export function resolveMeasure(values, measure) {
  if (values.includes(measure.default)) return { value: measure.default, source: 'same name' };
  const byName = new Map();
  for (const value of values) {
    const name = normalizeName(value);
    if (name && !byName.has(name)) byName.set(name, value);
  }
  for (const candidate of [measure.default, ...measure.names]) {
    const match = byName.get(normalizeName(candidate));
    if (match !== undefined) return { value: match, source: 'guessed' };
  }
  return { ...EMPTY };
}

/**
 * The user's column a mapping reads measure names from.
 * @param {Object} mapping A mapping from {@link buildMapping}.
 * @returns {?string} The mapped measure column, or null when it is unmapped or the domain has none.
 */
export function measureColumn(mapping) {
  return mapping.columns.TEST ? mapping.columns.TEST.value : null;
}

/**
 * The distinct non-blank values of one column, in first-seen order.
 * @param {Object[]} rows The file's records.
 * @param {?string} column The column to read; null yields none.
 * @returns {string[]} The distinct values.
 */
export function distinctValues(rows, column) {
  if (!column) return [];
  const seen = new Set();
  for (const row of rows) {
    const value = row[column];
    if (value !== undefined && value !== '') seen.add(value);
  }
  return [...seen];
}

/**
 * Look every key measure of a domain up among the measure column's values. A
 * measure the user chose by hand is kept while its value is still present.
 * @param {string} domainId The manifest domain.
 * @param {string[]} values The distinct values of the mapped measure column.
 * @param {Object} [previous={}] The measures of the mapping being replaced.
 * @returns {Object<string, {value: ?string, source: ?string}>} One row per key measure of the domain.
 * @private
 */
function resolveMeasures(domainId, values, previous = {}) {
  return Object.fromEntries(
    MEASURES.filter((measure) => measure.domain === domainId).map((measure) => {
      const before = previous[measure.key];
      if (before && before.source === 'chosen' && values.includes(before.value)) {
        return [measure.key, before];
      }
      return [measure.key, resolveMeasure(values, measure)];
    })
  );
}

/**
 * Build the pre-filled mapping for one file placed in one domain: a row per
 * manifest column and a row per key measure of that domain, each with the
 * user's value and how it was filled.
 * @param {string} domainId The manifest domain the file is placed in.
 * @param {{columns: string[], rows: Object[]}} file The parsed file.
 * @param {Object} manifest The portfolio manifest.
 * @returns {{domain: string, columns: Object, measures: Object}} The mapping.
 */
export function buildMapping(domainId, file, manifest) {
  const columns = Object.fromEntries(
    Object.keys(manifest.domains[domainId].columns).map((column) => [
      column,
      resolveColumn(file.columns, domainId, column)
    ])
  );
  const mapping = { domain: domainId, columns, measures: {} };
  mapping.measures = resolveMeasures(domainId, distinctValues(file.rows, measureColumn(mapping)));
  return mapping;
}

/**
 * Set one column row by hand. Returns a new mapping; the row is marked chosen,
 * or emptied when the value is null. Changing the measure column looks the key
 * measures up again in the new column.
 * @param {Object} mapping The mapping to change.
 * @param {string} column The manifest column.
 * @param {?string} value The user's column, or null to clear the row.
 * @param {{rows: Object[]}} file The parsed file, read when the measure column changes.
 * @returns {Object} The changed mapping.
 */
export function setColumn(mapping, column, value, file) {
  const next = {
    ...mapping,
    columns: { ...mapping.columns, [column]: value ? { value, source: 'chosen' } : { ...EMPTY } }
  };
  if (column === 'TEST') {
    next.measures = resolveMeasures(
      mapping.domain,
      distinctValues(file.rows, measureColumn(next)),
      mapping.measures
    );
  }
  return next;
}

/**
 * Set one key-measure row by hand. Returns a new mapping.
 * @param {Object} mapping The mapping to change.
 * @param {string} key The measure key (ALT, CREAT, QTcF, ...).
 * @param {?string} value What the data calls the measure, or null to clear the row.
 * @returns {Object} The changed mapping.
 */
export function setMeasure(mapping, key, value) {
  return {
    ...mapping,
    measures: { ...mapping.measures, [key]: value ? { value, source: 'chosen' } : { ...EMPTY } }
  };
}
