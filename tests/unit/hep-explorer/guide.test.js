import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The Clinical guide is prose, so its requirements are pinned the only way
// prose can be: by asserting the statements the requirement names are actually
// in the shipped file. The idiom follows tests/unit/hep-explorer/selection.test.js,
// which pins source-file invariants the same way.
//
// HEP-DOC-001 (SafetyGraphics/hep-explorer#335): the guide explains the R-Ratio
// and its nR variant in three places but cited them by author-year only, so a
// reader who wanted the definition had nowhere to click. The primary sources
// are now linked — in the R-Ratio passage where the question arises, and again
// in Source and attribution where a reader looks for provenance.
const GUIDE = readFileSync(
  new URL('../../../docs/guides/hep-explorer.md', import.meta.url),
  'utf8'
);

// The two references upstream #335 names: Robles-Diaz et al., Gastroenterology
// 2014 (the composite algorithm that introduced nR) and Suh 2020, whose review
// carries the worked nR definition.
const ROBLES_DIAZ_URL = 'https://www.gastrojournal.org/article/S0016-5085(14)01484-X/fulltext';
const SUH_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6986960/';

describe('HEP-DOC-001: the guide links its R / nR sources (#54, #335)', () => {
  it('links the R-Ratio primary sources from the Source and attribution section', () => {
    const source = GUIDE.split('## Source and attribution')[1] || '';
    expect(source).toContain(ROBLES_DIAZ_URL);
    expect(source).toContain(SUH_URL);
  });

  it('names the R and nR definitions the links resolve', () => {
    const source = GUIDE.split('## Source and attribution')[1] || '';
    expect(source).toMatch(/R-Ratio/);
    expect(source).toMatch(/\bnR\b/);
  });

  it('links the definition from the R-Ratio passage itself, where the question arises', () => {
    const step2a = GUIDE.split('### Step 2a')[1] || '';
    const passage = step2a.split('###')[0];
    expect(passage).toContain(ROBLES_DIAZ_URL);
  });

  it('gives the reference-list entries for both sources a resolvable link', () => {
    const references = GUIDE.split('## References')[1] || '';
    expect(references).toMatch(new RegExp(`Robles-Diaz[^\\n]*${escapeRegExp(ROBLES_DIAZ_URL)}`));
    expect(references).toMatch(new RegExp(`Suh[^\\n]*${escapeRegExp(SUH_URL)}`));
  });

  it('keeps the reference list alphabetical where the new entry lands', () => {
    const references = GUIDE.split('## References')[1] || '';
    const authors = references
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).split(/[.,]/)[0].toLowerCase());
    const sorted = [...authors].sort((a, b) => a.localeCompare(b));
    expect(authors).toEqual(sorted);
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
