import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/hep-explorer/configure.js';
import { checkArmInputs } from '../../../src/hep-explorer/checkInputs.js';
import {
  ARM_COL_CANDIDATES,
  ARM_SIDE_COLORS,
  JAUNDICE_COLOR,
  distinctArms,
  resolveArmCol,
  resolveArmDesignation,
  resolveArmSides,
  resolvePlaceboArm,
  resolvePlaceboArmDetail
} from '../../../src/hep-core/arms.js';

// Treatment-arm plumbing for the bidirectional migration Sankey (Amirzadegan
// 2025 Fig 3) and the ALT waterfall (Fig 5) — obot.roadmap#43, safety.viz#91.
// The arm decides which side of the centre column a participant's flow leaves
// from, so an undesignated arm must resolve to NO side (and be counted out
// loud) rather than silently collapsing everyone into one bucket.

const subject = (id, arm) => ({ id, arm, raw: { ARM: arm } });

describe('hep-core arms — resolveArmCol', () => {
  const rows = [{ USUBJID: 'A', ACTARM: 'Placebo' }];

  it('HEP-ARM-001: uses arm_col when that column is present in the data (#91)', () => {
    expect(resolveArmCol([{ ARM: 'Placebo' }], syncSettings({}))).toBe('ARM');
    expect(resolveArmCol([{ TRT: 'Placebo' }], syncSettings({ arm_col: 'TRT' }))).toBe('TRT');
  });

  it('HEP-ARM-001: falls back to the known arm columns when arm_col is absent (#91)', () => {
    expect(ARM_COL_CANDIDATES).toEqual(['ARM', 'ACTARM', 'TRT01A', 'TREATMENT']);
    expect(resolveArmCol(rows, syncSettings({}))).toBe('ACTARM');
    expect(resolveArmCol([{ TRT01A: 'Drug' }], syncSettings({}))).toBe('TRT01A');
    expect(resolveArmCol([{ TREATMENT: 'Drug' }], syncSettings({}))).toBe('TREATMENT');
  });

  it('HEP-ARM-001: returns null when no arm column can be found (#91)', () => {
    expect(resolveArmCol([{ USUBJID: 'A' }], syncSettings({}))).toBeNull();
    expect(resolveArmCol([], syncSettings({}))).toBeNull();
    expect(resolveArmCol([{ ARM: 'Placebo' }], syncSettings({ arm_col: null }))).toBeNull();
  });
});

describe('hep-core arms — distinctArms', () => {
  it('HEP-ARM-001: unique, sorted arm values, dropping blanks (#91)', () => {
    const subjects = [
      subject('1', 'Study Drug'),
      subject('2', 'Placebo'),
      subject('3', 'Study Drug'),
      subject('4', ''),
      subject('5', undefined)
    ];
    expect(distinctArms(subjects)).toEqual(['Placebo', 'Study Drug']);
  });

  it('HEP-ARM-001: reads the arm from the retained meta when a column is named (#91)', () => {
    const rows = [{ raw: { TRT: 'B' } }, { raw: { TRT: 'A' } }, { raw: { TRT: 'B' } }];
    expect(distinctArms(rows, 'TRT')).toEqual(['A', 'B']);
  });
});

// The FULL arm list carried by safety.viz's own demo dataset (site/data/adbds.csv):
// the real 'Placebo' control arm alongside the synthetic chronic-liver-disease
// cohort's 'CLD: Placebo'. Two values match /placebo/i, so a first-match
// heuristic designates the 27-subject synthetic cohort as the comparator and
// pushes every real placebo participant onto the ACTIVE side.
const DEMO_ARMS = [
  'CLD: Placebo',
  'CLD: Study Drug',
  'Placebo',
  'Xanomeline High Dose',
  'Xanomeline Low Dose'
];

describe('hep-core arms — resolvePlaceboArm', () => {
  const arms = ['CLD: Placebo', 'CLD: Study Drug', 'Xanomeline High Dose'];

  it('HEP-ARM-002: auto-detects the placebo arm by name when none is configured (#91)', () => {
    expect(resolvePlaceboArm(arms, null)).toBe('CLD: Placebo');
    expect(resolvePlaceboArm(['Active', 'Control Group'], null)).toBe('Control Group');
    expect(resolvePlaceboArm(['Dose A', 'Dose B'], null)).toBeNull();
  });

  it('HEP-ARM-002: an exact placebo arm beats a substring match on the demo data (#91)', () => {
    expect(resolvePlaceboArm(DEMO_ARMS, null)).toBe('Placebo');
    expect(resolvePlaceboArmDetail(DEMO_ARMS, null)).toMatchObject({
      arm: 'Placebo',
      ambiguous: false,
      source: 'exact'
    });
    // Case and surrounding whitespace do not defeat the exact test.
    expect(resolvePlaceboArm(['CLD: Placebo', ' PLACEBO '], null)).toBe(' PLACEBO ');
  });

  it('HEP-ARM-002: several pattern matches with no exact winner are reported, not guessed (#91)', () => {
    const ambiguous = ['CLD: Placebo', 'Matching Placebo', 'Study Drug'];
    const detail = resolvePlaceboArmDetail(ambiguous, null);
    expect(detail.arm).toBeNull();
    expect(detail.ambiguous).toBe(true);
    expect(detail.candidates).toEqual(['CLD: Placebo', 'Matching Placebo']);
    expect(resolvePlaceboArm(ambiguous, null)).toBeNull();
    // Naming the arm explicitly resolves the tie.
    expect(resolvePlaceboArm(ambiguous, 'CLD: Placebo')).toBe('CLD: Placebo');
  });

  it('HEP-ARM-003: an explicit placebo_arm present in the data wins (#91)', () => {
    expect(resolvePlaceboArm(arms, 'Xanomeline High Dose')).toBe('Xanomeline High Dose');
    expect(resolvePlaceboArm(DEMO_ARMS, 'CLD: Placebo')).toBe('CLD: Placebo');
  });

  it('HEP-ARM-003: an explicit placebo_arm absent from the data falls back to detection (#91)', () => {
    expect(resolvePlaceboArm(arms, 'Not An Arm')).toBe('CLD: Placebo');
    expect(resolvePlaceboArm(DEMO_ARMS, 'Not An Arm')).toBe('Placebo');
  });
});

describe('hep-core arms — resolveArmSides', () => {
  const arms = ['CLD: Placebo', 'CLD: Study Drug', 'Xanomeline High Dose'];

  it('HEP-ARM-002: with no settings, placebo is detected and the rest pool active (#91)', () => {
    const sides = resolveArmSides(arms, syncSettings({}));
    expect(sides.get('CLD: Placebo')).toBe('placebo');
    expect(sides.get('CLD: Study Drug')).toBe('active');
    expect(sides.get('Xanomeline High Dose')).toBe('active');
  });

  it('HEP-ARM-003: explicit settings override detection and scope the active side (#91)', () => {
    const sides = resolveArmSides(
      arms,
      syncSettings({ placebo_arm: 'CLD: Placebo', active_arms: ['CLD: Study Drug'] })
    );
    expect(sides.get('CLD: Placebo')).toBe('placebo');
    expect(sides.get('CLD: Study Drug')).toBe('active');
    // HEP-ARM-004: an undesignated arm gets NO side, so it is excluded and counted.
    expect(sides.get('Xanomeline High Dose')).toBeNull();
  });

  it('HEP-ARM-003: a single active arm may be supplied as a bare string (#91)', () => {
    const sides = resolveArmSides(arms, syncSettings({ active_arms: 'CLD: Study Drug' }));
    expect(sides.get('CLD: Study Drug')).toBe('active');
    expect(sides.get('Xanomeline High Dose')).toBeNull();
  });

  it('HEP-ARM-005: with no placebo resolvable, every arm degrades to one side (#91)', () => {
    const sides = resolveArmSides(['Dose A', 'Dose B'], syncSettings({}));
    expect([...sides.values()]).toEqual(['active', 'active']);
    expect([...sides.values()].filter((side) => side === 'placebo')).toHaveLength(0);
  });

  it('HEP-ARM-004: an unknown arm value has no side (#91)', () => {
    const sides = resolveArmSides(arms, syncSettings({}));
    expect(sides.get('Never Randomised')).toBeUndefined();
    expect(sides.get('') ?? null).toBeNull();
  });

  it('HEP-ARM-002: the demo dataset sides the REAL placebo arm as placebo (#91)', () => {
    const { sides, placeboArm, warning } = resolveArmDesignation(DEMO_ARMS, syncSettings({}));
    expect(placeboArm).toBe('Placebo');
    expect(warning).toBeNull();
    expect(sides.get('Placebo')).toBe('placebo');
    expect(sides.get('CLD: Placebo')).toBe('active');
    expect(sides.get('Xanomeline High Dose')).toBe('active');
    expect(sides.get('Xanomeline Low Dose')).toBe('active');
    expect([...sides.values()].filter((side) => side === 'placebo')).toHaveLength(1);
  });

  it('HEP-ARM-002: an ambiguous placebo designation yields no placebo side and a warning (#91)', () => {
    const designation = resolveArmDesignation(
      ['CLD: Placebo', 'Matching Placebo', 'Study Drug'],
      syncSettings({})
    );
    expect(designation.placeboArm).toBeNull();
    expect(designation.ambiguous).toBe(true);
    expect([...designation.sides.values()].filter((side) => side === 'placebo')).toHaveLength(0);
    expect(designation.warning).toMatch(/CLD: Placebo, Matching Placebo/);
    expect(designation.warning).toMatch(/placebo_arm/);
  });
});

describe('hep-core arms — palettes', () => {
  it('HEP-ARM-003: arm sides carry fixed semantic colours, jaundice overrides them (#91)', () => {
    expect(ARM_SIDE_COLORS.placebo).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ARM_SIDE_COLORS.active).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ARM_SIDE_COLORS.placebo).not.toBe(ARM_SIDE_COLORS.active);
    expect(JAUNDICE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(JAUNDICE_COLOR).not.toBe(ARM_SIDE_COLORS.placebo);
    expect(JAUNDICE_COLOR).not.toBe(ARM_SIDE_COLORS.active);
  });
});

describe('hep-explorer checkInputs — the view-aware arm guard', () => {
  it('HEP-ARM-005: reports a usable arm column without touching the global contract (#91)', () => {
    const guard = checkArmInputs([{ USUBJID: 'A', ARM: 'Placebo' }], syncSettings({}));
    expect(guard).toMatchObject({ ok: true, armCol: 'ARM' });
    expect(guard.message).toBeNull();
  });

  it('HEP-ARM-005: reports an unmapped arm column as a message, never a throw (#91)', () => {
    const guard = checkArmInputs([{ USUBJID: 'A', STRESN: 40 }], syncSettings({}));
    expect(guard.ok).toBe(false);
    expect(guard.armCol).toBeNull();
    expect(guard.message).toMatch(/arm_col/);
  });
});
