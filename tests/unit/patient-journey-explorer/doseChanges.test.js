import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { normalizeDomain } from '../../../src/patient-journey-explorer/normalize.js';
import { deriveDoseChanges } from '../../../src/patient-journey-explorer/structureData.js';

// Dose-change derivation for the patient-journey-explorer module (#142,
// design §5.5): consecutive exposure records per subject, ordered by start,
// classified as increase / reduction / interruption / restart and dated to the
// day the new dose begins. PJE-DERIV-001. The segmentation and glyph claims of
// PJE-LANE-006 are drawn behaviour and are asserted in the browser (PC-15).

const settings = syncSettings({});
const ex = (rows) =>
  normalizeDomain(
    rows.map((row) => ({ USUBJID: 'P1', EXTRT: 'XANOMELINE', EXDOSU: 'mg', ...row })),
    'EX',
    settings
  ).events;

describe('deriveDoseChanges (PJE-DERIV-001)', () => {
  it('PJE-DERIV-001: 54 -> 81 is an increase dated to the day the new dose begins, not the day the old one ended (#142)', () => {
    const changes = deriveDoseChanges(
      ex([
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
        { EXDOSE: 81, ASTDY: 17, AENDY: 174 }
      ]),
      settings
    );
    expect(changes).toHaveLength(1);
    const [change] = changes;
    expect(change).toMatchObject({
      id: 'DOSE-1',
      domain: 'EX',
      lane: 'doseChanges',
      subject: 'P1',
      kind: 'point',
      day: 17,
      start: 17,
      end: null,
      endState: 'closed',
      placeable: true,
      label: '54 → 81 mg',
      detail: 'increase',
      category: 'XANOMELINE',
      value: 81,
      unit: 'mg',
      previousValue: 54,
      previousSourceIndex: 0,
      sourceIndex: 1,
      sourceAnchorId: 'pje-src-EX-1'
    });
    expect(change.flags).toMatchObject({ derived: true, direction: 'increase' });
    expect(change.dayCol).toBe('ASTDY');
  });

  it('PJE-DERIV-001: the four directions — increase, reduction, interruption, restart (#142)', () => {
    const changes = deriveDoseChanges(
      ex([
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
        { EXDOSE: 81, ASTDY: 17, AENDY: 100 },
        { EXDOSE: 54, ASTDY: 101, AENDY: 120 },
        { EXDOSE: 0, ASTDY: 121, AENDY: 130 },
        { EXDOSE: 54, ASTDY: 131, AENDY: 180 }
      ]),
      settings
    );
    expect(changes.map((c) => [c.day, c.flags.direction, c.label])).toEqual([
      [17, 'increase', '54 → 81 mg'],
      [101, 'reduction', '81 → 54 mg'],
      [121, 'interruption', '54 → 0 mg'],
      [131, 'restart', '0 → 54 mg']
    ]);
  });

  it('PJE-DERIV-001: 0 -> 0 -> 0 (placebo) yields no change (#142)', () => {
    expect(
      deriveDoseChanges(
        ex([
          { EXDOSE: 0, ASTDY: 1, AENDY: 50 },
          { EXDOSE: 0, ASTDY: 51, AENDY: 100 },
          { EXDOSE: 0, ASTDY: 101, AENDY: 180 }
        ]),
        settings
      )
    ).toEqual([]);
  });

  it('PJE-DERIV-001: an exposure gap at the same dose is not a change (#142)', () => {
    expect(
      deriveDoseChanges(
        ex([
          { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
          { EXDOSE: 54, ASTDY: 30, AENDY: 60 }
        ]),
        settings
      )
    ).toEqual([]);
  });

  it('PJE-DERIV-001: records are walked in start order regardless of input order, and a same-day tie is broken by sourceIndex (#142)', () => {
    const reordered = deriveDoseChanges(
      ex([
        { EXDOSE: 81, ASTDY: 17, AENDY: 174 },
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 }
      ]),
      settings
    );
    expect(reordered.map((c) => [c.day, c.flags.direction, c.id])).toEqual([
      [17, 'increase', 'DOSE-0']
    ]);
    const tied = deriveDoseChanges(
      ex([
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
        { EXDOSE: 54, ASTDY: 17, AENDY: 17 },
        { EXDOSE: 81, ASTDY: 17, AENDY: 174 }
      ]),
      settings
    );
    expect(
      tied.map((c) => [c.day, c.flags.direction, c.previousSourceIndex, c.sourceIndex])
    ).toEqual([[17, 'increase', 1, 2]]);
  });

  it('PJE-DERIV-001: same-day duplicates at the same dose produce nothing (#142)', () => {
    expect(
      deriveDoseChanges(
        ex([
          { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
          { EXDOSE: 54, ASTDY: 1, AENDY: 16 }
        ]),
        settings
      )
    ).toEqual([]);
  });

  it('PJE-DERIV-001: a record with no usable start or a non-numeric dose is skipped, not paired (#142)', () => {
    const changes = deriveDoseChanges(
      ex([
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
        { EXDOSE: 81, ASTDY: '', AENDY: '' },
        { EXDOSE: 'x', ASTDY: 20, AENDY: 30 },
        { EXDOSE: 27, ASTDY: 40, AENDY: 60 }
      ]),
      settings
    );
    expect(changes.map((c) => [c.day, c.flags.direction, c.previousSourceIndex])).toEqual([
      [40, 'reduction', 0]
    ]);
  });

  it('PJE-DERIV-001: the change carries both defining rows for the source drawer (#142)', () => {
    const events = ex([
      { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
      { EXDOSE: 81, ASTDY: 17, AENDY: 174 }
    ]);
    const [change] = deriveDoseChanges(events, settings);
    expect(change.source).toBe(events[1].source);
    expect(change.previousSource).toBe(events[0].source);
    expect(change.previousSourceIndex).toBe(0);
    expect(change.flagged).toEqual([]);
  });

  it('PJE-DERIV-001: empty and non-array input yield [] (#142)', () => {
    expect(deriveDoseChanges([], settings)).toEqual([]);
    expect(deriveDoseChanges(null, settings)).toEqual([]);
    expect(deriveDoseChanges(ex([{ EXDOSE: 54, ASTDY: 1 }]), settings)).toEqual([]);
  });
});
