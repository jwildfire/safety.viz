// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import migrationView from '../../../src/hep-explorer/views/migration.js';
import { createSelection } from '../../../src/hep-explorer/selection.js';
import { syncSettings } from '../../../src/hep-explorer/configure.js';
import {
  assignSequence,
  cleanData,
  deriveBaseline
} from '../../../src/hep-explorer/structureData.js';
import {
  COMPOSITE_QUADRANTS,
  QUADRANT_STYLE,
  SEVERITY_ORDER,
  concernOf
} from '../../../src/hep-core/quadrants.js';
import { buildHepSubjects } from '../../../src/hep-core/subjects.js';

// The migration (Sankey) view of the hep-explorer module (obot.roadmap#43,
// safety.viz#92) — Figure 3 of Amirzadegan et al., Drug Safety 2025;48:443-453.
// The GEOMETRY is proved in sankeyLayout.test.js; these tests prove the PAINTING
// and the interaction: what the DOM says, what a click selects, what the notes
// report, and that the two ways into a selection (a ribbon and its cross-table
// cell) are the same way.
//
// Requirement groups: HEP-MIG-010, HEP-MIG-011, HEP-MIG-013, HEP-MIG-014,
// HEP-MIG-015, HEP-XTAB-001..006, HEP-STEP-001..003, HEP-STEP-005,
// HEP-ARM-003..006, HEP-ARM-008, HEP-ACC-001..003, HEP-DATA-012.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPOSITE_SRC = readFileSync(
  path.resolve(HERE, '../../../src/hep-explorer/views/composite.js'),
  'utf8'
);

const NN = 'Normal & NN';
const CH = 'Cholestasis';
const TC = "Temple's Corollary";
const HL = "Hy's Law";

// ULN 40 for ALT and 1.2 for TB, so elevation is ALT > 120 and TB > 2.4.
const MEASURES = {
  ALT: { STNRHI: 40, STNRLO: 6, STRESU: 'U/L' },
  TB: { STNRHI: 1.2, STNRLO: 0.1, STRESU: 'mg/dL' }
};

const VISITS = [
  { VISIT: 'Baseline', VISITNUM: 0, DY: 0 },
  { VISIT: 'Week 4', VISITNUM: 4, DY: 28 },
  { VISIT: 'Week 8', VISITNUM: 8, DY: 56 }
];

// [baseline, on-treatment, on-treatment]; the peak is the max of the last two.
// Migrations, by design, cover every level of concern on both sides and leave
// exactly one participant stuck in Hy's Law:
//   P-1 Placebo     Cholestasis -> Cholestasis          (gray, diagonal)
//   P-2 Placebo     Hy's Law -> Normal & NN             (green, favourable)
//   P-3 Placebo     Hy's Law -> Hy's Law                (gray, diagonal, STUCK)
//   P-4 Placebo     Temple's Corollary -> Cholestasis   (yellow, lateral)
//   A-1 Study Drug  Normal & NN -> Hy's Law             (red, unfavourable)
//   A-2 Study Drug  Temple's Corollary -> Temple's      (gray, diagonal)
//   A-3 Study Drug  Cholestasis -> Temple's Corollary   (yellow, lateral)
//   A-4 Study Drug  Normal & NN -> Temple's Corollary   (red, unfavourable)
//   X-1 Other Drug  Normal & NN -> Normal & NN          (arm designated NEITHER)
//   D-1 Placebo     ALT only, no total bilirubin        (no usable reduction)
const SUBJECTS = {
  'P-1': { ARM: 'Placebo', SEX: 'F', ALT: [80, 100, 90], TB: [3.6, 4.8, 4.2] },
  'P-2': { ARM: 'Placebo', SEX: 'M', ALT: [160, 100, 80], TB: [3.6, 2.4, 1.8] },
  'P-3': { ARM: 'Placebo', SEX: 'F', ALT: [200, 280, 240], TB: [3.6, 4.8, 4.2] },
  'P-4': { ARM: 'Placebo', SEX: 'M', ALT: [160, 80, 72], TB: [1.2, 3.6, 3.0] },
  'A-1': { ARM: 'Study Drug', SEX: 'F', ALT: [60, 200, 140], TB: [1.2, 3.6, 2.4] },
  'A-2': { ARM: 'Study Drug', SEX: 'M', ALT: [160, 240, 200], TB: [1.2, 1.8, 1.5] },
  'A-3': { ARM: 'Study Drug', SEX: 'F', ALT: [80, 200, 160], TB: [3.6, 1.8, 1.5] },
  'A-4': { ARM: 'Study Drug', SEX: 'M', ALT: [60, 160, 120], TB: [1.2, 1.8, 1.5] },
  'X-1': { ARM: 'Other Drug', SEX: 'F', ALT: [60, 80, 70], TB: [1.2, 1.5, 1.4] },
  'D-1': { ARM: 'Placebo', SEX: 'M', ALT: [60, 80, 70] }
};

function makeData() {
  const rows = [];
  Object.entries(SUBJECTS).forEach(([USUBJID, spec]) => {
    Object.entries(MEASURES).forEach(([TEST, meta]) => {
      const values = spec[TEST];
      if (!values) return;
      VISITS.forEach((visit, index) => {
        rows.push({
          USUBJID,
          ARM: spec.ARM,
          SEX: spec.SEX,
          TEST,
          STRESN: values[index],
          STRESU: meta.STRESU,
          STNRLO: meta.STNRLO,
          STNRHI: meta.STNRHI,
          ...visit
        });
      });
    });
  });
  return rows;
}

/**
 * A stand-in hep-explorer instance: the shell members and the shared selection
 * layer the view touches, and nothing else. The orchestrator's own wiring
 * (view registry, slot visibility, the View control) is browser evidence.
 */
function makeHost(overrides = {}, data = makeData()) {
  const settings = syncSettings({
    studyday_col: 'DY',
    visit_col: 'VISIT',
    visitn_col: 'VISITNUM',
    measure_values: { ALT: 'ALT', AST: 'AST', TB: 'TB', ALP: 'ALP' },
    arm_col: 'ARM',
    placebo_arm: 'Placebo',
    active_arms: ['Study Drug'],
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    groups: [{ value_col: 'ARM', label: 'Treatment Group' }],
    ...overrides
  });
  const { rows } = cleanData(data, settings);
  deriveBaseline(rows, settings);
  assignSequence(rows, settings);

  const root = document.createElement('div');
  root.className = 'sv-root safety-hep-explorer';
  const notes = document.createElement('div');
  const footnote = document.createElement('div');
  const migrationWrap = document.createElement('div');
  const section = document.createElement('div');
  const header = document.createElement('div');
  root.append(notes, footnote, migrationWrap, section, header);
  document.body.append(root);

  const host = {
    settings,
    cleanRows: rows,
    root,
    notes,
    footnote,
    migrationWrap,
    compositeSelectSection: section,
    compositeHeaderEl: header,
    compositeSelectEl: null,
    compositeClearBtn: null,
    participantsSelected: [],
    switchView: vi.fn(),
    state: {
      filters: {},
      hideUnchanged: Boolean(settings.hide_unchanged),
      activeArms: settings.active_arms
    }
  };
  host.selection = createSelection(host);
  host.selection.bind({
    selectedIds: () => migrationView.selectedIds(host),
    changed: (ids) => migrationView.onParticipantsChanged(host, ids),
    cleared: () => migrationView.clearSelection(host)
  });
  return host;
}

function render(host, carriedIds = []) {
  migrationView.teardown(host);
  host.notes.innerHTML = '';
  host.footnote.textContent = '';
  host.migrationWrap.innerHTML = '';
  host.root.$hepSankey = null;
  migrationView.render(host, { carriedIds });
  return host;
}

const mounted = (overrides, data) => render(makeHost(overrides, data));

// Keys carry apostrophes and pipes, and this jsdom build has no CSS.escape, so
// match on the dataset rather than building an attribute selector.
const byKey = (host, selector, key) =>
  [...host.migrationWrap.querySelectorAll(selector)].find((el) => el.dataset.key === key) || null;

const ribbon = (host, side, pre, post) => byKey(host, '.hep-ribbon', `${side}|${pre}|${post}`);

const cellOf = (host, side, pre, post) => byKey(host, '.hep-xtab-cell', `${side}|${pre}|${post}`);

const byNode = (host, selector, id) =>
  [...host.migrationWrap.querySelectorAll(selector)].find((el) => el.dataset.node === id) || null;

const nodeRect = (host, column, quadrant) =>
  byNode(host, '.hep-sankey-node', `${column}|${quadrant}`);

const nodeLabel = (host, column, quadrant) =>
  byNode(host, '.hep-sankey-node-label', `${column}|${quadrant}`);

const fire = (el, type, init = {}) => el.dispatchEvent(new Event(type, { bubbles: true, ...init }));

describe('hep-explorer migration view — the diagram', () => {
  it('HEP-MIG-014: the view renders BOTH an svg plot and cross tables in the main column (#92)', () => {
    const host = mounted();
    // The shell contract (tests/e2e/site.spec.js) is satisfied by the tables;
    // the diagram is the svg. Neither may be dropped without the other noticing.
    expect(host.migrationWrap.querySelectorAll('svg.hep-sankey')).toHaveLength(1);
    expect(host.migrationWrap.querySelectorAll('table').length).toBeGreaterThanOrEqual(2);
  });

  it('HEP-MIG-015: the computed node and ribbon geometry is exposed on the root as $hepSankey (#92)', () => {
    const host = mounted();
    const geometry = host.root.$hepSankey;
    expect(geometry).toBeTruthy();
    expect(geometry.nodes).toHaveLength(3 * SEVERITY_ORDER.length);
    expect(geometry.scale).toBeGreaterThan(0);
    // Every painted ribbon is described in the stash, keyed the same way.
    const painted = [...host.migrationWrap.querySelectorAll('.hep-ribbon')].map(
      (path) => path.dataset.key
    );
    expect(geometry.ribbons.map((r) => r.key).sort()).toEqual([...painted].sort());
    geometry.ribbons.forEach((r) => {
      expect(Number.isInteger(r.centre.y0)).toBe(true);
      expect(Number.isInteger(r.outer.y1)).toBe(true);
    });
  });

  it('HEP-MIG-010: node fills are the QUADRANT_STYLE hexes, so a quadrant is one colour in Figs 3 and 4 (#92)', () => {
    const host = mounted();
    const rects = [...host.migrationWrap.querySelectorAll('.hep-sankey-node')];
    expect(rects).toHaveLength(12);
    rects.forEach((rect) => {
      expect(rect.getAttribute('fill')).toBe(QUADRANT_STYLE[rect.dataset.quadrant].color);
    });
  });

  it('HEP-MIG-011: every node label carries the quadrant name and its per-arm counts (#92)', () => {
    const host = mounted();
    // The centre node holds BOTH arms' baseline counts, printed as placebo /
    // active, so geometry never carries the message alone.
    expect(nodeLabel(host, 'centre', HL).textContent).toBe(`${HL} 2 / 0`);
    expect(nodeLabel(host, 'centre', NN).textContent).toBe(`${NN} 0 / 2`);
    // A flanking node carries that arm's own on-treatment count.
    expect(nodeLabel(host, 'right', TC).textContent).toBe(`${TC} 3`);
  });

  it('HEP-MIG-004: Cholestasis and Temple’s Corollary sit under one shared tier label (#92)', () => {
    const host = mounted();
    const labels = [...host.migrationWrap.querySelectorAll('.hep-sankey-tier-label')];
    expect(labels).toHaveLength(3);
    expect(labels[1].textContent).toBe('Single-analyte elevation');
    // Both sub-nodes really are in that tier band.
    expect(nodeRect(host, 'centre', CH).getAttribute('y')).not.toBeNull();
    expect(labels.map((label) => label.dataset.tier)).toEqual(['0', '1', '2']);
  });

  it('HEP-MIG-013: Hide unchanged removes the diagonal ribbons and reports the hidden count (#92)', () => {
    const host = makeHost();
    render(host);
    const all = host.migrationWrap.querySelectorAll('.hep-ribbon').length;
    const diagonal = [...host.migrationWrap.querySelectorAll('.hep-ribbon')].filter(
      (path) => path.dataset.pre === path.dataset.post
    ).length;
    expect(diagonal).toBe(3);

    host.state.hideUnchanged = true;
    render(host);
    expect(host.migrationWrap.querySelectorAll('.hep-ribbon')).toHaveLength(all - diagonal);
    expect(
      [...host.migrationWrap.querySelectorAll('.hep-ribbon')].every(
        (path) => path.dataset.pre !== path.dataset.post
      )
    ).toBe(true);
    // The participants are hidden, never dropped: the count stays in the notes
    // and the cross tables still hold them.
    expect(host.notes.textContent).toContain('3 no-migration participants hidden');
    expect(cellOf(host, 'placebo', HL, HL).textContent).toBe('1');
  });
});

describe('hep-explorer migration view — cross tables', () => {
  it('HEP-XTAB-001: one cross table per designated arm, rows and columns in severity order (#92)', () => {
    const host = mounted();
    const tables = [...host.migrationWrap.querySelectorAll('.hep-xtab table')];
    expect(tables.map((table) => table.dataset.side)).toEqual(['placebo', 'active']);
    tables.forEach((table) => {
      const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
      expect(headers).toEqual(['Baseline ↓ / On-treatment →', ...SEVERITY_ORDER, 'Total']);
      const rowHeads = [...table.querySelectorAll('tbody td.hep-rowhead')].map(
        (td) => td.textContent
      );
      expect(rowHeads).toEqual([...SEVERITY_ORDER, 'Total']);
    });
  });

  it('HEP-XTAB-002: each cross table carries row totals, column totals and a grand total (#92)', () => {
    const host = mounted();
    const placebo = host.migrationWrap.querySelector('.hep-xtab table[data-side="placebo"]');
    const grand = placebo.querySelector('tbody tr:last-child td:last-child');
    expect(grand.textContent).toBe('4');
    // Two placebo participants start in Hy's Law (P-2, P-3): that is the HL row
    // total, and one of them ends there, which is the HL column total.
    const hlRow = placebo.querySelectorAll('tbody tr')[0];
    expect(hlRow.querySelector('td.hep-rowhead').textContent).toBe(HL);
    expect(hlRow.querySelector('td:last-child').textContent).toBe('2');
    const totalsRow = placebo.querySelector('tbody tr:last-child');
    expect([...totalsRow.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'Total',
      '1',
      '2',
      '0',
      '1',
      '4'
    ]);
  });

  it('HEP-XTAB-003: interior cells are shaded by concernOf and a concern legend is rendered (#92)', () => {
    const host = mounted();
    const cells = [...host.migrationWrap.querySelectorAll('.hep-xtab-cell')];
    expect(cells).toHaveLength(2 * SEVERITY_ORDER.length * SEVERITY_ORDER.length);
    cells.forEach((cell) => {
      const expected = concernOf(cell.dataset.pre, cell.dataset.post);
      // jsdom normalizes the hex to rgb(); compare via a scratch element.
      const probe = document.createElement('div');
      probe.style.background = {
        red: '#f28b82',
        yellow: '#fdd663',
        green: '#81c995',
        gray: '#dadce0'
      }[expected];
      expect(cell.style.background).toBe(probe.style.background);
    });
    expect(
      host.migrationWrap.querySelectorAll('.hep-concern-legend .hep-legend-item')
    ).toHaveLength(4);
  });

  it('HEP-XTAB-004: every cross-table cell count equals its ribbon’s participant count (#92)', () => {
    const host = mounted();
    let checked = 0;
    [...host.migrationWrap.querySelectorAll('.hep-ribbon')].forEach((path) => {
      const cell = byKey(host, '.hep-xtab-cell', path.dataset.key);
      expect(cell, `no cross-table cell for ${path.dataset.key}`).not.toBeNull();
      expect(cell.textContent).toBe(path.dataset.count);
      checked += 1;
    });
    expect(checked).toBe(8);
    // And the converse: an empty cell has no ribbon at all.
    expect(cellOf(host, 'active', HL, NN).textContent).toBe('0');
    expect(ribbon(host, 'active', HL, NN)).toBeNull();
  });

  it('HEP-XTAB-005: a cross-table cell click selects exactly what its ribbon click selects (#92)', () => {
    const host = mounted();
    fire(ribbon(host, 'active', NN, HL), 'click');
    const viaRibbon = [...host.migrationSelectedIds];
    const keyViaRibbon = host.migrationSelectedKey;
    expect(viaRibbon).toEqual(['A-1']);

    migrationView.clearSelection(host);
    expect(host.migrationSelectedIds).toEqual([]);

    cellOf(host, 'active', NN, HL).click();
    expect(host.migrationSelectedIds).toEqual(viaRibbon);
    expect(host.migrationSelectedKey).toBe(keyViaRibbon);
    // Both routes go through ONE index, so parity is structural, not incidental.
    expect(host.migrationCellIndex.get(keyViaRibbon).ids).toEqual(viaRibbon);
  });

  it('HEP-XTAB-006: the composite view keeps its own pooled table in its own order (#92)', () => {
    const host = mounted();
    const migrationHeaders = [
      ...host.migrationWrap.querySelectorAll('.hep-xtab table[data-side="placebo"] thead th')
    ]
      .slice(1, -1)
      .map((th) => th.textContent);
    expect(migrationHeaders).toEqual(SEVERITY_ORDER);
    // Severity order is NOT the FDA factor order, so the two tables genuinely
    // read differently — and the composite view still builds its single pooled
    // table over COMPOSITE_QUADRANTS, untouched by this view.
    expect(migrationHeaders).not.toEqual(COMPOSITE_QUADRANTS);
    expect(COMPOSITE_SRC).toMatch(/COMPOSITE_QUADRANTS\.forEach\(\(pre\)/);
    expect(COMPOSITE_SRC).not.toMatch(/SEVERITY_ORDER/);
  });
});

describe('hep-explorer migration view — selection and the two-step hand-off', () => {
  it('HEP-STEP-001: clicking a ribbon selects that flow’s participants and dispatches them (#92)', () => {
    const host = mounted();
    const seen = [];
    host.root.addEventListener('participantsSelected', (event) => seen.push(event.detail.data));

    fire(ribbon(host, 'placebo', HL, NN), 'click');
    expect(host.migrationSelectedIds).toEqual(['P-2']);
    expect(seen).toEqual([['P-2']]);
    // The shared Participants control mirrors it — no parallel mechanism.
    expect([...host.compositeSelectEl.selectedOptions].map((opt) => opt.value)).toEqual(['P-2']);
    expect(host.compositeClearBtn.disabled).toBe(false);
    expect(host.compositeHeaderEl.textContent).toBe('Participant P-2 selected.');
  });

  it('HEP-STEP-002: the footnote states the shift, its arm and its count, and offers the composite review (#92)', () => {
    const host = mounted();
    expect(host.footnote.querySelector('.hep-step-btn')).toBeNull();

    fire(ribbon(host, 'active', NN, HL), 'click');
    const text = host.footnote.textContent;
    expect(text).toContain('1 participant');
    expect(text).toContain(`${NN} → ${HL}`);
    expect(text).toContain('active drug');
    expect(host.footnote.querySelector('.hep-step-btn').textContent).toBe(
      'Review these 1 in the composite plot'
    );
  });

  it('HEP-STEP-003: the review control hands the flow to the composite view (#92)', () => {
    const host = mounted();
    fire(ribbon(host, 'active', NN, HL), 'click');
    host.footnote.querySelector('.hep-step-btn').click();
    // The orchestrator owns the switch (the module's only view dispatch); the
    // carried selection is already the flow's participants, so the composite
    // panels reopen on exactly them.
    expect(host.switchView).toHaveBeenCalledWith('composite');
    expect(host.participantsSelected).toEqual(['A-1']);
  });

  it('HEP-STEP-005: a non-empty Hy’s Law self-flow raises the caution the paper acknowledges (#92)', () => {
    const host = mounted();
    const caution = host.migrationWrap.querySelector('.hep-sankey-caution');
    expect(caution).not.toBeNull();
    expect(caution.textContent).toContain("1 participant remained in Hy's Law throughout");
    expect(caution.textContent).toContain('cannot detect worsening within a category');

    caution.querySelector('.hep-step-btn').click();
    expect(host.migrationSelectedIds).toEqual(['P-3']);

    // With nobody stuck in Hy's Law the caution is absent rather than empty.
    const clean = { ...SUBJECTS };
    delete clean['P-3'];
    const rows = [];
    Object.entries(clean).forEach(([USUBJID, spec]) => {
      Object.entries(MEASURES).forEach(([TEST, meta]) => {
        if (!spec[TEST]) return;
        VISITS.forEach((visit, index) => {
          rows.push({
            USUBJID,
            ARM: spec.ARM,
            SEX: spec.SEX,
            TEST,
            STRESN: spec[TEST][index],
            STRESU: meta.STRESU,
            STNRLO: meta.STNRLO,
            STNRHI: meta.STNRHI,
            ...visit
          });
        });
      });
    });
    const without = mounted({}, rows);
    expect(without.migrationWrap.querySelector('.hep-sankey-caution')).toBeNull();
  });

  it('HEP-SELECT-006: a selection carried in from another view arrives selected here (#92)', () => {
    const host = makeHost();
    render(host, ['A-1', 'not-in-cohort']);
    expect(host.migrationSelectedIds).toEqual(['A-1']);
    expect(host.compositeHeaderEl.textContent).toBe('Participant A-1 selected.');
    // A carried set that is not exactly one flow leaves no flow selected, so
    // the hand-off cannot claim a shift the reviewer did not choose.
    expect(host.migrationSelectedKey).toBeNull();
  });
});

describe('hep-explorer migration view — arms, cohort and notes', () => {
  it('HEP-ARM-004: participants in an arm designated neither side are excluded and counted (#92)', () => {
    const host = mounted();
    expect(host.migrationShown.map((subject) => subject.id).sort()).toEqual([
      'A-1',
      'A-2',
      'A-3',
      'A-4',
      'P-1',
      'P-2',
      'P-3',
      'P-4'
    ]);
    expect(host.notes.textContent).toContain(
      '1 participant excluded: arm not designated placebo or active'
    );
    expect(host.notes.textContent).toContain('8 of 10 participants shown');
  });

  it('HEP-DATA-012: participants without a usable baseline or on-treatment measurement are counted (#92)', () => {
    const host = mounted();
    // D-1 carries ALT but no total bilirubin, so it has no reduction at all.
    expect(host.notes.textContent).toContain(
      '1 participant excluded (missing baseline or on-treatment ALT/total bilirubin)'
    );
  });

  it('HEP-ARM-005: one designated side degrades to a one-directional plot with a warning (#92)', () => {
    const host = mounted({ active_arms: ['Not An Arm'] });
    expect(host.migrationWrap.querySelectorAll('.hep-ribbon').length).toBeGreaterThan(0);
    expect(
      [...host.migrationWrap.querySelectorAll('.hep-ribbon')].every(
        (path) => path.dataset.side === 'placebo'
      )
    ).toBe(true);
    expect(host.notes.textContent).toContain('Only one treatment side is designated');
    // Degrades, never throws: the empty side still gets its cross table.
    expect(host.migrationWrap.querySelectorAll('.hep-xtab table')).toHaveLength(2);
  });

  it('HEP-ARM-006: arm designation scopes THIS view only (#92)', () => {
    const host = mounted();
    // The shared reduction still carries every participant with usable liver
    // tests, including the undesignated arm; only the migration cohort narrows.
    const all = buildHepSubjects(host.cleanRows, host.settings).subjects;
    expect(all).toHaveLength(9);
    expect(all.some((subject) => subject.id === 'X-1')).toBe(true);
    expect(host.migrationShown).toHaveLength(8);
    expect(host.migrationShown.some((subject) => subject.id === 'X-1')).toBe(false);
  });

  it('HEP-ARM-008: pooling several active arms into one side is disclosed by name (#92)', () => {
    // Placebo designated, active_arms unset, two non-placebo arms (Study Drug,
    // Other Drug) both pool onto the single active side. That aggregate must be
    // disclosed by name so a reviewer is never shown a pooled drug comparison
    // as if it were a single arm (arms.js contract, lines 165-166).
    const host = mounted({ active_arms: null });
    const warnings = [...host.notes.querySelectorAll('.sv-warning')].map((el) => el.textContent);
    const pooled = warnings.find((text) => text.includes('Active side pools'));
    expect(pooled).toBeTruthy();
    expect(pooled).toContain('Study Drug');
    expect(pooled).toContain('Other Drug');
    expect(pooled).toContain('Active arm');
    // Narrowing to a single named arm leaves nothing pooled, so the disclosure
    // is gone.
    host.state.activeArms = ['Study Drug'];
    render(host);
    expect(host.notes.textContent).not.toContain('Active side pools');
  });

  it('HEP-ARM-003: the Active arm control narrows the right-hand side to one arm (#92)', () => {
    const host = makeHost({ active_arms: null });
    render(host);
    expect(
      new Set(
        [...host.migrationWrap.querySelectorAll('.hep-ribbon')]
          .filter((path) => path.dataset.side === 'active')
          .map((path) => path.dataset.key)
      ).size
    ).toBeGreaterThan(0);
    // Pooled: both non-placebo arms are on the active side, so nobody is
    // excluded for an undesignated arm.
    expect(host.notes.textContent).not.toContain('arm not designated');

    host.state.activeArms = ['Study Drug'];
    render(host);
    expect(host.notes.textContent).toContain('arm not designated');
  });
});

describe('hep-explorer migration view — accessibility', () => {
  it('HEP-ACC-001: every ribbon is focusable, is a button, and names its count, quadrants, arm and concern (#92)', () => {
    const host = mounted();
    const ribbons = [...host.migrationWrap.querySelectorAll('.hep-ribbon')];
    expect(ribbons).toHaveLength(8);
    ribbons.forEach((path) => {
      expect(path.getAttribute('role')).toBe('button');
      expect(path.getAttribute('tabindex')).toBe('0');
      expect(path.getAttribute('aria-label')).toBeTruthy();
    });
    expect(ribbon(host, 'active', NN, HL).getAttribute('aria-label')).toBe(
      `1 participant shifted from ${NN} to ${HL} on active drug — unfavourable`
    );
    expect(ribbon(host, 'placebo', HL, NN).getAttribute('aria-label')).toBe(
      `1 participant shifted from ${HL} to ${NN} on placebo — favourable`
    );
    expect(ribbon(host, 'placebo', HL, HL).getAttribute('aria-label')).toBe(
      `1 participant remained in ${HL} on placebo — no migration`
    );
  });

  it('HEP-ACC-002: Enter and Space activate a focused ribbon, selecting what a click selects (#92)', () => {
    const host = mounted();
    const target = ribbon(host, 'active', NN, TC);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.migrationSelectedIds).toEqual(['A-4']);

    migrationView.clearSelection(host);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(host.migrationSelectedIds).toEqual(['A-4']);

    // An unrelated key does nothing.
    migrationView.clearSelection(host);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(host.migrationSelectedIds).toEqual([]);
  });

  it('HEP-ACC-003: the svg is role="img" and its name summarises both arms’ shift counts (#92)', () => {
    const host = mounted();
    const svg = host.migrationWrap.querySelector('svg.hep-sankey');
    expect(svg.getAttribute('role')).toBe('img');
    const label = svg.getAttribute('aria-label');
    expect(label).toContain('Placebo: 0 unfavourable and 1 favourable shifts among 4 participants');
    expect(label).toContain(
      'Active drug: 2 unfavourable and 0 favourable shifts among 4 participants'
    );
  });

  it('HEP-MIG-008: hovering a ribbon marks it and its two endpoint nodes, and shows an HTML tooltip (#92)', () => {
    const host = mounted();
    const target = ribbon(host, 'active', NN, HL);
    fire(target, 'pointerenter');
    expect(target.classList.contains('is-active')).toBe(true);
    expect(nodeRect(host, 'centre', NN).classList.contains('is-active')).toBe(true);
    expect(nodeRect(host, 'right', HL).classList.contains('is-active')).toBe(true);
    // A real HTML div, not an svg <title>: native tooltips never appear in a
    // screenshot, so a <title> could not be evidenced.
    const tip = host.migrationWrap.querySelector('.hep-tip');
    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(tip.textContent).toContain(`${NN} → ${HL}`);

    fire(target, 'pointerleave');
    expect(target.classList.contains('is-active')).toBe(false);
    expect(tip.classList.contains('is-visible')).toBe(false);
  });
});
