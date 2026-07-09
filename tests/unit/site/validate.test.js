import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateSiteLinks, validateEvidenceScreenshots } from '../../../scripts/site-lib.mjs';

// Built-in validation (#7): the site build must fail on broken internal
// links and on screenshots referenced in evidence.json but missing on disk.

function makeSite(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-validate-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

describe('site validation: internal links', () => {
  it('flags internal links and asset references that do not resolve (#7)', () => {
    const dir = makeSite({
      'index.html': '<a href="histogram/index.html">demo</a> <img src="missing.png">',
      'histogram/index.html': '<link rel="stylesheet" href="../site.css">'
    });
    const errors = validateSiteLinks(dir);
    expect(errors).toHaveLength(2);
    expect(errors.join('\n')).toContain('missing.png');
    expect(errors.join('\n')).toContain('site.css');
  });

  it('passes a site whose internal links all resolve, ignoring external and fragment links (#7)', () => {
    const dir = makeSite({
      'index.html':
        '<link rel="stylesheet" href="site.css">' +
        '<a href="histogram/index.html#controls">demo</a>' +
        '<a href="https://github.com/jwildfire/safety.viz">repo</a>' +
        '<a href="#top">top</a>',
      'site.css': 'body {}',
      'histogram/index.html': '<a href="../index.html">home</a>'
    });
    expect(validateSiteLinks(dir)).toEqual([]);
  });
});

describe('site validation: evidence screenshots', () => {
  it('flags screenshots referenced in evidence.json but missing from the evidence set (#7)', () => {
    const dir = makeSite({ 'SH-CTRL-004-normal-range-overlay.png': 'png' });
    const evidence = {
      module: 'histogram',
      records: [
        {
          test: 'a (#2)',
          suite: 'browser',
          status: 'pass',
          requirementIds: [],
          issueRefs: [2],
          screenshots: [
            'SH-CTRL-004-normal-range-overlay.png',
            'SH-CHART-004-grouped-multiples.png'
          ]
        }
      ]
    };
    const errors = validateEvidenceScreenshots(evidence, dir);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('SH-CHART-004-grouped-multiples.png');
  });
});
