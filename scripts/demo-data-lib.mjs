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

// ---- ADSL / population contract -------------------------------------------
// The population demo dataset for the Time-to-Event Explorer (safety.viz#128;
// design obot.roadmap requirements/design/161_design.html §5 as revised by the
// sv#131 review). The renderer composes the endpoint live from filters over the
// event dataset (adae.csv), so what the demo needs from adsl is the analysis
// denominator: one row per safety participant with the treatment group and the
// follow-up-end study day the renderer censors event-free participants at.
// Day 1 = TRTSDT (the source's ASTDY convention), so EOSDY is
// EOSDT − TRTSDT + 1, falling back to TRTEDT when EOSDT is missing; a
// participant with neither date keeps a blank EOSDY (with a build warning) and
// the renderer counts the exclusion downstream (TTE-DERIV-002). EOSSTT rides
// along as the censoring description shown in censor-mark tooltips.

export const ADSL_COLUMNS = ['USUBJID', 'ARM', 'EOSDY', 'EOSSTT'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const dateOrNull = (v) => {
  if (isBlank(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
};

/**
 * Derive the population demo records from source-shaped adsl rows: one record
 * per safety participant (SAFFL='Y' with a usable TRTSDT), in adsl input order,
 * with the actual-treatment group and the follow-up-end study day.
 */
export function buildAdslRecords(adslRecords, { warn = () => {} } = {}) {
  const noEnd = [];
  const records = adslRecords
    .filter((r) => clean(r.SAFFL) === 'Y' && dateOrNull(r.TRTSDT) !== null)
    .map((r) => {
      const id = clean(r.USUBJID);
      const start = dateOrNull(r.TRTSDT);
      const end = dateOrNull(r.EOSDT) ?? dateOrNull(r.TRTEDT);
      if (end === null) noEnd.push(id);
      return {
        USUBJID: id,
        ARM: clean(r.TRT01A) || clean(r.ARM),
        EOSDY: end === null ? '' : Math.round((end - start) / MS_PER_DAY) + 1,
        EOSSTT: clean(r.EOSSTT)
      };
    });
  if (noEnd.length)
    warn(
      `  WARNING: ${noEnd.length} participant(s) had no EOSDT/TRTEDT and keep a blank EOSDY: ${noEnd.join(', ')}`
    );
  return { columns: ADSL_COLUMNS, records };
}

// ---- Patient Journey Explorer per-domain contract ------------------------
// Six per-domain extracts for the Patient Journey Explorer (safety.viz#142,
// obot.roadmap#349; design §11). Five come from pharmaverseadam; the disposition
// file comes from pharmaversesdtm's `ds.csv`, because pharmaverseadam ships no ADaM
// DS dataset and without disposition there is no discontinuation rule (design
// D24). Each file's header is exactly the module's default `*_col` names for that
// domain plus TRTSDT (so calendar-date mode needs no ADSL join), and `NA` is never
// written — `clean`/`num` blank it. Every builder is pure and `{ columns, records }`
// shaped, so tests/unit/patient-journey-explorer/demo-data.test.js asserts the
// derivation rules on hand-made rows and guards the committed files separately.

export const PJE_EX_COLUMNS = [
  'USUBJID',
  'EXTRT',
  'EXDOSE',
  'EXDOSU',
  'ASTDY',
  'AENDY',
  'EXSTDTC',
  'TRTSDT'
];
export const PJE_AE_COLUMNS = [
  'USUBJID',
  'AETERM',
  'AEDECOD',
  'AEBODSYS',
  'ASTDY',
  'AENDY',
  'AESEV',
  'AESER',
  'AEREL',
  'AEOUT',
  'AESTDTC',
  'TRTSDT'
];
export const PJE_LB_COLUMNS = [
  'USUBJID',
  'LBTEST',
  'LBTESTCD',
  'LBSTRESN',
  'LBSTRESU',
  'LBSTNRLO',
  'LBSTNRHI',
  'LBNRIND',
  'ABLFL',
  'LBDY',
  'LBDTC',
  'TRTSDT'
];
export const PJE_CM_COLUMNS = [
  'USUBJID',
  'CMTRT',
  'CMDECOD',
  'CMCLAS',
  'CMDOSE',
  'CMROUTE',
  'ASTDY',
  'AENDY',
  'CMSTDTC',
  'CMENDTC',
  'TRTSDT'
];
export const PJE_MH_COLUMNS = [
  'USUBJID',
  'MHTERM',
  'MHDECOD',
  'MHCAT',
  'MHDY',
  'MHONSDY',
  'MHSTRTPT',
  'MHENRTPT',
  'MHSTDTC',
  'TRTSDT'
];
export const PJE_DS_COLUMNS = [
  'USUBJID',
  'DSDECOD',
  'DSTERM',
  'DSCAT',
  'DSSTDY',
  'DSSTDTC',
  'TRTSDT'
];

// The liver panel the labs lane shows by default, matched on adlb LBTEST. Traps:
// bilirubin is `BILI` / "Bilirubin" in µmol/L (not TBILI, not mg/dL); alkaline
// phosphatase's PARAMCD is ALKPH while its LBTESTCD is ALP; ALT's ULN varies by lab
// (32/34/35/43), so any × ULN figure is per record, never a constant.
export const PJE_LB_TESTS = [
  'Alanine Aminotransferase',
  'Aspartate Aminotransferase',
  'Bilirubin',
  'Alkaline Phosphatase'
];

// Exposure: adex replicates each dosing record across several record-level
// PARAMCDs (DOSE, DOSEO, PDOSEO, ...); one is the record itself. Keep PARAMCD='DOSE'
// so the exposure lane draws one segment per real dosing record, and dose changes
// derive from consecutive records rather than from duplicates.
export function buildPjeExRecords(adexRecords) {
  const records = adexRecords
    .filter((r) => clean(r.PARAMCD) === 'DOSE')
    .map((r) => ({
      USUBJID: clean(r.USUBJID),
      EXTRT: clean(r.EXTRT),
      EXDOSE: num(r.EXDOSE),
      EXDOSU: clean(r.EXDOSU),
      ASTDY: num(r.ASTDY),
      AENDY: num(r.AENDY),
      EXSTDTC: clean(r.EXSTDTC),
      TRTSDT: clean(r.TRTSDT)
    }));
  return { columns: PJE_EX_COLUMNS, records };
}

// Adverse events: treatment-emergent only (TRTEMFL='Y'), days from the analysis
// ASTDY/AENDY (100% populated against AESTDY's 97.8%). AEOUT rides along because
// the module's end-state rule (design D16) calls a blank end "ongoing" only when
// the outcome says so — in this study every blank AENDY carries
// NOT RECOVERED/NOT RESOLVED.
export function buildPjeAeRecords(adaeRecords) {
  const records = adaeRecords
    .filter((r) => clean(r.TRTEMFL) === 'Y')
    .map((r) => ({
      USUBJID: clean(r.USUBJID),
      AETERM: clean(r.AETERM),
      AEDECOD: clean(r.AEDECOD),
      AEBODSYS: clean(r.AEBODSYS),
      ASTDY: num(r.ASTDY),
      AENDY: num(r.AENDY),
      AESEV: clean(r.AESEV),
      AESER: clean(r.AESER),
      AEREL: clean(r.AEREL),
      AEOUT: clean(r.AEOUT),
      AESTDTC: clean(r.AESTDTC),
      TRTSDT: clean(r.TRTSDT)
    }));
  return { columns: PJE_AE_COLUMNS, records };
}

// Labs: the same analysis filter as the BDS build (DTYPE blank, ANL01FL='Y' or the
// ABLFL='Y' baseline, numeric AVAL) restricted to the liver panel, then renamed to
// the module's default header — AVAL→LBSTRESN, ANRLO→LBSTNRLO, ANRHI→LBSTNRHI,
// ADY→LBDY, ADT→LBDTC, and ANRIND (falling back to LBNRIND) → LBNRIND. ABLFL is
// carried verbatim because the baseline rule is flag-first (design D17).
export function buildPjeLbRecords(adlbRecords, { tests = PJE_LB_TESTS, warn = () => {} } = {}) {
  const panel = new Set(tests);
  const records = adlbRecords
    .filter(
      (r) =>
        isBlank(r.DTYPE) &&
        isNum(r.AVAL) &&
        (r.ANL01FL === 'Y' || r.ABLFL === 'Y') &&
        panel.has(clean(r.LBTEST))
    )
    .map((r) => ({
      USUBJID: clean(r.USUBJID),
      LBTEST: clean(r.LBTEST),
      LBTESTCD: clean(r.LBTESTCD),
      LBSTRESN: num(r.AVAL),
      LBSTRESU: clean(r.LBSTRESU),
      LBSTNRLO: num(r.ANRLO),
      LBSTNRHI: num(r.ANRHI),
      LBNRIND: clean(r.ANRIND) || clean(r.LBNRIND),
      ABLFL: clean(r.ABLFL),
      LBDY: num(r.ADY),
      LBDTC: clean(r.ADT),
      TRTSDT: clean(r.TRTSDT)
    }));
  const found = new Set(records.map((r) => r.LBTEST));
  const missing = tests.filter((t) => !found.has(t));
  if (missing.length) warn(`  WARNING: liver-panel tests not found in adlb: ${missing.join(', ')}`);
  return { columns: PJE_LB_COLUMNS, records };
}

// Con-meds: the raw adcm repeats every medication once per collection visit
// (7,510 rows for 1,081 distinct courses). De-duplicate on the course identity —
// participant, verbatim and coded name, analysis start/end day, recorded
// start/end date and dose — keeping the lowest CMSEQ member, in first-seen order.
// UNCODED stays as an ordinary class value (81% of records in this study).
export const pjeCmKey = (r) =>
  [
    clean(r.USUBJID),
    clean(r.CMTRT),
    clean(r.CMDECOD),
    clean(r.ASTDY),
    clean(r.AENDY),
    clean(r.CMSTDTC),
    clean(r.CMENDTC),
    clean(r.CMDOSE)
  ].join('|');

export function buildPjeCmRecords(adcmRecords) {
  const courses = new Map();
  for (const r of adcmRecords) {
    const key = pjeCmKey(r);
    const prev = courses.get(key);
    if (!prev || Number(r.CMSEQ) < Number(prev.CMSEQ)) courses.set(key, r);
  }
  const records = [...courses.values()].map((r) => ({
    USUBJID: clean(r.USUBJID),
    CMTRT: clean(r.CMTRT),
    CMDECOD: clean(r.CMDECOD),
    CMCLAS: clean(r.CMCLAS),
    CMDOSE: num(r.CMDOSE),
    CMROUTE: clean(r.CMROUTE),
    ASTDY: num(r.ASTDY),
    AENDY: num(r.AENDY),
    CMSTDTC: clean(r.CMSTDTC),
    CMENDTC: clean(r.CMENDTC),
    TRTSDT: clean(r.TRTSDT)
  }));
  return { columns: PJE_CM_COLUMNS, records };
}

// Medical history: the lane plots at the COLLECTION day MHDY (100% populated, −37…−2
// in this study), not the onset — onset (ASTDY) is 17% populated and reaches −18371.
// It ships separately as MHONSDY for the tooltip, with the relative-timing text
// (MHSTRTPT "BEFORE", MHENRTPT "ONGOING") and the recorded onset date (design D18).
export function buildPjeMhRecords(admhRecords) {
  const records = admhRecords.map((r) => ({
    USUBJID: clean(r.USUBJID),
    MHTERM: clean(r.MHTERM),
    MHDECOD: clean(r.MHDECOD),
    MHCAT: clean(r.MHCAT),
    MHDY: num(r.MHDY),
    MHONSDY: num(r.ASTDY),
    MHSTRTPT: clean(r.MHSTRTPT),
    MHENRTPT: clean(r.MHENRTPT),
    MHSTDTC: clean(r.MHSTDTC),
    TRTSDT: clean(r.TRTSDT)
  }));
  return { columns: PJE_MH_COLUMNS, records };
}

// The safety population with its treatment-start date, from adsl: the join key
// for the SDTM disposition file, which carries neither SAFFL nor TRTSDT.
export function safetySubjects(adslRecords) {
  const subjects = new Map();
  for (const r of adslRecords)
    if (clean(r.SAFFL) === 'Y' && !isBlank(r.TRTSDT))
      subjects.set(clean(r.USUBJID), clean(r.TRTSDT));
  return subjects;
}

// Disposition: pharmaversesdtm's ds.csv carries DSSTDY as a real, populated column
// (verified — see design §15 R1), so it passes straight through with DSCAT beside it:
// the module draws the cross-stack rule only for DISPOSITION EVENT rows while the
// PROTOCOL MILESTONE / OTHER EVENT rows still render marks (design D19). Rows are
// restricted to the safety population (the SDTM file also holds screen failures)
// and TRTSDT is joined from adsl.
export function buildPjeDsRecords(dsRecords, { subjects, warn = () => {} } = {}) {
  if (!(subjects instanceof Map))
    throw new Error('buildPjeDsRecords needs { subjects: Map<USUBJID, TRTSDT> }');
  const records = dsRecords
    .filter((r) => subjects.has(clean(r.USUBJID)))
    .map((r) => ({
      USUBJID: clean(r.USUBJID),
      DSDECOD: clean(r.DSDECOD),
      DSTERM: clean(r.DSTERM),
      DSCAT: clean(r.DSCAT),
      DSSTDY: num(r.DSSTDY),
      DSSTDTC: clean(r.DSSTDTC),
      TRTSDT: subjects.get(clean(r.USUBJID))
    }));
  const seen = new Set(records.map((r) => r.USUBJID));
  const missing = [...subjects.keys()].filter((id) => !seen.has(id));
  if (missing.length)
    warn(
      `  WARNING: ${missing.length} safety participant(s) have no disposition row: ${missing.join(', ')}`
    );
  return { columns: PJE_DS_COLUMNS, records };
}

// The six outputs in one place, so the build script and the drift guard agree on
// file names, headers and source files.
export const PJE_OUTPUTS = [
  { name: 'pje-ex', file: 'pje-ex.csv', columns: PJE_EX_COLUMNS, sources: ['adex.csv'] },
  { name: 'pje-ae', file: 'pje-ae.csv', columns: PJE_AE_COLUMNS, sources: ['adae.csv'] },
  { name: 'pje-lb', file: 'pje-lb.csv', columns: PJE_LB_COLUMNS, sources: ['adlb.csv'] },
  { name: 'pje-cm', file: 'pje-cm.csv', columns: PJE_CM_COLUMNS, sources: ['adcm.csv'] },
  { name: 'pje-mh', file: 'pje-mh.csv', columns: PJE_MH_COLUMNS, sources: ['admh.csv'] },
  { name: 'pje-ds', file: 'pje-ds.csv', columns: PJE_DS_COLUMNS, sources: ['ds.csv', 'adsl.csv'] }
];
