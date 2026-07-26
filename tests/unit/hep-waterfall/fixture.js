// Shared fixture for the hep-waterfall unit suite (#93): a hand-built,
// long-format cohort small enough that every expected number in the tests can
// be read off this file, and shaped to exercise the three things the modified
// ALT waterfall (Amirzadegan 2025, Fig 5) is built on — a rise, a fall, and a
// new-onset jaundice case — plus the two Table-1 exclusions and the
// baseline-fallback trap.
//
//  id   arm            baseline ALT   peak on-treatment ALT   note
//  P1   Placebo         50            80                      rise
//  P2   Placebo        100            80                      fall (baseline is the highest value)
//  P3   Drug           200           400                      rise + new-onset jaundice
//  P4   Drug           150            90                      fall
//  P5   Drug           120           130                      EXCLUDED: baseline TB 2xULN
//  P6   Other           90           110                      EXCLUDED: arm designated neither side
//  P7   Placebo         70            55                      fall, and NO day-0 record (fallback baseline)

const ALT_TEST = 'Aminotransferase, alanine (ALT)';
const TB_TEST = 'Total Bilirubin';

/** The full TEST strings the default measure_values map to. */
export const TESTS = { ALT: ALT_TEST, TB: TB_TEST };

/** Total-bilirubin upper limit of normal used throughout the fixture. */
export const TB_ULN = 1.2;

const SPEC = [
  {
    id: 'P1',
    arm: 'Placebo',
    altUln: 40,
    alt: [
      [0, 50],
      [30, 80],
      [60, 65]
    ],
    tb: [
      [0, 0.6],
      [30, 0.6]
    ]
  },
  {
    id: 'P2',
    arm: 'Placebo',
    altUln: 40,
    alt: [
      [0, 100],
      [30, 80],
      [60, 60]
    ],
    tb: [
      [0, 0.6],
      [30, 0.5]
    ]
  },
  {
    id: 'P3',
    arm: 'Drug',
    altUln: 40,
    alt: [
      [0, 200],
      [30, 400],
      [60, 300]
    ],
    tb: [
      [0, 0.6],
      [30, 3.0]
    ]
  },
  {
    id: 'P4',
    arm: 'Drug',
    altUln: 50,
    alt: [
      [0, 150],
      [30, 90],
      [60, 85]
    ],
    tb: [
      [0, 0.6],
      [30, 0.7]
    ]
  },
  {
    id: 'P5',
    arm: 'Drug',
    altUln: 40,
    alt: [
      [0, 120],
      [30, 130]
    ],
    tb: [
      [0, 2.6],
      [30, 2.8]
    ]
  },
  {
    id: 'P6',
    arm: 'Other',
    altUln: 40,
    alt: [
      [0, 90],
      [30, 110]
    ],
    tb: [
      [0, 0.6],
      [30, 0.6]
    ]
  },
  {
    id: 'P7',
    arm: 'Placebo',
    altUln: 40,
    alt: [
      [3, 70],
      [30, 55]
    ],
    tb: [
      [3, 0.6],
      [30, 0.6]
    ]
  }
];

function record(spec, test, day, value, uln, unit) {
  return {
    USUBJID: spec.id,
    ARM: spec.arm,
    SEX: spec.id === 'P1' || spec.id === 'P3' ? 'F' : 'M',
    TEST: test,
    STRESN: value,
    STRESU: unit,
    STNRLO: 0,
    STNRHI: uln,
    DY: day,
    VISIT: day === 0 ? 'Baseline' : `Day ${day}`,
    VISITNUM: day === 0 ? 0 : day / 10
  };
}

/**
 * The fixture as raw long-format records.
 * @param {Object} [overrides] `{ altUnit }` to force a per-participant ALT unit.
 * @returns {Object[]} The records.
 */
export function makeRows({ altUnit = () => 'U/L' } = {}) {
  const rows = [];
  SPEC.forEach((spec) => {
    spec.alt.forEach(([day, value]) =>
      rows.push(record(spec, ALT_TEST, day, value, spec.altUln, altUnit(spec.id)))
    );
    spec.tb.forEach(([day, value]) =>
      rows.push(record(spec, TB_TEST, day, value, TB_ULN, 'mg/dL'))
    );
  });
  return rows;
}

/** Settings overrides that designate the fixture's two real arms. */
export const ARM_SETTINGS = { placebo_arm: 'Placebo', active_arms: ['Drug'] };
