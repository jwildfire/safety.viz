// Input normalization for the patient-journey-explorer module (#142, design
// §3.3, §4.1, §5.1, §5.2). Pure.
//
// Two jobs: (1) split either init form — an object of per-domain arrays, or
// one merged array carrying a domain column — into the same upper-case-keyed
// domain map; (2) turn each domain's raw rows into EventRecords, dropping
// malformed rows with an exact, counted reason and keeping rows with no
// usable day as "unplaceable" (drawn nowhere, named in prose — PJE-LANE-008).
//
// The raw row is retained BY REFERENCE and never mutated (PJE-DATA-006); every
// derived value lives on the record beside it. Dropped rows are copies
// carrying the reason and domain under `__pje_*` columns so the CSV export
// leads with why (PJE-DATA-003).
//
// End handling is three-state (D16): a resolved end is `closed`; a blank end is
// `ongoing` only when the domain's outcome column says so, otherwise
// `unrecorded`; an end before the start is a data error kept as a single-day
// mark and flagged, never converted into an open interval (PJE-DATA-008).

import { arrayify } from '../histogram/configure.js';
import { datePart, resolveEventDate } from './getScales.js';

/** Column added to every dropped or flagged row copy: why the row left the chart. */
export const DROP_REASON_COLUMN = '__pje_dropReason';

/** Column added to every dropped or flagged row copy: which domain it belonged to. */
export const DROP_DOMAIN_COLUMN = '__pje_domain';

/** The six domains, in lane order. */
export const DOMAINS = ['EX', 'AE', 'LB', 'CM', 'MH', 'DS'];

/** Lane key per domain; dose changes share domain EX and are derived later. */
export const LANE_BY_DOMAIN = {
  EX: 'exposure',
  AE: 'adverseEvents',
  LB: 'labs',
  CM: 'conMeds',
  MH: 'medicalHistory',
  DS: 'disposition'
};

const SYNONYMS = {
  ADAE: 'AE',
  ADLB: 'LB',
  ADEX: 'EX',
  ADCM: 'CM',
  ADMH: 'MH',
  ADDS: 'DS',
  ADSL: 'DS'
};
const DERIVED_PREFIX = '__pje_';

/**
 * One normalized event: one per usable source row, plus one per derived dose
 * change (structureData.js). Frozen by convention — the renderer reads it and
 * never writes to it after construction.
 * @typedef {Object} EventRecord
 * @property {string} id `${domain}-${sourceIndex}`; dose changes use `DOSE-<exIndex>`.
 * @property {string} domain `'EX'|'AE'|'LB'|'CM'|'MH'|'DS'`.
 * @property {string} lane Lane key (`doseChanges` and `exposure` share domain EX).
 * @property {string} subject The participant id, trimmed.
 * @property {string} kind `'interval'` (EX, AE, CM) | `'point'` (LB, MH, DOSE) | `'rule'` (DS).
 * @property {?number} start Start study day; null when unusable.
 * @property {?number} end End study day; null when no end resolves.
 * @property {string} endState `'closed'` | `'ongoing'` | `'unrecorded'` (D16).
 * @property {boolean} open `endState !== 'closed'` — a geometry convenience only; no clinical text or count may read it.
 * @property {?number} day Point day for `'point'`/`'rule'`; `=== start` for `'interval'`.
 * @property {boolean} placeable False when no usable day resolves — kept, not drawn.
 * @property {boolean} clippedStart True when a pre-study start was clamped for drawing (structureData.js).
 * @property {?string} dayCol Which column in the fallback chain resolved `start`/`day` (D15).
 * @property {?string} date Full ISO date when one resolves (§5.9), else null.
 * @property {?string} endDate Full ISO end date for a closed interval, else null.
 * @property {string} rawDate The `--DTC` cell exactly as recorded (may be partial), or ''.
 * @property {boolean} dateConflict True when a full recorded date disagreed with the study day and lost (PJE-TIME-004).
 * @property {?string} refDate The row's own reference date (study day 1) when its `time.ref_date_col` cell is a full date, else null.
 * @property {string} label Display label (per-domain rules, §5.2).
 * @property {string} detail Secondary tooltip text (verbatim term, dose, value + unit, …).
 * @property {string} category SOC | ATC class | lab test | DSCAT | EXTRT.
 * @property {?number} value LB numeric result; EX dose; DOSE new dose.
 * @property {string} unit LB / EX unit.
 * @property {string} outcome The outcome / ongoing-indicator cell as recorded (AE, CM), for the tooltip's terminal phrase.
 * @property {?string} test LB only: the test name.
 * @property {?string} testCode LB only: the test code.
 * @property {?number} lln LB only: lower limit of normal.
 * @property {?number} uln LB only: upper limit of normal.
 * @property {Object} flags `{ severity: {key,label,rank}|null, serious, related, abnormal, abnormalReason, derived, direction, reference? }`.
 * @property {string[]} flagged Data-quality flags raised for this record (end before start), empty normally.
 * @property {Object} source The exact raw object the host passed.
 * @property {number} sourceIndex The row's index within its domain array.
 * @property {string} sourceAnchorId `pje-src-<DOMAIN>-<sourceIndex>`, the id of its row in the source drawer.
 */

const isBlank = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && (value.trim() === '' || /^na$/i.test(value.trim())));
const text = (value) => (isBlank(value) ? '' : String(value).trim());
const upper = (value) => text(value).toUpperCase();

/**
 * Parse a numeric cell: blank, 'NA' and non-finite values are null.
 * @private
 */
function parseNumber(value) {
  if (isBlank(value)) return null;
  const n = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isFinite(n) ? n : null;
}

/**
 * First column in a chain whose cell parses to a finite number.
 * @private
 */
function resolveNumber(row, chain) {
  for (const column of arrayify(chain).map(String)) {
    const value = parseNumber(row[column]);
    if (value !== null) return { value, column };
  }
  return { value: null, column: null };
}

/**
 * First non-blank cell in a chain, as recorded.
 * @private
 */
function resolveText(row, chain) {
  for (const column of arrayify(chain).map(String)) {
    if (!isBlank(row[column])) return String(row[column]).trim();
  }
  return '';
}

const titleCase = (value) =>
  text(value)
    .toLowerCase()
    .replace(/(^|[\s/-])(\S)/g, (match, lead, char) => lead + char.toUpperCase());

/**
 * `'ae' | 'AE' | 'adae' -> 'AE'`; anything else -> null.
 * @param {*} value A domain key or a domain-column cell.
 * @returns {?string} The domain code, or null.
 */
export function detectDomain(value) {
  const code = upper(value);
  if (DOMAINS.includes(code)) return code;
  return SYNONYMS[code] || null;
}

const emptyDomains = () => Object.fromEntries(DOMAINS.map((domain) => [domain, []]));
const droppedCopy = (row, reason, domain) => ({
  ...(row && typeof row === 'object' ? row : {}),
  [DROP_REASON_COLUMN]: reason,
  [DROP_DOMAIN_COLUMN]: domain
});

/**
 * Split either init form into the per-domain row map. An array is form B (a
 * merged array read through `settings.domain_col`); any other object is form A
 * (per-domain arrays under case-insensitive keys); anything else is empty.
 * Caller arrays are kept by reference; rows are never mutated.
 * @param {Object|Object[]} data The init data.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {{domains: Object<string, Object[]>, dropped: Object[], form: 'object'|'array'}} The domain map, the rows dropped for an unusable domain, and which form was detected.
 */
export function normalizeInput(data, settings) {
  const domains = emptyDomains();
  const dropped = [];
  if (Array.isArray(data)) {
    const domainCol = settings?.domain_col ?? 'DOMAIN';
    for (const row of data) {
      const cell = row && typeof row === 'object' ? row[domainCol] : undefined;
      const domain = detectDomain(cell);
      if (!domain) {
        dropped.push(droppedCopy(row, `unrecognized domain "${text(cell)}"`, ''));
        continue;
      }
      domains[domain].push(row);
    }
    return { domains, dropped, form: 'array' };
  }
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const domain = detectDomain(key);
      if (!domain) {
        console.warn(
          `patient-journey-explorer: unknown domain key "${key}" was ignored; the known keys are ${DOMAINS.join(', ')}.`
        );
        continue;
      }
      if (!Array.isArray(value)) {
        dropped.push(droppedCopy(null, `domain "${key}" is not an array`, domain));
        continue;
      }
      if (domains[domain].length) {
        console.warn(
          `patient-journey-explorer: domain ${domain} was supplied twice ("${key}"); the later key was ignored.`
        );
        continue;
      }
      domains[domain] = value;
    }
  }
  return { domains, dropped, form: 'object' };
}

/**
 * The columns of the dropped-row export: the reason first, then the domain,
 * then the union of source columns in first-seen order with the module's own
 * `__pje_*` columns left out (PJE-DATA-003).
 * @param {Object[]} rows The dropped rows.
 * @returns {string[]} The column names, in order; empty for no rows.
 */
export function droppedRowColumns(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const seen = new Set();
  const source = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (key.startsWith(DERIVED_PREFIX) || seen.has(key)) continue;
      seen.add(key);
      source.push(key);
    }
  }
  return [DROP_REASON_COLUMN, DROP_DOMAIN_COLUMN, ...source];
}

/**
 * Resolve an interval's start, end and terminal state (D16, PJE-DATA-008).
 * @private
 */
function resolveInterval(row, settings, prefix, endChainKey) {
  const startRes = resolveNumber(row, settings[`${prefix}_stdy_col`]);
  const endRes = resolveNumber(row, settings[endChainKey]);
  const outCol = settings[`${prefix}_out_col`];
  const outcome = outCol ? text(row[outCol]) : '';
  const ongoingValues = settings[`${prefix}_ongoing_values`] || [];
  const start = startRes.value;
  let end = startRes.value === null ? null : endRes.value;
  let endState;
  let flag = null;
  if (start !== null && end !== null && end >= start) {
    endState = 'closed';
  } else {
    if (start !== null && end !== null && end < start) {
      flag = `end day ${endRes.column} (${end}) precedes start day (${start})`;
      end = null;
      endState = 'unrecorded';
    } else {
      end = null;
      endState =
        outcome && ongoingValues.includes(outcome.toUpperCase()) ? 'ongoing' : 'unrecorded';
    }
  }
  return { start, end, endState, dayCol: startRes.column, outcome, flag };
}

/**
 * Severity flag: rank within `ae_severity_values` (1-based), rank 0 for a
 * value outside the list, null for a blank cell.
 * @private
 */
function severityFlag(value, settings) {
  const key = upper(value);
  if (!key) return null;
  const rank = settings.ae_severity_values.map((v) => v.toUpperCase()).indexOf(key) + 1;
  return { key, label: titleCase(key), rank };
}

/**
 * Per-domain field derivation. Returns null to drop the row (with `reason`
 * set on the returned object instead) — see the drop table in design §5.1.
 * @private
 */
function deriveFields(row, domain, settings) {
  const s = settings;
  switch (domain) {
    case 'EX': {
      const trt = text(row[s.ex_trt_col]);
      const dose = parseNumber(row[s.ex_dose_col]);
      if (!trt && isBlank(row[s.ex_dose_col])) {
        return {
          reason: `missing exposure treatment and dose (${s.ex_trt_col}, ${s.ex_dose_col})`
        };
      }
      const unit = text(row[s.ex_dosu_col]);
      const interval = resolveInterval(row, s, 'ex', 'ex_endy_col');
      const doseText = [dose === null ? text(row[s.ex_dose_col]) : String(dose), unit]
        .filter(Boolean)
        .join(' ');
      const dayText =
        interval.start === null
          ? ''
          : interval.end === null
            ? `from day ${interval.start}`
            : `days ${interval.start}–${interval.end}`;
      return {
        kind: 'interval',
        ...interval,
        rawDate: resolveText(row, s.ex_stdtc_col),
        label: trt,
        detail: [doseText, dayText].filter(Boolean).join(' '),
        category: trt,
        value: dose,
        unit
      };
    }
    case 'AE': {
      const term = text(row[s.ae_term_col]);
      const decod = text(row[s.ae_decod_col]);
      if (!term && !decod) {
        return { reason: `missing adverse-event term (${s.ae_term_col}, ${s.ae_decod_col})` };
      }
      const label = decod || term;
      const interval = resolveInterval(row, s, 'ae', 'ae_endy_col');
      return {
        kind: 'interval',
        ...interval,
        rawDate: resolveText(row, s.ae_stdtc_col),
        label,
        detail: term && term !== label ? term : '',
        category: text(row[s.ae_soc_col]),
        flags: {
          severity: severityFlag(row[s.ae_sev_col], s),
          serious: upper(row[s.ae_ser_col]) === String(s.ae_serious_value).toUpperCase(),
          related: text(row[s.ae_rel_col])
        }
      };
    }
    case 'LB': {
      const test = text(row[s.lb_test_col]);
      if (!test) return { reason: `missing lab test name (${s.lb_test_col})` };
      const value = parseNumber(row[s.lb_value_col]);
      if (value === null) {
        return {
          reason: `non-numeric result (${s.lb_value_col} = "${text(row[s.lb_value_col])}")`
        };
      }
      const dayRes = resolveNumber(row, s.lb_day_col);
      const unit = text(row[s.lb_unit_col]);
      const lln = parseNumber(row[s.lb_lo_col]);
      const uln = parseNumber(row[s.lb_hi_col]);
      const range = lln !== null && uln !== null ? ` (${lln}–${uln}${unit ? ` ${unit}` : ''})` : '';
      return {
        kind: 'point',
        start: dayRes.value,
        end: null,
        endState: 'closed',
        dayCol: dayRes.column,
        rawDate: resolveText(row, s.lb_dtc_col),
        label: [String(value), unit].filter(Boolean).join(' '),
        detail: `${test}${range}`,
        category: test,
        test,
        testCode: text(row[s.lb_testcd_col]),
        value,
        unit,
        lln,
        uln,
        flags: { abnormal: upper(row[s.lb_nrind_col]) }
      };
    }
    case 'CM': {
      const trt = text(row[s.cm_trt_col]);
      if (!trt) return { reason: `missing con-med name (${s.cm_trt_col})` };
      const interval = resolveInterval(row, s, 'cm', 'cm_endy_col');
      return {
        kind: 'interval',
        ...interval,
        rawDate: resolveText(row, s.cm_stdtc_col),
        label: trt,
        detail: [text(row[s.cm_dose_col]), text(row[s.cm_route_col])].filter(Boolean).join(' '),
        category: text(row[s.cm_class_col])
      };
    }
    case 'MH': {
      const term = text(row[s.mh_term_col]);
      const decod = text(row[s.mh_decod_col]);
      if (!term && !decod) {
        return { reason: `missing medical-history term (${s.mh_term_col}, ${s.mh_decod_col})` };
      }
      const onsetSource = s.mh_day_source === 'onset';
      const collection = resolveNumber(row, s.mh_day_col);
      const onset = resolveNumber(row, s.mh_onset_stdy_col);
      const onsetDtc = resolveText(row, s.mh_onset_dtc_col);
      const placed = onsetSource ? onset : collection;
      const strtpt = text(row[s.mh_strtpt_col]);
      const onsetText =
        onset.value !== null
          ? `day ${onset.value}`
          : onsetDtc
            ? onsetDtc
            : strtpt
              ? strtpt.toUpperCase() === 'BEFORE'
                ? 'before study'
                : strtpt.toLowerCase()
              : 'not recorded';
      const stillPresent = upper(row[s.mh_enrtpt_col]) === 'ONGOING';
      return {
        kind: 'point',
        start: placed.value,
        end: null,
        endState: 'closed',
        dayCol: placed.column,
        rawDate: onsetSource ? onsetDtc : '',
        label: decod || term,
        detail:
          `recorded day ${collection.value === null ? 'not recorded' : collection.value}; onset ${onsetText}` +
          (stillPresent ? '; still present' : ''),
        category: text(row[s.mh_cat_col])
      };
    }
    case 'DS': {
      const decod = text(row[s.ds_decod_col]);
      if (!decod) return { reason: `missing disposition decode (${s.ds_decod_col})` };
      const term = text(row[s.ds_term_col]);
      const dayRes = resolveNumber(row, s.ds_stdy_col);
      const cat = text(row[s.ds_cat_col]);
      const cats = s.ds_reference_cats || [];
      return {
        kind: 'rule',
        start: dayRes.value,
        end: null,
        endState: 'closed',
        dayCol: dayRes.column,
        rawDate: resolveText(row, s.ds_dtc_col),
        label: decod,
        detail: term && term !== decod ? term : '',
        category: cat,
        flags: { reference: cats.length === 0 || cats.includes(cat.toUpperCase()) }
      };
    }
    default:
      return null;
  }
}

/**
 * Normalize one domain's rows into EventRecords, dropping malformed rows with
 * an exact reason (the drop table in design §5.1) and flagging — but keeping —
 * rows whose end day precedes their start (PJE-DATA-008). Rows with no usable
 * day are kept with `placeable: false` (PJE-LANE-008).
 * @param {Object[]} rows The domain's raw rows, in their final array order.
 * @param {string} domain The domain code (`'AE'`, …).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {{events: EventRecord[], dropped: Object[], flagged: Object[]}} The records, the dropped-row copies, and the flagged-row copies (each carrying the reason and domain columns).
 */
export function normalizeDomain(rows, domain, settings) {
  const events = [];
  const dropped = [];
  const flagged = [];
  if (!DOMAINS.includes(domain) || !Array.isArray(rows)) return { events, dropped, flagged };
  const lane = LANE_BY_DOMAIN[domain];
  const refCol = settings?.time?.ref_date_col;
  rows.forEach((row, index) => {
    const source = row && typeof row === 'object' ? row : {};
    const subject = text(source[settings.id_col]);
    if (!subject) {
      dropped.push(droppedCopy(row, `missing participant id (${settings.id_col})`, domain));
      return;
    }
    const fields = deriveFields(source, domain, settings);
    if (!fields || fields.reason) {
      dropped.push(droppedCopy(row, fields ? fields.reason : 'unknown domain', domain));
      return;
    }
    const { flag, flags: domainFlags, ...rest } = fields;
    const start = rest.start;
    const record = {
      id: `${domain}-${index}`,
      domain,
      lane,
      subject,
      kind: rest.kind,
      start,
      end: rest.end,
      endState: rest.endState,
      open: rest.endState !== 'closed',
      day: start,
      placeable: start !== null,
      clippedStart: false,
      dayCol: rest.dayCol,
      date: null,
      endDate: null,
      rawDate: rest.rawDate || '',
      dateConflict: false,
      refDate: datePart(source[refCol]),
      label: rest.label,
      detail: rest.detail || '',
      category: rest.category || '',
      value: rest.value === undefined ? null : rest.value,
      unit: rest.unit || '',
      outcome: rest.outcome || '',
      test: rest.test ?? null,
      testCode: rest.testCode ?? null,
      lln: rest.lln ?? null,
      uln: rest.uln ?? null,
      flags: {
        severity: null,
        serious: false,
        related: '',
        abnormal: '',
        abnormalReason: '',
        derived: false,
        direction: null,
        ...domainFlags
      },
      flagged: flag ? [flag] : [],
      source: row,
      sourceIndex: index,
      sourceAnchorId: `pje-src-${domain}-${index}`
    };
    if (flag) flagged.push(droppedCopy(row, flag, domain));
    events.push(resolveEventDate(record, record.refDate));
  });
  return { events, dropped, flagged };
}
