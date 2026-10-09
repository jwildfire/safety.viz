import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mdInline } from '../../../scripts/site-lib.mjs';

// The harvest script turns wiki text, which is not ours, into matrix rows, and the
// site build turns a row's `[label](destination)` into a live link. So the rule is
// held end to end (#238, #258): whatever the harvest keeps, the site build must not
// publish as a link or an image whose destination has a scheme other than http(s).

const script = fileURLToPath(
  new URL('../../../scripts/harvest-wiki-requirements.py', import.meta.url)
);

// The script's name has hyphens, so Python loads it by path. Loading it runs no
// harvest: its `main()` is behind the usual guard.
const LOADER = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("harvest", sys.argv[1])
harvest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harvest)
print(json.dumps([harvest.safe_links(text) for text in json.load(sys.stdin)]))
`;

function harvested(texts) {
  const ran = spawnSync('python3', ['-c', LOADER, script], {
    input: JSON.stringify(texts),
    encoding: 'utf8'
  });
  if (ran.status !== 0) throw new Error(`python3 did not run the harvest script: ${ran.stderr}`);
  return JSON.parse(ran.stdout);
}

// Every destination the site build would publish, read as a browser reads it:
// through the spaces and control characters before and inside a scheme.
function published(text) {
  return [...mdInline(text).matchAll(/(?:href|src)="([^"]*)"/g)].map((match) =>
    match[1].replace(/[\s\u0000-\u001f]+/g, '')
  );
}
const unsafe = (destination) =>
  /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination) && !/^https?:\/\//i.test(destination);

const HOSTILE = [
  '[x](javascript:alert(1))',
  '[x](JaVaScRiPt:alert(1))',
  '[x](data:text/html,hi)',
  '[x](vbscript:msgbox(1))',
  '[x](<javascript:alert(1)>)',
  '[x](< javascript:alert(1) >)',
  '[x](<java\tscript:alert(1)>)',
  '[x](<javascript:alert(1)>>)',
  '[x](<<javascript:alert(1)>)',
  '[x](<javascript:alert(1)> y [z](https://example.org>)',
  '[x](<data:text/html,hi>)',
  '![x](javascript:alert(1))',
  '![x](<javascript:alert(1)>)',
  'before [x](<javascript:alert(1)>) and [y](javascript:alert(2)) after'
];

const HONEST = [
  '[guide](https://example.org/a_(b))',
  '[guide](<https://example.org/a (b)>)',
  '[guide](HTTP://example.org/)',
  '[matrix](requirements/histogram.md)',
  '[matrix](<docs/a b.md>)',
  '[top](#filters)'
];

describe('the harvest script keeps only safe link destinations (#238, #258)', () => {
  it('the site build can publish each hostile link as written, so the harvest is what stops it', () => {
    const live = HOSTILE.filter((text) => published(text).some(unsafe));
    // Most of these reach the page live with no harvest in front of them. If this
    // falls to none, the cases have stopped testing anything.
    expect(live.length).toBeGreaterThan(8);
  });

  it('no hostile link survives the harvest as a destination the site build publishes', () => {
    const kept = harvested(HOSTILE);
    const reached = kept.filter((text) => published(text).some(unsafe));
    expect(reached).toEqual([]);
  });

  it('a destination in angle brackets is reduced to its label, as a bare one is', () => {
    expect(harvested(['see [the note](<javascript:alert(1)>) here'])).toEqual([
      'see the note here'
    ]);
    expect(harvested(['see [the note](javascript:alert(1)) here'])).toEqual(['see the note here']);
  });

  it('an http(s) or relative link is kept as written', () => {
    expect(harvested(HONEST)).toEqual(HONEST);
  });
});
