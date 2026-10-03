import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  parseRequirementMatrix,
  buildRequirementSet,
  compareRequirements,
  duplicateRequirementIds,
  KNOWN_DUPLICATE_IDS
} from '../../../scripts/requirements-lib.mjs';

// Requirement-text sync (#63): extract the reviewed requirement text from the
// requirements/ matrices into a committed docs/requirements/<module>.json so the
// evidence pages can show what each test evidences without leaving the page.
// The extract is a pure function of the matrix markdown; a freshness guard
// (compareRequirements) keeps the vendored copy from drifting.

const matrixMd = readFileSync(new URL('./fixtures/requirement-matrix.md', import.meta.url), 'utf8');

describe('requirements-lib: matrix parsing (#63)', () => {
  const requirements = parseRequirementMatrix(matrixMd);

  it('maps each requirement ID to its reviewed text', () => {
    expect(requirements['SH-FUNC-004A']).toBe(
      'Render a gray normal-range band behind histogram data using the measure limits.'
    );
    expect(requirements['SH-CFG-005']).toBe(
      'Missing and non-numeric results are dropped and counted.'
    );
  });

  it('keeps an escaped pipe inside a requirement cell as a single row', () => {
    // A `\|` in the source renders as a literal pipe; it must not split the row.
    expect(Object.keys(requirements)).toContain('SH-REG-013');
    expect(requirements['SH-REG-013']).toBe(
      'Confirm that adding a filter such as {"value_col":"SITE"} | leaves the x-axis unchanged.'
    );
  });

  it('ignores the header, separator, and non-requirement content', () => {
    // The `## Source inventory` bullet list and the table header/separator
    // rows must not appear as requirement entries.
    expect(requirements).not.toHaveProperty('ID');
    expect(Object.keys(requirements)).toEqual([
      'SH-FUNC-004A',
      'SH-FUNC-004B',
      'SH-CFG-005',
      'SH-REG-013'
    ]);
  });
});

describe('requirements-lib: requirement set (#63)', () => {
  it('wraps the parsed map with module + matrix provenance', () => {
    const set = buildRequirementSet({
      module: 'histogram',
      matrix: 'safety-histogram.md',
      markdown: matrixMd
    });
    expect(set.module).toBe('histogram');
    expect(set.matrix).toBe('safety-histogram.md');
    expect(set.requirements['SH-FUNC-004A']).toContain('gray normal-range band');
  });
});

describe('requirements-lib: freshness guard (#63)', () => {
  const base = buildRequirementSet({
    module: 'histogram',
    matrix: 'safety-histogram.md',
    markdown: matrixMd
  });

  it('reports fresh when the committed set matches a fresh extraction', () => {
    const { stale, differences } = compareRequirements(base, base);
    expect(stale).toBe(false);
    expect(differences).toEqual([]);
  });

  it('flags changed requirement text', () => {
    const drifted = {
      ...base,
      requirements: { ...base.requirements, 'SH-CFG-005': 'Reworded requirement.' }
    };
    const { stale, differences } = compareRequirements(base, drifted);
    expect(stale).toBe(true);
    expect(differences.join(' ')).toContain('SH-CFG-005');
  });

  it('flags added and removed requirement IDs', () => {
    const { ['SH-REG-013']: _removed, ...rest } = base.requirements;
    const removed = { ...base, requirements: rest };
    expect(compareRequirements(base, removed).stale).toBe(true);

    const added = {
      ...base,
      requirements: { ...base.requirements, 'SH-NEW-001': 'A new requirement.' }
    };
    expect(compareRequirements(base, added).stale).toBe(true);
  });
});

describe('requirements-lib: one row per requirement ID across the matrices (#193)', () => {
  const row = (id, text) => `| ${id} | AREA | ${text} | src | unit | test | ai-reviewed | OK. |  |`;

  it('reports an ID that has two rows, in one matrix or in two, with where each is', () => {
    const one = [
      '| ID | Area | Requirement |',
      '|---|---|---|',
      row('APP-BIO-011', 'A.'),
      row('APP-BIO-012', 'B.'),
      row('APP-BIO-011', 'C.')
    ].join('\n');
    const other = [row('KIT-DOC-001', 'D.'), row('APP-BIO-012', 'E.')].join('\n');
    expect(
      duplicateRequirementIds([
        { file: 'demo-app.md', markdown: one },
        { file: 'kit.md', markdown: other }
      ])
    ).toEqual([
      'APP-BIO-011 has 2 rows: demo-app.md:3, demo-app.md:5.',
      'APP-BIO-012 has 2 rows: demo-app.md:4, kit.md:2.'
    ]);
    expect(duplicateRequirementIds([{ file: 'kit.md', markdown: other }])).toEqual([]);
  });

  it('passes an ID known to have two rows while it does, and says so once it no longer does', () => {
    const twice = [row('HEP-DISPLAY-006', 'A.'), row('HEP-DISPLAY-006', 'B.')].join('\n');
    const known = { 'HEP-DISPLAY-006': 'safety.viz#195' };
    expect(duplicateRequirementIds([{ file: 'hep.md', markdown: twice }], { known })).toEqual([]);
    expect(
      duplicateRequirementIds([{ file: 'hep.md', markdown: row('HEP-DISPLAY-006', 'A.') }], {
        known
      })
    ).toEqual([
      'HEP-DISPLAY-006 no longer has two rows (safety.viz#195): take it off the known duplicates.'
    ]);
  });

  it('finds none in the repository’s matrices but the ones known before the check (safety.viz#195)', () => {
    const dir = new URL('../../../requirements/', import.meta.url);
    const matrices = readdirSync(dir)
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .map((file) => ({ file, markdown: readFileSync(new URL(file, dir), 'utf8') }));
    expect(matrices.length).toBeGreaterThan(10);
    expect(duplicateRequirementIds(matrices, { known: KNOWN_DUPLICATE_IDS })).toEqual([]);
    expect(Object.keys(KNOWN_DUPLICATE_IDS)).toEqual([
      'HEP-DISPLAY-006',
      'TTE-FILT-001',
      'TTE-FILT-002',
      'TTE-FILT-003'
    ]);
  });
});
