// Lab series model for the patient-journey-explorer module (#142, design
// §4.2, §5.7, D17, D28). Pure.
//
// One LabSeries per configured test: the placeable points in day order, the
// reference band, the baseline and the padded value domain. Three rules live
// here and nowhere else:
//
//   Baseline is FLAG FIRST (D17): the analysis baseline the data owner already
//   derived (`lb_baseline_flag_col`) wins; the last value on or before
//   `lb_baseline_day` is the fallback; the earliest value is the last resort.
//   Ties break on the SMALLER sourceIndex — study day 1 is the first dosing
//   day, so a same-day tie must resolve to the earlier record. `rule` says
//   which step fired so the panel and the guide can say so (PJE-DERIV-002).
//
//   Abnormality is flag OR change (PJE-CTX-002): a present normal-range
//   indicator other than the configured normal value (a blank indicator is
//   unknown, not abnormal), or a value at least `lb_change_factor` times — or
//   at most 1/factor of — the baseline. The change rule is symmetric (D28): a
//   halving is as much a change as a doubling.
//
//   The reference ratio picks its limit by direction (PC-29): `× ULN` above
//   the range, `× LLN` below it, and no ratio at all rather than a wrong
//   denominator when the relevant limit does not resolve.

import { arrayify } from '../histogram/configure.js';
import { toElapsed } from './getScales.js';

/**
 * One lab test's series for the labs lane (design §4.2).
 * @typedef {Object} LabSeries
 * @property {string} test The test name (`lb_test_col`), the small multiple's title.
 * @property {string} testCode The test code (`lb_testcd_col`), or ''.
 * @property {string} unit The result unit, from the first point that carries one.
 * @property {Array<{day: number, elapsed: number, value: number, lln: ?number, uln: ?number, nrind: string, event: import('./normalize.js').EventRecord}>} points The placeable points in day order, then sourceIndex.
 * @property {?{day: number, value: number, event: import('./normalize.js').EventRecord, rule: 'flag'|'day'|'earliest'}} baseline The resolved baseline, or null when no usable point exists.
 * @property {?[number, number]} domain The SHARED elapsed-day domain the lane draws over — not the test's own.
 * @property {[number, number]} valueDomain The padded value range, including the reference band.
 * @property {Array<{day: number, lln: number, uln: number}>} band The reference range at each point where both limits resolve.
 */

const upper = (value) =>
  value === null || value === undefined ? '' : String(value).trim().toUpperCase();
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const RATIO_EPSILON = 1e-9;
const HIGH_FLAGS = ['HIGH', 'HH', 'H'];
const LOW_FLAGS = ['LOW', 'LL', 'L'];

/**
 * The event behind a candidate, which may be an EventRecord or a LabSeries
 * point wrapping one.
 * @private
 */
function eventOf(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate.event && typeof candidate.event === 'object' ? candidate.event : candidate;
}

/**
 * Usable baseline candidates: placeable points with a finite value.
 * @private
 */
function usable(points) {
  return arrayify(points)
    .map(eventOf)
    .filter(
      (event) => event && event.placeable !== false && finite(event.day) && finite(event.value)
    );
}

/**
 * The candidate with the greatest (or smallest) day, ties on the smaller
 * sourceIndex.
 * @private
 */
function pick(candidates, latest) {
  let best = null;
  for (const event of candidates) {
    if (!best) {
      best = event;
      continue;
    }
    const better = latest ? event.day > best.day : event.day < best.day;
    const tie = event.day === best.day && event.sourceIndex < best.sourceIndex;
    if (better || tie) best = event;
  }
  return best;
}

/**
 * Baseline for one lab test, flag first (D17): (1) the latest point whose
 * `lb_baseline_flag_col` cell equals `lb_baseline_flag_value`; (2) otherwise
 * the latest point on or before `lb_baseline_day`; (3) otherwise the earliest
 * point. Ties at every level break on the smaller sourceIndex.
 * @param {Array<Object>} points The test's EventRecords, or LabSeries points wrapping them (any order).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {?{day: number, value: number, event: Object, rule: 'flag'|'day'|'earliest'}} The baseline, or null when no usable point exists.
 */
export function labBaseline(points, settings) {
  const candidates = usable(points);
  if (!candidates.length) return null;
  const flagCol = settings?.lb_baseline_flag_col;
  const flagValue = upper(settings?.lb_baseline_flag_value ?? 'Y');
  let rule = 'flag';
  let chosen = null;
  if (flagCol && flagValue) {
    chosen = pick(
      candidates.filter((event) => upper(event.source?.[flagCol]) === flagValue),
      true
    );
  }
  if (!chosen) {
    rule = 'day';
    const baselineDay = Number(settings?.lb_baseline_day);
    const cutoff = Number.isFinite(baselineDay) ? baselineDay : 1;
    chosen = pick(
      candidates.filter((event) => event.day <= cutoff),
      true
    );
  }
  if (!chosen) {
    rule = 'earliest';
    chosen = pick(candidates, false);
  }
  return { day: chosen.day, value: chosen.value, event: chosen, rule };
}

/**
 * Flag-based abnormality: the normal-range indicator is present and is not
 * the configured normal value. A blank indicator is unknown, not abnormal.
 * @param {Object} event A lab EventRecord.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {boolean} True when the indicator marks the point abnormal.
 */
export function isAbnormalByFlag(event, settings) {
  const flag = upper(event?.flags?.abnormal);
  if (!flag || /^NA$/.test(flag)) return false;
  return flag !== upper(settings?.lb_normal_value ?? 'NORMAL');
}

/**
 * Change-based abnormality (D28, symmetric): the value is at least
 * `lb_change_factor` times the baseline, or at most 1/factor of it. A missing,
 * zero, negative or non-finite baseline disables the rule.
 * @param {Object} event A lab EventRecord.
 * @param {?{value: number}} baseline The test's baseline (labBaseline).
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {boolean} True when the change rule fires.
 */
export function isAbnormalByChange(event, baseline, settings) {
  const value = event?.value;
  const base = baseline?.value;
  if (!finite(value) || !finite(base) || base <= 0) return false;
  const factor = Number(settings?.lb_change_factor);
  const f = Number.isFinite(factor) && factor > 1 ? factor : 2;
  // Inclusive on both arms; the epsilon keeps a value that IS exactly 1/factor
  // of its baseline from missing the gate on floating-point rounding.
  const ratio = value / base;
  return ratio >= f - RATIO_EPSILON || ratio <= 1 / f + RATIO_EPSILON;
}

/**
 * The ratio a clinician reads, with the limit chosen by direction (PC-29):
 * `value / uln` for a HIGH/HH indicator or a value above the upper limit,
 * `value / lln` for a LOW/LL indicator or a value below the lower limit. No
 * ratio when the relevant limit is missing or zero, or the point is in range.
 * @param {Object} event A lab EventRecord.
 * @returns {?{ratio: number, limit: 'ULN'|'LLN'}} The ratio and the limit it used, or null.
 */
export function referenceRatio(event) {
  if (!event || !finite(event.value)) return null;
  const flag = upper(event.flags?.abnormal);
  const { value, lln, uln } = event;
  const high = HIGH_FLAGS.includes(flag) || (finite(uln) && value > uln);
  const low = !high && (LOW_FLAGS.includes(flag) || (finite(lln) && value < lln));
  if (high) return finite(uln) && uln !== 0 ? { ratio: value / uln, limit: 'ULN' } : null;
  if (low) return finite(lln) && lln !== 0 ? { ratio: value / lln, limit: 'LLN' } : null;
  return null;
}

/**
 * The configured test list, upper-cased, or [] for "every test".
 * @private
 */
function configuredTests(settings) {
  return arrayify(settings?.lb_tests).map(upper).filter(Boolean);
}

/**
 * Whether a lab event is one of the configured `lb_tests`, matched against
 * the test name OR the test code, case-insensitively. An empty list matches
 * every test.
 * @param {Object} event A lab EventRecord.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {boolean} True when the event's test is drawn.
 */
export function matchesConfiguredTest(event, settings) {
  if (!event || typeof event !== 'object') return false;
  const tests = configuredTests(settings);
  if (!tests.length) return true;
  return tests.includes(upper(event.test)) || tests.includes(upper(event.testCode));
}

/**
 * The order the lab small multiples render in: the configured `lb_tests`
 * order (each entry resolved to the test NAME it matched, by name or code),
 * then first-seen order for every test when the list is empty. Configured
 * tests with no records are named in `missing`; a list that matches nothing
 * warns once.
 * @param {Object[]} labEvents The subject's lab EventRecords.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {{tests: string[], missing: string[]}} The test names to draw, in order, and the configured tests with no records.
 */
export function labTestOrder(labEvents, settings) {
  const events = arrayify(labEvents).filter((event) => event && typeof event === 'object');
  const configured = arrayify(settings?.lb_tests).map(String).filter(Boolean);
  const seen = [];
  for (const event of events) {
    const test = event.test ?? '';
    if (test && !seen.includes(test)) seen.push(test);
  }
  if (!configured.length) return { tests: seen, missing: [] };
  const tests = [];
  const missing = [];
  for (const entry of configured) {
    const key = upper(entry);
    const match = events.find(
      (event) => upper(event.test) === key || upper(event.testCode) === key
    );
    if (match && match.test && !tests.includes(match.test)) tests.push(match.test);
    else if (!match) missing.push(entry);
  }
  if (!tests.length && events.length) {
    console.warn(
      `patient-journey-explorer: lb_tests (${configured.join(', ')}) matched no lab test name or code; the labs lane is empty.`
    );
  }
  return { tests, missing };
}

/**
 * Pad a value range by 5% of its span (or ±1 when flat) so the trace and the
 * band never touch the plot edge.
 * @private
 */
function padRange(values) {
  const finiteValues = values.filter(finite);
  if (!finiteValues.length) return [0, 1];
  const lo = Math.min(...finiteValues);
  const hi = Math.max(...finiteValues);
  const pad = hi === lo ? 1 : (hi - lo) * 0.05;
  return [lo - pad, hi + pad];
}

/**
 * Build one LabSeries per configured test with records (labTestOrder), each
 * over the SHARED elapsed-day domain. Points are the placeable records of
 * `labEvents` in day order; the baseline is resolved from `baselineEvents`
 * when given (the whole record, so an abnormal-only filter cannot remove the
 * baseline point) and from `labEvents` otherwise.
 * @param {Object[]} labEvents The lab EventRecords to draw (post-filter).
 * @param {?[number, number]} domain The shared elapsed-day domain.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{baselineEvents?: Object[]}} [options] `baselineEvents`: the records the baseline is resolved over (defaults to `labEvents`).
 * @returns {LabSeries[]} One series per test, in render order.
 */
export function buildLabSeries(labEvents, domain, settings, { baselineEvents } = {}) {
  const events = arrayify(labEvents).filter((event) => event && typeof event === 'object');
  if (!events.length) return [];
  const baselinePool = Array.isArray(baselineEvents) ? baselineEvents : events;
  const { tests } = labTestOrder(events, settings);
  const shared =
    Array.isArray(domain) && domain.length === 2 && domain.every(finite) ? [...domain] : null;
  return tests.map((test) => {
    const own = events.filter((event) => event.test === test);
    const points = own
      .filter((event) => event.placeable !== false && finite(event.day) && finite(event.value))
      .map((event) => ({
        day: event.day,
        elapsed: toElapsed(event.day),
        value: event.value,
        lln: finite(event.lln) ? event.lln : null,
        uln: finite(event.uln) ? event.uln : null,
        nrind: upper(event.flags?.abnormal),
        event
      }))
      .sort((a, b) => a.day - b.day || a.event.sourceIndex - b.event.sourceIndex);
    const baseline = labBaseline(
      baselinePool.filter((event) => event && event.test === test),
      settings
    );
    const band = points
      .filter((point) => point.lln !== null && point.uln !== null)
      .map((point) => ({ day: point.day, lln: point.lln, uln: point.uln }));
    const unitSource = own.find((event) => event.unit);
    return {
      test,
      testCode: own.find((event) => event.testCode)?.testCode ?? '',
      unit: unitSource ? unitSource.unit : '',
      points,
      baseline,
      domain: shared,
      valueDomain: padRange([
        ...points.map((point) => point.value),
        ...points.map((point) => point.lln),
        ...points.map((point) => point.uln),
        baseline ? baseline.value : null
      ]),
      band
    };
  });
}
