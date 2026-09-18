// patient-journey-explorer-data.js — the Playwright fixture dataset for the
// Patient Journey Explorer (safety.viz#142, design §11.4). Loaded by
// patient-journey-explorer.html BEFORE the mount script; assigns window.PJE_FIXTURE.
//
// Deterministic and hand-computed: no Math.random(), not a slice of the pilot, so
// every expected number below is checkable from this comment. Every cell is a
// string, as CSV-parsed data arrives. Column names are the module's default
// `*_col` names for each domain plus TRTSDT, so the mount needs no overrides.
//
// window.PJE_FIXTURE.expectations is the ONLY place an expected number lives
// (design PC-2). The spec reads it; nothing is pasted.
//
// ---- The subjects -----------------------------------------------------------
// PJE-1  the full story (TRTSDT 2024-01-01, so study day d = 2024-01-01 + (d-1)
//        for d >= 1 and 2024-01-01 + d for d <= -1; 2024 is a leap year, so day
//        32 = Feb 1, day 60 = Feb 29, day 61 = Mar 1).
// PJE-2  no adverse events (TRTSDT 2024-02-01).
// PJE-3  unplaceable and malformed rows (TRTSDT 2024-03-01).
//
// ---- PJE-1 records (domain array index in brackets = the EventRecord id) ----
// EX  [0] 50 mg  days 1-20      [1] 100 mg days 21-60
//     -> one dose change, DOSE-1, at day 21 (increase; the new dose's start day)
// AE  [0] RASH     days 10-12 MILD, RECOVERED/RESOLVED          (closed)
//     [1] RASH     day 30, end blank, NOT RECOVERED/NOT RESOLVED (ongoing)  <- anchor
//     [2] PRURITUS day 30, end blank, AEOUT blank                (unrecorded)
//     [3] HEADACHE days 50-52, AESEV blank                       (closed; severity not recorded)
//     [4] SYNCOPE  days 75-76 SEVERE, AESER=Y                    (closed; the one serious event)
// LB  ALT: d-5 20 NORMAL (ABLFL=Y), d25 90 HIGH (ULN 40), d70 25 NORMAL
//     AST: d-5 22 NORMAL (ABLFL=Y), d25 30 NORMAL,            d70 28 NORMAL
// CM  [0] ASPIRIN         d-400 -> blank   (recorded start '2022', end not recorded)
//     [1] IBUPROFEN       d5    -> d40     (closed)
//     [2] HYDROCORTISONE  d45   -> blank   (end not recorded)
//     [3] HERBAL TEA      no start day, no end day (UNCODED)   -> not placeable
// MH  [0] HYPERTENSION at collection day -5 (onset '2020', BEFORE, ONGOING)
// DS  [0] COMPLETED (DISPOSITION EVENT) day 90
//
// ---- Anchor on AE-1 (RASH, day 30), window +/-30 -----------------------------
// Elapsed-day space (design §5.6): toElapsed(30) = 29.
//   window = { elapsedStart: 29-30 = -1, elapsedEnd: 29+30 = 59,
//              startDay: toStudyDay(-1) = -1, endDay: toStudyDay(59) = 60 }
// conMeds active at day 30 (toElapsed(start) <= 29 and (no end or toElapsed(end) >= 29)):
//   ASPIRIN (-400 <= 29, no end)        yes  -> endUnrecorded +1
//   IBUPROFEN (elapsed 4 <= 29, end 39 >= 29) yes
//   HYDROCORTISONE (elapsed 44 > 29)     no
//   HERBAL TEA (no start)                not evaluated -> conMedsWithoutStart 1
//   => conMeds 2, conMedsEndUnrecorded 1, conMedsWithoutStart 1
// conMedsLater (start inside the window and after the anchor: 29 < elapsed <= 59):
//   HYDROCORTISONE (44)                  => 1
// abnormalLabs (points with -1 <= elapsed <= 59, flag-or-change against the flagged baseline):
//   ALT d25 (elapsed 24): HIGH; 90/20 = 4.5x baseline >= 2  -> abnormal, reason 'both'
//   AST d25 (elapsed 24): NORMAL; 30/22 = 1.36x             -> not abnormal
//   d-5 points (elapsed -5 < -1) and d70 points (69 > 59)   -> outside the window
//   => abnormalLabs 1  (ratio line: 90 / 40 = 2.25 x ULN)
// doseChanges in window: DOSE-1 at day 21 (elapsed 20)        => 1
// priorEvents (same preferred term as the anchor, any earlier day): AE-0 RASH day 10 => 1
// inWindow (every placeable event in every lane, the anchor included):
//   EX 2 (both segments overlap) + DOSE 1 + AE 4 (AE-0 days 10-12, AE-1, AE-2, AE-3 days
//   50-52; AE-4 starts at elapsed 74 > 59) + LB 2 (ALT d25, AST d25) + CM 3 (ASPIRIN,
//   IBUPROFEN, HYDROCORTISONE all overlap; HERBAL TEA never matches) + MH 0 (elapsed
//   -5 < -1) + DS 0 (elapsed 89 > 59)                          => 12
// aeEndUnrecorded (AEs in the window whose end is neither recorded nor ongoing):
//   AE-2 PRURITUS                                             => 1
//
// ---- Anchor on AE-2 (PRURITUS, day 30): the empty-state anchor -----------------
// Same window and same lists except priorEvents: no earlier PRURITUS => 0, which is
// the empty panel section the spec asserts. (§11.4 asks for both a same-term prior
// event at day 10 and an empty priorEvents list; one anchor cannot give both, so the
// fixture gives each to its own anchor.)
//
// ---- Malformed rows (dropped, with the exact §5.1 reason text) ----------------
// ae[7]  PJE-3, AETERM and AEDECOD blank  -> 'missing adverse-event term (AETERM, AEDECOD)'
// lb[9]  PJE-3, LBSTRESN 'POSITIVE'        -> 'non-numeric result (LBSTRESN = "POSITIVE")'
// cm[4]  USUBJID blank                     -> 'missing participant id (USUBJID)'
// merged only: one row with DOMAIN 'XX'    -> 'unrecognized domain "XX"'
// ---- Unplaceable rows (kept, not drawn) ---------------------------------------
// ex[4] PJE-3 blank ASTDY; ae[6] PJE-3 DIZZINESS blank ASTDY; cm[3] PJE-1 HERBAL TEA.

(function () {
  const ex = [
    row('PJE-1', 'STUDY DRUG', '50', 'mg', '1', '20', '2024-01-01', '2024-01-01'),
    row('PJE-1', 'STUDY DRUG', '100', 'mg', '21', '60', '2024-01-21', '2024-01-01'),
    row('PJE-2', 'STUDY DRUG', '50', 'mg', '1', '30', '2024-02-01', '2024-02-01'),
    row('PJE-3', 'STUDY DRUG', '50', 'mg', '1', '10', '2024-03-01', '2024-03-01'),
    row('PJE-3', 'STUDY DRUG', '50', 'mg', '', '', '', '2024-03-01')
  ].map((r) =>
    keyed(r, ['USUBJID', 'EXTRT', 'EXDOSE', 'EXDOSU', 'ASTDY', 'AENDY', 'EXSTDTC', 'TRTSDT'])
  );

  const SKIN = 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS';
  const NERV = 'NERVOUS SYSTEM DISORDERS';
  const GI = 'GASTROINTESTINAL DISORDERS';
  const ae = [
    row(
      'PJE-1',
      'Rash',
      'RASH',
      SKIN,
      '10',
      '12',
      'MILD',
      'N',
      'NONE',
      'RECOVERED/RESOLVED',
      '2024-01-10',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      'Rash on trunk',
      'RASH',
      SKIN,
      '30',
      '',
      'MODERATE',
      'N',
      'PROBABLE',
      'NOT RECOVERED/NOT RESOLVED',
      '2024-01-30',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      'Itching',
      'PRURITUS',
      SKIN,
      '30',
      '',
      'MILD',
      'N',
      'POSSIBLE',
      '',
      '2024-01-30',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      'Headache',
      'HEADACHE',
      NERV,
      '50',
      '52',
      '',
      'N',
      'NONE',
      'RECOVERED/RESOLVED',
      '2024-02-19',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      'Fainting',
      'SYNCOPE',
      NERV,
      '75',
      '76',
      'SEVERE',
      'Y',
      'PROBABLE',
      'RECOVERED/RESOLVED',
      '2024-03-15',
      '2024-01-01'
    ),
    row(
      'PJE-3',
      'Nausea',
      'NAUSEA',
      GI,
      '5',
      '6',
      'MILD',
      'N',
      'NONE',
      'RECOVERED/RESOLVED',
      '2024-03-05',
      '2024-03-01'
    ),
    row('PJE-3', 'Dizziness', 'DIZZINESS', NERV, '', '', 'MILD', 'N', 'NONE', '', '', '2024-03-01'),
    row(
      'PJE-3',
      '',
      '',
      GI,
      '7',
      '8',
      'MILD',
      'N',
      'NONE',
      'RECOVERED/RESOLVED',
      '2024-03-07',
      '2024-03-01'
    )
  ].map((r) =>
    keyed(r, [
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
    ])
  );

  const ALT = 'Alanine Aminotransferase';
  const AST = 'Aspartate Aminotransferase';
  const lb = [
    row(
      'PJE-1',
      ALT,
      'ALT',
      '20',
      'U/L',
      '7',
      '40',
      'NORMAL',
      'Y',
      '-5',
      '2023-12-27',
      '2024-01-01'
    ),
    row('PJE-1', ALT, 'ALT', '90', 'U/L', '7', '40', 'HIGH', '', '25', '2024-01-25', '2024-01-01'),
    row(
      'PJE-1',
      ALT,
      'ALT',
      '25',
      'U/L',
      '7',
      '40',
      'NORMAL',
      '',
      '70',
      '2024-03-10',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      AST,
      'AST',
      '22',
      'U/L',
      '8',
      '34',
      'NORMAL',
      'Y',
      '-5',
      '2023-12-27',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      AST,
      'AST',
      '30',
      'U/L',
      '8',
      '34',
      'NORMAL',
      '',
      '25',
      '2024-01-25',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      AST,
      'AST',
      '28',
      'U/L',
      '8',
      '34',
      'NORMAL',
      '',
      '70',
      '2024-03-10',
      '2024-01-01'
    ),
    row(
      'PJE-2',
      ALT,
      'ALT',
      '18',
      'U/L',
      '7',
      '40',
      'NORMAL',
      'Y',
      '-3',
      '2024-01-29',
      '2024-02-01'
    ),
    row(
      'PJE-2',
      ALT,
      'ALT',
      '21',
      'U/L',
      '7',
      '40',
      'NORMAL',
      '',
      '15',
      '2024-02-15',
      '2024-02-01'
    ),
    row(
      'PJE-3',
      ALT,
      'ALT',
      '30',
      'U/L',
      '7',
      '40',
      'NORMAL',
      'Y',
      '1',
      '2024-03-01',
      '2024-03-01'
    ),
    row(
      'PJE-3',
      'Urine Protein',
      'PROT',
      'POSITIVE',
      '',
      '',
      '',
      '',
      '',
      '1',
      '2024-03-01',
      '2024-03-01'
    )
  ].map((r) =>
    keyed(r, [
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
    ])
  );

  const cm = [
    row(
      'PJE-1',
      'ASPIRIN',
      'ASPIRIN',
      'NERVOUS SYSTEM',
      '100',
      'ORAL',
      '-400',
      '',
      '2022',
      '',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      'IBUPROFEN',
      'IBUPROFEN',
      'MUSCULO-SKELETAL SYSTEM',
      '400',
      'ORAL',
      '5',
      '40',
      '2024-01-05',
      '2024-02-09',
      '2024-01-01'
    ),
    row(
      'PJE-1',
      'HYDROCORTISONE',
      'HYDROCORTISONE',
      'DERMATOLOGICALS',
      '',
      'TOPICAL',
      '45',
      '',
      '2024-02-14',
      '',
      '2024-01-01'
    ),
    row('PJE-1', 'HERBAL TEA', '', 'UNCODED', '', 'ORAL', '', '', '', '', '2024-01-01'),
    row(
      '',
      'PARACETAMOL',
      'PARACETAMOL',
      'NERVOUS SYSTEM',
      '500',
      'ORAL',
      '1',
      '',
      '2024-01-01',
      '',
      '2024-01-01'
    ),
    row('PJE-3', 'VITAMIN D', '', 'UNCODED', '', 'ORAL', '1', '', '2024-03-01', '', '2024-03-01')
  ].map((r) =>
    keyed(r, [
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
    ])
  );

  const mh = [
    row(
      'PJE-1',
      'High blood pressure',
      'HYPERTENSION',
      'SIGNIFICANT PRE-EXISTING CONDITION',
      '-5',
      '',
      'BEFORE',
      'ONGOING',
      '2020',
      '2024-01-01'
    ),
    row(
      'PJE-2',
      'Knee arthritis',
      'OSTEOARTHRITIS',
      'SIGNIFICANT PRE-EXISTING CONDITION',
      '-3',
      '',
      'BEFORE',
      'ONGOING',
      '',
      '2024-02-01'
    ),
    row(
      'PJE-3',
      'Migraines',
      'MIGRAINE',
      'HISTORICAL DIAGNOSIS',
      '-2',
      '',
      'BEFORE',
      '',
      '',
      '2024-03-01'
    )
  ].map((r) =>
    keyed(r, [
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
    ])
  );

  const ds = [
    row(
      'PJE-1',
      'COMPLETED',
      'PROTOCOL COMPLETED',
      'DISPOSITION EVENT',
      '90',
      '2024-03-30',
      '2024-01-01'
    ),
    row(
      'PJE-2',
      'COMPLETED',
      'PROTOCOL COMPLETED',
      'DISPOSITION EVENT',
      '30',
      '2024-03-01',
      '2024-02-01'
    ),
    row(
      'PJE-3',
      'ADVERSE EVENT',
      'ADVERSE EVENT',
      'DISPOSITION EVENT',
      '10',
      '2024-03-10',
      '2024-03-01'
    )
  ].map((r) => keyed(r, ['USUBJID', 'DSDECOD', 'DSTERM', 'DSCAT', 'DSSTDY', 'DSSTDTC', 'TRTSDT']));

  // Form B: the same rows with a DOMAIN column, in domain order (so each row's
  // index within its domain — and therefore its EventRecord id — is unchanged),
  // plus one row with an unrecognized domain.
  const withDomain = (rows, domain) => rows.map((r) => ({ DOMAIN: domain, ...r }));
  const merged = [
    ...withDomain(ex, 'EX'),
    ...withDomain(ae, 'AE'),
    ...withDomain(lb, 'LB'),
    ...withDomain(cm, 'CM'),
    ...withDomain(mh, 'MH'),
    ...withDomain(ds, 'DS'),
    { DOMAIN: 'XX', USUBJID: 'PJE-1', NOTE: 'unrecognized domain row' }
  ];

  const droppedReasons = [
    'missing adverse-event term (AETERM, AEDECOD)',
    'non-numeric result (LBSTRESN = "POSITIVE")',
    'missing participant id (USUBJID)'
  ];

  const expectations = {
    // The primary anchor: AE-1 = ae[1], RASH at day 30.
    anchorId: 'AE-1',
    anchorLabel: 'RASH',
    anchorDay: 30,
    window: { days: 30, elapsedStart: -1, elapsedEnd: 59, startDay: -1, endDay: 60 },
    counts: {
      conMeds: 2,
      conMedsLater: 1,
      abnormalLabs: 1,
      doseChanges: 1,
      priorEvents: 1,
      inWindow: 12
    },
    notEvaluated: { conMedsWithoutStart: 1, conMedsEndUnrecorded: 1, aeEndUnrecorded: 1 },
    // Per-domain rows kept but not drawn, for the opening subject PJE-1.
    unplaceableByDomain: { EX: 0, AE: 0, LB: 0, CM: 1, MH: 0, DS: 0 },
    // The one abnormal lab, as the panel prints it.
    abnormalLab: {
      test: ALT,
      day: 25,
      value: 90,
      ulnRatio: 2.25,
      baselineRatio: 4.5,
      reason: 'both'
    },
    doseChange: { id: 'DOSE-1', day: 21, from: 50, to: 100, direction: 'increase' },
    priorEvent: { id: 'AE-0', day: 10 },
    conMedsActive: ['ASPIRIN', 'IBUPROFEN'],
    conMedsLater: ['HYDROCORTISONE'],
    // The empty-state anchor: AE-2 = ae[2], PRURITUS at day 30, same window, no prior.
    emptyList: 'priorEvents',
    emptyStateAnchor: {
      anchorId: 'AE-2',
      anchorLabel: 'PRURITUS',
      counts: {
        conMeds: 2,
        conMedsLater: 1,
        abnormalLabs: 1,
        doseChanges: 1,
        priorEvents: 0,
        inWindow: 12
      },
      notEvaluated: { conMedsWithoutStart: 1, conMedsEndUnrecorded: 1, aeEndUnrecorded: 1 },
      emptyList: 'priorEvents'
    },
    subjects: ['PJE-1', 'PJE-2', 'PJE-3'],
    openingSubject: 'PJE-1',
    noAeSubject: 'PJE-2',
    refDate: { 'PJE-1': '2024-01-01', 'PJE-2': '2024-02-01', 'PJE-3': '2024-03-01' },
    // Drawn marks per lane for PJE-1 (placeable records only; labs = points).
    laneCounts: {
      exposure: 2,
      doseChanges: 1,
      adverseEvents: 5,
      labs: 6,
      conMeds: 3,
      medicalHistory: 1,
      disposition: 1
    },
    labTests: [ALT, AST],
    seriousCount: 1,
    seriousId: 'AE-4',
    severityNotRecordedId: 'AE-3',
    endStates: {
      'AE-0': 'closed',
      'AE-1': 'ongoing',
      'AE-2': 'unrecorded',
      'CM-0': 'unrecorded',
      'CM-1': 'closed'
    },
    partialDate: { id: 'CM-0', rawDate: '2022' },
    conMedClasses: ['DERMATOLOGICALS', 'MUSCULO-SKELETAL SYSTEM', 'NERVOUS SYSTEM', 'UNCODED'],
    // Form A (the per-domain object) drops three rows; form B adds the XX row.
    droppedReasons,
    droppedCounts: { total: 3, byDomain: { AE: 1, LB: 1, CM: 1 } },
    mergedDroppedReasons: [...droppedReasons, 'unrecognized domain "XX"'],
    mergedDroppedCounts: { total: 4 }
  };

  window.PJE_FIXTURE = { ex, ae, lb, cm, mh, ds, merged, expectations };

  function row() {
    return Array.prototype.slice.call(arguments);
  }
  function keyed(values, columns) {
    const out = {};
    columns.forEach((col, i) => {
      out[col] = values[i];
    });
    return out;
  }
})();
