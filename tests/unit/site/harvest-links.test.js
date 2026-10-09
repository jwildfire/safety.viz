import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { mdInline } from '../../../scripts/site-lib.mjs';

// The harvest script turns wiki text, which is not ours, into matrix rows, and the
// site build turns a row's `[label](destination)` into a live link. The rule is
// held in both places (#238, #258): the harvest keeps no link-shaped text whose
// destination has a scheme other than http(s), and the site build publishes none,
// whoever wrote the row.

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

// Read as a browser reads a destination: through the spaces and control
// characters an author can put before and inside a scheme.
const squeezed = (text) => text.replace(/[\s\u0000-\u001f]+/g, '');
const otherScheme = (destination) =>
  /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination) && !/^https?:\/\//i.test(destination);

// Link-shaped text left in a harvested row: `](`, then a scheme that is not
// http(s). Judged on the text itself, not by any one renderer's reading of it.
// Looked ahead at, so a link inside another's title is seen too.
const linkShaped = (text) =>
  [...text.matchAll(/\]\((?=([^)]*))/g)].some((match) =>
    otherScheme(squeezed(match[1]).replace(/^<+/, ''))
  );

// Every destination the site build publishes for a text.
const published = (text) =>
  [...mdInline(text).matchAll(/(?:href|src)="([^"]*)"/g)].map((match) => squeezed(match[1]));

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
  'before [x](<javascript:alert(1)>) and [y](javascript:alert(2)) after',
  // A link inside a link: reducing the inner one leaves a new link behind it.
  '[[x](data:a)](javascript:alert(1))',
  '[[x](data:a)](<javascript:alert(1)>)',
  '[[[x](data:a)](data:b)](javascript:alert(1))',
  // A link inside what reads as an honest link's title.
  '[a](https://example.org [b](javascript:alert(1)) )',
  '[a](https://example.org "t [b](javascript:alert(1))")'
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
  it('the hostile links are link-shaped as written, so the check below can fail', () => {
    expect(HOSTILE.filter(linkShaped)).toEqual(HOSTILE);
  });

  it('no hostile link survives the harvest as link-shaped text with another scheme', () => {
    const kept = harvested(HOSTILE);
    expect(kept.filter(linkShaped)).toEqual([]);
  });

  it('a destination in angle brackets is reduced to its label, as a bare one is, and a link inside a link to the innermost label', () => {
    expect(
      harvested([
        'see [the note](<javascript:alert(1)>) here',
        'see [the note](javascript:alert(1)) here',
        'see [[the note](data:a)](javascript:alert(1)) here'
      ])
    ).toEqual(['see the note here', 'see the note here', 'see the note here']);
  });

  it('an http(s) or relative link is kept as written', () => {
    expect(harvested(HONEST)).toEqual(HONEST);
  });
});

describe('the site build publishes only safe link destinations, whoever wrote the row (#258)', () => {
  it('no hostile link is published as written, with no harvest in front of it', () => {
    const reached = HOSTILE.filter((text) => published(text).some(otherScheme));
    expect(reached).toEqual([]);
  });

  it('a link or an image with another scheme is reduced to its label or its alt text', () => {
    expect(mdInline('see [the note](javascript:alert(1)) here')).toBe('see the note here');
    expect(mdInline('see [the note](<javascript:alert(1)>) here')).toBe('see the note here');
    expect(mdInline('a ![chart](data:image/png;base64,AAAA) b')).toBe('a chart b');
  });

  it('an http(s) or relative destination is published as it was', () => {
    expect(HONEST.map(published)).toEqual([
      ['https://example.org/a_(b)'],
      ['https://example.org/a(b)'],
      ['HTTP://example.org/'],
      ['requirements/histogram.md'],
      ['docs/ab.md'],
      ['#filters']
    ]);
    expect(mdInline('![x](<guide/fig(1).png>)')).toBe('<img src="guide/fig(1).png" alt="x">');
  });
});

// What a browser makes of the site build's HTML: every element, with the names
// of its attributes. The renderer writes four tags and three attributes, and an
// author's text must not add to them.
const ALLOWED = { A: ['href'], IMG: ['alt', 'src'], CODE: [], STRONG: [] };
function strays(html) {
  const found = [];
  for (const element of JSDOM.fragment(html).querySelectorAll('*')) {
    const allowed = ALLOWED[element.tagName];
    const names = [...element.attributes].map((attribute) => attribute.name);
    if (!allowed) found.push(element.tagName);
    else found.push(...names.filter((name) => !allowed.includes(name)));
    for (const name of ['href', 'src']) {
      const value = element.getAttribute(name);
      if (value !== null && otherScheme(squeezed(value))) found.push(`${name}=${value}`);
    }
  }
  return found;
}

// A repeatable run of numbers, so a failure can be found again.
function numbers(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('the site build writes no tag or attribute of an author’s choosing (#258)', () => {
  // An image whose destination holds a link, and a link that begins inside an
  // image's alt text: each once closed an attribute early and left `onerror` on the tag.
  const INSIDE = [
    '![a](<[x](<y onerror=alert(document.domain) >)>)',
    '![a[b](s.png)](onerror=alert(1)//)',
    '[x](![a](b.png" onerror="alert(1))',
    '[x](![a](b.png))',
    '`[x](y" onmouseover="alert(1))`',
    '**[x](y)** ![a](**b**.png "onerror=alert(1)")'
  ];

  it('a link inside an image, or an image inside a link’s destination, adds no attribute', () => {
    expect(INSIDE.map((text) => [text, strays(mdInline(text))])).toEqual(
      INSIDE.map((text) => [text, []])
    );
  });

  it('five thousand texts put together from the pieces of links, images and attributes add no tag, no attribute and no other scheme', () => {
    const PIECES = [
      ...['[', ']', '(', ')', '<', '>', '!', '`', '**', '"', "'", ' ', '\t', '\\', '\u0000', '0'],
      ...['x', 'onerror=alert(1)', 'javascript:', 'data:', 'https://e.org/', 's.png', '&#106;'],
      ...['![a](', '[x](', '](<', '>)', '](', ')']
    ];
    const next = numbers(258);
    const broke = [];
    for (let run = 0; run < 5000; run += 1) {
      const length = 2 + Math.floor(next() * 14);
      let text = '';
      for (let piece = 0; piece < length; piece += 1) {
        text += PIECES[Math.floor(next() * PIECES.length)];
      }
      const found = strays(mdInline(text));
      if (found.length) broke.push([text, found]);
    }
    expect(broke.slice(0, 5)).toEqual([]);
  });

  it('what the renderer wrote before is written still: a linked image, bold inside a link, code, and a destination with parentheses', () => {
    expect(
      mdInline(
        '[![alt](img.png)](https://e.org) and [**b**](u) and `c` **d** ![i](guide/fig(1).png)'
      )
    ).toBe(
      '<a href="https://e.org"><img src="img.png" alt="alt"></a> and <a href="u"><strong>b</strong></a>' +
        ' and <code>c</code> <strong>d</strong> <img src="guide/fig(1).png" alt="i">'
    );
  });
});
