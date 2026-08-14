import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kmEstimate } from '../../../src/time-to-event/km.js';

// Cross-validation of km.js against R's survival::survfit (#128, design §7): the
// committed fixture fixtures/survfit-reference.json holds the reference estimate —
// survfit(Surv(AVAL, CNSR == 0) ~ 1, conf.type = "log-log") — for every PARAMCD × ARM
// of the demo adtte.csv, generated at full precision by scripts/build-tte-fixture.R
// (provenance header inside). This test replays the same inputs through kmEstimate and
// asserts agreement, so the JS estimator is pinned to the reference implementation on
// real-shaped data, not just the hand-computed textbook cases in km.test.js.

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, 'fixtures/survfit-reference.json'), 'utf8'));

function loadAdtte() {
  const [header, ...lines] = readFileSync(join(here, '../../../site/data/adtte.csv'), 'utf8')
    .trim()
    .split('\n');
  const cols = header.split(',');
  return lines.map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}

describe('kmEstimate vs survival::survfit on the demo adtte.csv', () => {
  const rows = loadAdtte();
  expect(fixture.groups.length).toBeGreaterThan(0);

  for (const group of fixture.groups) {
    it(`TTE-STAT-004: agrees with survfit for ${group.paramcd} / ${group.arm} (#128)`, () => {
      const observations = rows
        .filter((r) => r.PARAMCD === group.paramcd && r.ARM === group.arm)
        .map((r) => ({ time: Number(r.AVAL), event: r.CNSR === '0', id: r.USUBJID }));
      expect(observations).toHaveLength(group.n);

      const estimate = kmEstimate(observations);
      const times = [].concat(group.time);
      expect(estimate.points.map((p) => p.time)).toEqual(times);

      estimate.points.forEach((p, i) => {
        expect(p.atRisk).toBe([].concat(group.n_risk)[i]);
        expect(p.events).toBe([].concat(group.n_event)[i]);
        expect(p.surv).toBeCloseTo([].concat(group.surv)[i], 10);
        const lower = [].concat(group.lower)[i];
        const upper = [].concat(group.upper)[i];
        // survfit reports NA (serialized null) where the interval is undefined; km.js
        // reports null there — the two must agree on where that happens, too.
        if (lower == null) expect(p.lo).toBeNull();
        else expect(p.lo).toBeCloseTo(lower, 10);
        if (upper == null) expect(p.hi).toBeNull();
        else expect(p.hi).toBeCloseTo(upper, 10);
      });
    });
  }
});
