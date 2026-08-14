import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Invariants of the synthetic acute-kidney-injury cohort (#120, design #35 §5.3,
// D8) — the `AKI-*` participants injected into the SHARED site/data/adbds.csv by
// scripts/build-nep-aki-cohort.mjs.
//
// Measured on the pharmaverseadam demo as it stood, all 208 stageable
// participants sit in the no-stage box: maximum fold change 1.45x, nobody above
// the 1.5x Stage-1 line, nobody within 0.3 mg/dL of the delta trigger's reach.
// The KDIGO scatter cannot be DEMONSTRATED on that population however correctly
// it is implemented, so D8 injects a cohort designed to exercise every zone.
// This suite asserts the cohort really carries that signal, so a regeneration
// that quietly loses it fails here rather than in a screenshot nobody reads
// (#89 DEMO-6).
//
// The staging below is recomputed from the CSV independently of the module —
// baseline is the VISITNUM 0 record, maxima are taken over the post-baseline
// records, and micromoles are converted at 88.4 — so these are assertions about
// the DATA, not a second copy of structureData's arithmetic.
//
// These IDs sit in their own NEP-COHORT-* area: they evidence properties of the
// demo data, not of the renderer, and must not be confused with the NEP-DATA-*
// and NEP-STAGE-* rows the module's own tests satisfy.
//
// Filed under tests/unit/nep-explorer/ deliberately. scripts/evidence-lib.mjs
// routes test files to modules by directory name (tests/unit/<module>/**), and a
// directory that is NOT a registered renderer module is treated as shared
// scaffold and DUPLICATED into every module's evidence.json — which is what a
// tests/unit/demo-data/ home would have done with these records. Same reasoning
// as tests/unit/hep-waterfall/abnbl.test.js.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dataPath = path.join(rootDir, 'site', 'data', 'adbds.csv');

const HEADER = 'USUBJID,SITE,SITEID,SEX,RACE,ARM,VISIT,VISITNUM,TEST,STRESU,STRESN,STNRLO,STNRHI';

const PREFIX = 'AKI-';
const CREATININE = 'Creatinine';
const SITE = 'Nephrology Research Unit';
const PLACEBO = 'AKI: Placebo';
const ACTIVE = 'AKI: Study Drug';
const UMOL_PER_MGDL = 88.4;
const ABSOLUTE_RULE = 4.0; // mg/dL — KDIGO Stage 3 on the value reached (D5)

const raw = readFileSync(dataPath, 'utf8').trim();
const [header, ...lines] = raw.split('\n');
const columns = header.split(',');
const rows = lines
  .filter((line) => line.startsWith(PREFIX))
  .map((line) => Object.fromEntries(line.split(',').map((value, i) => [columns[i], value])));

// KDIGO staging as design §3.1 states it, recomputed here from the raw file.
const foldStage = (fold) => (fold >= 3 ? 3 : fold >= 2 ? 2 : fold >= 1.5 ? 1 : 0);
const deltaStage = (delta) => (delta >= 0.3 ? 1 : 0);

const participants = (() => {
  const byId = new Map();
  for (const row of rows) {
    if (row.TEST !== CREATININE) continue;
    if (!byId.has(row.USUBJID)) {
      byId.set(row.USUBJID, { id: row.USUBJID, arm: row.ARM, records: [] });
    }
    byId.get(row.USUBJID).records.push({
      visit: row.VISIT,
      visitn: Number(row.VISITNUM),
      // Every cohort record is written in umol/L, so the mg/dL contract runs
      // through the conversion path rather than around it (design §4).
      mgdl: Number(row.STRESN) / UMOL_PER_MGDL
    });
  }
  return [...byId.values()].map((participant) => {
    const baseline = participant.records.find((record) => record.visitn === 0);
    const post = participant.records.filter((record) => record.visitn > 0);
    const max = Math.max(...post.map((record) => record.mgdl));
    const fold = max / baseline.mgdl;
    const delta = max - baseline.mgdl;
    const absoluteRule = max >= ABSOLUTE_RULE;
    const fStage = foldStage(fold);
    const dStage = deltaStage(delta);
    return {
      ...participant,
      baseline: baseline.mgdl,
      max,
      fold,
      delta,
      absoluteRule,
      foldStage: fStage,
      deltaStage: dStage,
      // The combined stage the zones show: the worse of the two axes, raised to
      // 3 by the >= 4.0 mg/dL rule (design §3.1, D4, D5).
      stage: absoluteRule ? 3 : Math.max(fStage, dStage)
    };
  });
})();

const tally = (values) => {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  values.forEach((value) => {
    counts[value] += 1;
  });
  return counts;
};

describe('synthetic AKI demo cohort', () => {
  it('NEP-COHORT-001: the cohort is present, labelled synthetic, and carries the shared measure contract (#120)', () => {
    expect(header).toBe(HEADER);
    expect(participants.length).toBe(46);
    expect(new Set(rows.map((row) => row.SITE))).toEqual(new Set([SITE]));
    expect(new Set(rows.map((row) => row.TEST))).toEqual(new Set([CREATININE]));
    expect(new Set(rows.map((row) => row.ARM))).toEqual(new Set([PLACEBO, ACTIVE]));
    participants.forEach((participant) => {
      expect(participant.id.startsWith(PREFIX)).toBe(true);
    });
  });

  it('NEP-COHORT-002: every participant has a day-0 baseline and enough post-baseline visits to trace a path (#120)', () => {
    // The maximum is taken over the post-baseline series, so a single
    // on-treatment reading would make the chart a two-point story (design §5.3).
    participants.forEach((participant) => {
      const visits = participant.records.map((record) => record.visitn);
      expect(visits, participant.id).toContain(0);
      expect(participant.records.length, participant.id).toBeGreaterThanOrEqual(8);
      expect(new Set(visits).size, participant.id).toBe(participant.records.length);
    });
  });

  it('NEP-COHORT-003: creatinine is written in umol/L so the demo exercises the unit conversion (#120)', () => {
    // Writing the synthetic rows in mg/dL would let the demo bypass the
    // conversion path entirely — and that path is the one place a silent
    // staging error can hide (design §4, §5.3).
    expect(new Set(rows.map((row) => row.STRESU))).toEqual(new Set(['umol/L']));
    // One unit string for creatinine across the WHOLE file: a second spelling
    // would perturb every other renderer's display of this measure, which the
    // injection is not allowed to do (design §5.3).
    const allCreatinine = lines
      .map((line) => line.split(','))
      .filter((cells) => cells[columns.indexOf('TEST')] === CREATININE);
    expect(new Set(allCreatinine.map((cells) => cells[columns.indexOf('STRESU')]))).toEqual(
      new Set(['umol/L'])
    );
  });

  it('NEP-COHORT-004: the cohort ships no baseline flag, so the demo runs on the D7 fallback (#120)', () => {
    // adbds.csv has no baseline-flag column at all, which is the point: the
    // path most real studies take is the earliest-record fallback, so it is the
    // path the demo exercises.
    expect(columns).not.toContain('ABLFL');
    expect(columns.some((column) => /^(ABLFL|BASELINE|BLFL)$/i.test(column))).toBe(false);
  });

  it('NEP-COHORT-005: all four fold-change stages are populated (#120)', () => {
    // The finding that made D8 necessary: on pharmaverseadam alone this tally
    // reads 208 / 0 / 0 / 0 (design §5.2).
    expect(tally(participants.map((p) => p.foldStage))).toEqual({ 0: 19, 1: 12, 2: 8, 3: 7 });
  });

  it('NEP-COHORT-006: the delta axis carries Stage 1 and no-stage participants only (#120)', () => {
    // KDIGO defines exactly one cut-point on absolute change — 0.3 mg/dL — and
    // it only ever produces Stage 1 (design §3.1).
    const counts = tally(participants.map((p) => p.deltaStage));
    expect(counts).toEqual({ 0: 17, 1: 29, 2: 0, 3: 0 });
  });

  it('NEP-COHORT-007: the fold and delta stagings disagree in both directions (#120)', () => {
    // The summary table shows two marginal distributions plus the combined
    // stage (§6.4). A cohort where one axis nests inside the other would make
    // all three columns read the same and teach nothing.
    const deltaOnly = participants.filter((p) => p.foldStage === 0 && p.deltaStage === 1);
    const foldOnly = participants.filter((p) => p.foldStage >= 1 && p.deltaStage === 0);
    expect(deltaOnly.length).toBe(4);
    expect(foldOnly.length).toBe(2);
  });

  it('NEP-COHORT-008: the combined stage populates every zone the chart paints (#120)', () => {
    expect(tally(participants.map((p) => p.stage))).toEqual({ 0: 15, 1: 14, 2: 8, 3: 9 });
  });

  it('NEP-COHORT-009: participants trip the >= 4.0 mg/dL rule, including one the fold ladder alone would call Stage 1 (#120)', () => {
    // No real dataset here can reach it — the RhoInc maximum creatinine is
    // 1.93 mg/dL — so without this the D5 rule would be a unit-test-only
    // branch (design §5.2, §8).
    const tripped = participants.filter((p) => p.absoluteRule);
    expect(tripped.length).toBe(4);
    tripped.forEach((participant) => {
      expect(participant.max, participant.id).toBeGreaterThanOrEqual(ABSOLUTE_RULE);
    });
    // The demonstrator for D5: a participant on a high baseline whose rise is
    // only Stage 1 on the fold ladder but who reaches >= 4.0 mg/dL, so the mark
    // property — not the zone under the point — is what makes them Stage 3.
    const raisedByRuleAlone = tripped.filter((p) => p.foldStage === 1);
    expect(raisedByRuleAlone.length).toBe(2);
    raisedByRuleAlone.forEach((participant) => {
      expect(participant.stage, participant.id).toBe(3);
    });
  });

  it('NEP-COHORT-010: participants whose creatinine only falls are present, so the negative domain is visible (#120)', () => {
    // D6: the R source's y-limits start at zero and drop these silently — 21 of
    // 110 in the RhoInc data. They are the reference cloud that makes the
    // flagged corner readable, so the demo has to contain some.
    const falling = participants.filter((p) => p.delta < 0);
    expect(falling.length).toBe(3);
    falling.forEach((participant) => {
      expect(participant.fold, participant.id).toBeLessThan(1);
      expect(participant.delta, participant.id).toBeLessThan(-0.15);
    });
  });

  it('NEP-COHORT-011: the injury signal skews to the active arm and both arms are populated (#120)', () => {
    const active = participants.filter((p) => p.arm === ACTIVE);
    const placebo = participants.filter((p) => p.arm === PLACEBO);
    expect(active.length).toBeGreaterThanOrEqual(15);
    expect(placebo.length).toBeGreaterThanOrEqual(15);
    const staged = (group) => group.filter((p) => p.stage > 0).length;
    expect(staged(active)).toBeGreaterThan(staged(placebo));
  });

  it('NEP-COHORT-012: the injection leaves the pharmaverseadam population untouched (#120)', () => {
    // The blast radius guard (design §5.3): the cohort ADDS rows, it does not
    // edit the source extract, so every other renderer sees its own data plus
    // new participants and nothing else.
    const pilot = lines.filter((line) => /^0\d-\d{3}-\d{4},/.test(line));
    expect(pilot.length).toBe(56537);
    const cld = lines.filter((line) => line.startsWith('CLD-'));
    expect(cld.length).toBe(1024);
    expect(rows.length).toBe(46 * 8);
    expect(lines.length).toBe(pilot.length + cld.length + rows.length);
  });
});
