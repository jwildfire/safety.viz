// Shared fixture for the participant-profile unit suite (#98): a hand-built,
// long-format cohort small enough that every expected number in the tests can
// be read off this file, shaped to exercise the profile's data layer —
// per-measure series in both display modes (PPRF-3), the measure summary with
// outliers and population extents (PPRF-4), the R Ratio / P_ALT header fields
// (PPRF-2), and the worst-first cohort ranking incl. its fallback path
// (PPRF-5).
//
//  id   role                     ALT peak xULN   TB peak xULN   quadrant
//  P1   Hy's Law                 4.0 (160/40)    2.6            Hy's Law
//  P2   Temple's Corollary       4.2 (168/40)    1.2            Temple's Corollary
//  P3   Normal                   0.6 (24/40)     0.6            Normal & NN
//  P4   EXCLUDED (no TB rows)    5.0 (200/40)    —              fallback score 5/3
//  P5   EXCLUDED (no TB rows)    2.0 (80/40)     —              fallback score 2/3
//  P6   Hy's Law, higher ALT     6.0 (240/40)    3.0            Hy's Law
//  P7   Normal, P3's twin        0.6 (24/40)     0.6            Normal & NN
//
// P1 additionally carries the non-key measure Creatinine (extras split,
// PPRF-3/4) with one high and one low outlier, plus a P_ALT value.

export const ALT_TEST = 'Aminotransferase, alanine (ALT)';
export const AST_TEST = 'Aminotransferase, aspartate (AST)';
export const TB_TEST = 'Total Bilirubin';
export const ALP_TEST = 'Alkaline phosphatase (ALP)';
export const CREAT_TEST = 'Creatinine';

/** Per-measure [lln, uln] used throughout the fixture. */
export const LIMITS = {
  [ALT_TEST]: [5, 40],
  [AST_TEST]: [5, 38],
  [TB_TEST]: [0.2, 1],
  [ALP_TEST]: [30, 120],
  [CREAT_TEST]: [0.8, 1.2]
};

function row(id, test, day, value, extra = {}) {
  const [lln, uln] = LIMITS[test];
  return {
    USUBJID: id,
    TEST: test,
    STRESN: value,
    STRESU: 'U/L',
    STNRLO: lln,
    STNRHI: uln,
    DY: day,
    VISIT: day === 0 ? 'Baseline' : `Day ${day}`,
    VISITNUM: day === 0 ? 1 : day / 30 + 1,
    SEX: extra.SEX ?? '',
    AGE: extra.AGE ?? '',
    PALT: extra.PALT ?? ''
  };
}

function participant(id, meta, series) {
  const rows = [];
  Object.entries(series).forEach(([test, points]) => {
    points.forEach(([day, value]) => rows.push(row(id, test, day, value, meta)));
  });
  return rows;
}

/**
 * The full long-format fixture, in input order P1..P7.
 * @returns {Object[]} Raw rows for cleanData.
 */
export function makeRows() {
  return [
    ...participant(
      'P1',
      { SEX: 'F', AGE: 62, PALT: '0.87' },
      {
        [ALT_TEST]: [
          [0, 35],
          [30, 160],
          [60, 80]
        ],
        [AST_TEST]: [
          [0, 30],
          [30, 90]
        ],
        [TB_TEST]: [
          [0, 0.8],
          [30, 2.6]
        ],
        [ALP_TEST]: [
          [0, 100],
          [30, 144]
        ],
        [CREAT_TEST]: [
          [0, 0.9],
          [30, 1.5],
          [60, 0.7]
        ]
      }
    ),
    ...participant(
      'P2',
      { SEX: 'M', AGE: 51 },
      {
        [ALT_TEST]: [
          [0, 30],
          [30, 168]
        ],
        [TB_TEST]: [
          [0, 0.5],
          [30, 1.2]
        ],
        [ALP_TEST]: [
          [0, 60],
          [30, 60]
        ]
      }
    ),
    ...participant(
      'P3',
      { SEX: 'F', AGE: 44 },
      {
        [ALT_TEST]: [
          [0, 20],
          [30, 24]
        ],
        [TB_TEST]: [
          [0, 0.5],
          [30, 0.6]
        ],
        [ALP_TEST]: [
          [0, 80],
          [30, 90]
        ]
      }
    ),
    ...participant(
      'P4',
      { SEX: 'M', AGE: 58 },
      {
        [ALT_TEST]: [
          [0, 30],
          [30, 200]
        ]
      }
    ),
    ...participant(
      'P5',
      { SEX: 'F', AGE: 39 },
      {
        [ALT_TEST]: [
          [0, 30],
          [30, 80]
        ]
      }
    ),
    ...participant(
      'P6',
      { SEX: 'M', AGE: 66 },
      {
        [ALT_TEST]: [
          [0, 35],
          [30, 240]
        ],
        [TB_TEST]: [
          [0, 0.8],
          [30, 3]
        ],
        [ALP_TEST]: [
          [0, 100],
          [30, 120]
        ]
      }
    ),
    ...participant(
      'P7',
      { SEX: 'F', AGE: 44 },
      {
        [ALT_TEST]: [
          [0, 20],
          [30, 24]
        ],
        [TB_TEST]: [
          [0, 0.5],
          [30, 0.6]
        ],
        [ALP_TEST]: [
          [0, 80],
          [30, 90]
        ]
      }
    )
  ];
}
