// demo-data-lib.mjs — pure helpers behind scripts/build-demo-data.mjs.
//
// Extracted so the derivations can be unit-tested without running the build (which
// downloads ~200 MB of pharmaverseadam source). Mirrors the site-lib / evidence-lib
// split. The ECG derivation lives here because it is the part with real arithmetic —
// and the part where the source data needed cleaning (#79).

// ---- value helpers --------------------------------------------------------
// pharmaverseadam CSVs encode missing values as the literal string `NA` (R's
// write.csv convention). Treat that — and empty — as blank everywhere.
export const isBlank = (v) => v == null || v === '' || v === 'NA';
export const isNum = (v) => !isBlank(v) && Number.isFinite(Number(v));
export const clean = (v) => (isBlank(v) ? '' : v); // string field → '' when missing
export const num = (v) => (isNum(v) ? v : ''); // numeric field → '' when missing

export const roundTo = (value, decimals) => Number(Number(value).toFixed(decimals));

// ---- ECG / QT contract ----------------------------------------------------
// The pilot ADEG carries eight PARAMCDs; the QT Safety Explorer demo keeps the two
// fixed heart-rate corrections in scope for Phase 1 (QTcF / QTcB) plus heart rate,
// which the QT workflow reads alongside QTc (an increase to ≥100 bpm or ≥25% can
// itself drive an apparent QTc change). QT-RR is out of scope, and the pilot has no
// PR/QRS intervals and no moxifloxacin positive-control arm — expected for CDISC
// Pilot 01; those are Phase-2 items on a richer dataset.
//
// The QTc corrections are DERIVED here (#79) rather than taken from the pilot's
// pre-derived QTCFR / QTCBR parameters. This is a data-cleaning step, not a bug fix:
// the CDISC Pilot 01 ECG data is dirty in a way that is routine in real trials.
//
// The pilot collects RR and HR as separate measurements, and the two contradict each
// other. They should be the same fact expressed two ways (RR ms x HR bpm = 60000), but
// in this synthetic source they were generated independently: corr(RR, 60000/HR) =
// 0.0095, and only 0.8% of 8,220 readings agree within 5%. Collected RR has a median of
// 528 ms, implying 113.6 bpm; recorded HR has a median of 72 bpm, implying 833 ms.
//
// Nothing downstream is misbehaving. admiral's ADEG template deliberately derives
// QTCFR/QTCBR from the collected `RR` (`rr_code = "RR"`), and pharmaverseadam runs that
// template faithfully — "Rederived" in the parameter label means the QTc was rederived,
// not that it came from the rederived RR. Both do exactly what they document; they are
// simply propagating an inconsistency present in the source.
//
// So we choose. HR is the more credible of the two contradictory inputs — 72 bpm suits
// this elderly Alzheimer's population where 114 bpm does not, and QT/RR-derived QTcF
// lands at a median of 561 ms, which is not a plausible population value. We therefore
// correct against `RRR` (the pilot's RR rederived as 60000/HR, exact for every record).
// Taking QTCFR at face value put QTcF ~80 ms high (median 561 vs 468) and saturated
// every ICH E14 threshold in the demo. Note this is a judgment between contradictory
// inputs, not the repair of a known-broken one: in synthetic data neither is truth.
export const EG_MEASURED = { qt: 'QT', rr: 'RRR', hr: 'HR' };

export const EG_PARAMS = [
  // exponent: Fridericia divides by the cube root of RR (in seconds), Bazett by the
  // square root. Both are the standard fixed corrections; ICH E14 expects them.
  { paramcd: 'QTCF', test: 'QTcF', unit: 'msec', derivedFrom: EG_MEASURED.qt, exponent: 1 / 3 },
  { paramcd: 'QTCB', test: 'QTcB', unit: 'msec', derivedFrom: EG_MEASURED.qt, exponent: 1 / 2 },
  { paramcd: 'HR', test: 'Heart Rate', unit: 'beats/min' }
];

// Source parameters the build reads: the measured intervals behind the derivations,
// plus heart rate, which ships as recorded.
export const EG_SOURCE_PARAMCDS = new Set([EG_MEASURED.qt, EG_MEASURED.rr, EG_MEASURED.hr]);

// The pilot records each visit at three postural timepoints (supine, standing 1 min,
// standing 3 min) plus a DTYPE=AVERAGE roll-up. Keep the supine reading — the resting
// posture ICH-E14 analyses use — which is the reading the QT displays anchor on (the
// AVERAGE roll-up rows carry no baseline flag).
export const EG_TIMEPOINT = 'AFTER LYING DOWN FOR 5 MINUTES';

// QTc rounds to the pilot's own precision for the interval parameters.
export const EG_DECIMALS = 1;

export const EG_COLUMNS = [
  'USUBJID',
  'SITE',
  'SITEID',
  'SEX',
  'RACE',
  'AGE',
  'ARM',
  'VISIT',
  'VISITNUM',
  'PARAMCD',
  'TEST',
  'STRESU',
  'STRESN',
  'BASE',
  'CHG',
  'ABLFL'
];

// QTc = QT / (RR in seconds) ^ exponent. Fridericia uses 1/3, Bazett 1/2.
export const correctQt = (qtMsec, rrMsec, exponent) =>
  Number(qtMsec) / Math.pow(Number(rrMsec) / 1000, exponent);

// Identity of one ECG reading: participant × visit. The analysis filter already pins
// the posture, so this is enough to line QT up against its RR and HR.
export const egKey = (rec) => `${clean(rec.USUBJID)}|${clean(rec.AVISIT)}|${clean(rec.AVISITN)}`;

// Keep one analysis reading per participant × visit × parameter: the supine timepoint,
// a source reading (not the DTYPE=AVERAGE roll-up, which lacks the baseline flag), and
// either the primary-analysis record (ANL01FL='Y') or the baseline record (ABLFL='Y' —
// baseline carries ABLFL, not ANL01FL, and anchors every change-from-baseline display).
export const isEgAnalysisRecord = (rec) =>
  isBlank(rec.DTYPE) &&
  clean(rec.ATPT) === EG_TIMEPOINT &&
  isNum(rec.AVAL) &&
  (rec.ANL01FL === 'Y' || rec.ABLFL === 'Y');

// Map one ADaM ADEG record to the QT measure contract. `value` is the analysis value —
// the source AVAL for measured parameters, or a derived QTc for the corrections. BASE
// and CHG are filled in by attachEgBaseline(); the source BASE/CHG cannot be reused
// because they belong to the QTCFR/QTCBR values we do not carry forward (#79).
export function mapEg(rec, param, value) {
  return {
    USUBJID: clean(rec.USUBJID),
    SITE: isBlank(rec.SITEID) ? '' : `Clinical Site ${rec.SITEID}`,
    SITEID: clean(rec.SITEID),
    SEX: clean(rec.SEX),
    RACE: clean(rec.RACE),
    AGE: num(rec.AGE),
    ARM: clean(rec.TRTA) || clean(rec.ARM),
    VISIT: clean(rec.AVISIT) || clean(rec.VISIT),
    VISITNUM: clean(rec.AVISITN) || clean(rec.VISITNUM),
    PARAMCD: param.paramcd,
    TEST: param.test,
    STRESU: param.unit,
    STRESN: value,
    BASE: '',
    CHG: '',
    ABLFL: clean(rec.ABLFL)
  };
}

// Guard (#79): the RR parameter we correct with must agree with the recorded heart
// rate — RR(ms) × HR(bpm) = 60000. The pilot's collected `RR` fails this by ~40 bpm,
// which is exactly how the inflated QTCFR/QTCBR values arise. Fail the build rather
// than silently ship QTc corrected against an RR the data itself contradicts.
export function assertRrSane(rrByKey, hrByKey) {
  const deltas = [];
  for (const [key, rr] of rrByKey) {
    const hr = hrByKey.get(key);
    if (!hr) continue;
    deltas.push(Math.abs(60000 / Number(rr.AVAL) - Number(hr.AVAL)));
  }
  if (!deltas.length)
    throw new Error(
      `ECG guard: no ${EG_MEASURED.rr} readings could be paired with ${EG_MEASURED.hr}`
    );
  const worst = Math.max(...deltas);
  // 1 bpm of slack absorbs the source's own rounding; the collected RR is off by ~40.
  if (worst > 1)
    throw new Error(
      `ECG guard: ${EG_MEASURED.rr} disagrees with ${EG_MEASURED.hr} by up to ` +
        `${worst.toFixed(1)} bpm (expected RR = 60000/HR). Refusing to derive QTc from an ` +
        `RR column that contradicts the recorded heart rate — see safety.viz#79.`
    );
  return { paired: deltas.length, worst };
}

// Fill BASE (the participant's baseline reading for this parameter) and CHG onto every
// record, matching what the pilot supplies for its own parameters.
export function attachEgBaseline(records, { warn = () => {} } = {}) {
  const baselineByParticipantParam = new Map();
  for (const rec of records) {
    if (rec.ABLFL === 'Y')
      baselineByParticipantParam.set(`${rec.USUBJID}|${rec.PARAMCD}`, rec.STRESN);
  }
  let missing = 0;
  for (const rec of records) {
    const base = baselineByParticipantParam.get(`${rec.USUBJID}|${rec.PARAMCD}`);
    if (base == null) {
      missing += 1;
      continue;
    }
    rec.BASE = base;
    rec.CHG = roundTo(Number(rec.STRESN) - Number(base), EG_DECIMALS);
  }
  if (missing) warn(`  WARNING: ${missing} ECG records have no baseline reading; BASE/CHG blank`);
  return records;
}

// Build the ECG demo records from raw ADEG source records.
export function buildEcgRecords(sourceRecords, { log = () => {}, warn = () => {} } = {}) {
  const source = sourceRecords.filter(
    (r) => isEgAnalysisRecord(r) && EG_SOURCE_PARAMCDS.has(clean(r.PARAMCD))
  );

  const foundSource = new Set(source.map((r) => clean(r.PARAMCD)));
  const missingSource = [...EG_SOURCE_PARAMCDS].filter((code) => !foundSource.has(code));
  if (missingSource.length)
    throw new Error(`ECG source parameters not found in ADEG: ${missingSource.join(', ')}`);

  const byParam = (code) =>
    new Map(source.filter((r) => clean(r.PARAMCD) === code).map((r) => [egKey(r), r]));
  const qtByKey = byParam(EG_MEASURED.qt);
  const rrByKey = byParam(EG_MEASURED.rr);
  const hrByKey = byParam(EG_MEASURED.hr);

  const { paired, worst } = assertRrSane(rrByKey, hrByKey);
  log(
    `  ECG guard: ${EG_MEASURED.rr} agrees with ${EG_MEASURED.hr} across ${paired} readings ` +
      `(max ${worst.toFixed(3)} bpm)`
  );

  const records = [];
  let unpaired = 0;
  for (const param of EG_PARAMS) {
    if (!param.derivedFrom) {
      for (const rec of source.filter((r) => clean(r.PARAMCD) === param.paramcd))
        records.push(mapEg(rec, param, rec.AVAL));
      continue;
    }
    for (const [key, rec] of qtByKey) {
      const rr = rrByKey.get(key);
      if (!rr) {
        unpaired += 1;
        continue;
      }
      records.push(
        mapEg(rec, param, roundTo(correctQt(rec.AVAL, rr.AVAL, param.exponent), EG_DECIMALS))
      );
    }
  }
  if (unpaired)
    warn(`  WARNING: ${unpaired} QT readings had no matching ${EG_MEASURED.rr}; skipped`);

  return { columns: EG_COLUMNS, records: attachEgBaseline(records, { warn }) };
}
