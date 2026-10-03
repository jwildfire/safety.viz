import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kit } from '../../../src/kit.js';
import * as shell from '../../../src/shell.js';
import { extractDoclets } from '../../../scripts/api/extract.mjs';
import {
  CHART_SOURCE,
  KIT_FILE,
  KIT_SOURCE_FILES,
  buildKitModel,
  loadKit,
  signatureOf
} from '../../../scripts/api/kit.mjs';
import {
  renderApiPage,
  renderArchitecturePage,
  renderKitPage
} from '../../../scripts/site-lib.mjs';

// The kit's API reference (#154): generated from the Kit typedef in src/kit.js
// and from the kit itself, held to the same rule as the renderer pages — an
// undocumented member fails `npm run docs:api`. These tests run the real
// `jsdoc -X` extraction, so a member added to the kit without a line in the
// typedef fails here before it fails the build.

const read = (relative) => readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
const config = JSON.parse(read('site/config.json'));
const { version } = JSON.parse(read('package.json'));

const doclets = extractDoclets([KIT_FILE]);
const loaded = await loadKit();
const model = buildKitModel({ doclets, ...loaded });
const members = model.groups.flatMap((group) => group.members);

// The page's own escaping, for comparing model text with emitted HTML.
const escaped = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

describe('kit API data', () => {
  it('KIT-DOC-001: every kit member is documented once, with a description, its signature and the module it comes from (#154)', () => {
    expect(model.missing).toEqual([]);
    expect(members.map((member) => member.name)).toEqual(Object.keys(kit));
    expect(model.count).toBe(Object.keys(kit).length);
    for (const member of members) {
      expect(member.description, `${member.name} has no description`).toBeTruthy();
      expect(member.signature, `${member.name} has no signature`).toContain(member.name);
    }
    // Grouped by source, Chart.js first, then the eight modules in kit order.
    expect(model.groups.map((group) => group.source)).toEqual([CHART_SOURCE, ...KIT_SOURCE_FILES]);
    expect(model.since).toBe('1.9.0');
    expect(model.description).toBeTruthy();
  });

  it('KIT-DOC-002: a signature is read from the member itself: a function’s parameters, the Chart constructor, a constant’s value (#154)', () => {
    const byName = Object.fromEntries(members.map((member) => [member.name, member]));
    expect(byName.renderShell).toMatchObject({
      kind: 'function',
      signature: "renderShell(element, { moduleClass = '', onToggle } = {})"
    });
    expect(byName.mountProfileRail.signature).toBe(
      'mountProfileRail(host, settingsFn, { target = null } = {})'
    );
    expect(byName.applyShellStyles.signature).toBe('applyShellStyles()');
    expect(byName.ALL_VALUE).toMatchObject({
      kind: 'constant',
      signature: 'ALL_VALUE = "__all__"'
    });
    expect(byName.Chart.kind).toBe('class');
    expect(byName.Chart.signature).toMatch(/^new Chart\(\w+, \w+\)$/);
    expect(signatureOf('renderShell', shell.renderShell)).toBe(byName.renderShell.signature);
  });

  it('KIT-DOC-003: the reference says what the bundled Chart.js can draw, read from the committed bundle (#154)', () => {
    const chartPackage = JSON.parse(read('node_modules/chart.js/package.json'));
    expect(model.chart.version).toBe(chartPackage.version);
    // Every chart in the bundle has registered its parts by the time the
    // bundle has loaded; these are the ones the fixture page and the charts
    // rely on.
    expect(model.chart.registered.controllers).toEqual(
      expect.arrayContaining(['bar', 'line', 'scatter'])
    );
    expect(model.chart.registered.elements).toEqual(
      expect.arrayContaining(['bar', 'line', 'point'])
    );
    expect(model.chart.registered.scales).toEqual(
      expect.arrayContaining(['category', 'linear', 'logarithmic'])
    );
    expect(model.chart.registered.plugins).toEqual(
      expect.arrayContaining(['legend', 'title', 'tooltip'])
    );
  });

  it('KIT-DOC-004: a member that is undocumented, has no description, is documented but absent, or is not a source module’s export is reported as missing (#154)', () => {
    const helper = () => {};
    const fakeKit = { documented: helper, undocumented: helper, blank: helper, stray: () => {} };
    const fakeDoclets = [
      {
        kind: 'typedef',
        name: 'Kit',
        description: 'A kit.',
        properties: [
          { name: 'documented', description: 'Does a thing.' },
          { name: 'blank', description: '' },
          { name: 'stray', description: 'Belongs to no module.' },
          { name: 'gone', description: 'No longer on the kit.' }
        ]
      }
    ];
    const fake = buildKitModel({
      doclets: fakeDoclets,
      kit: fakeKit,
      sources: [
        { file: 'src/a.js', exports: { documented: helper, undocumented: helper, blank: helper } }
      ]
    });
    expect(fake.missing).toEqual([
      { kind: 'member', name: 'undocumented', reason: 'not documented in the Kit typedef' },
      { kind: 'member', name: 'blank', reason: 'missing description' },
      {
        kind: 'member',
        name: 'stray',
        reason: 'is not the export of that name from any kit source module'
      },
      { kind: 'member', name: 'gone', reason: 'documented in the Kit typedef but not on the kit' }
    ]);
    // With no typedef at all, every member is missing.
    const bare = buildKitModel({ doclets: [], kit: fakeKit, sources: [] });
    expect(bare.missing.filter((entry) => /not documented/.test(entry.reason))).toHaveLength(4);
  });
});

describe('site generator: kit page', () => {
  const html = renderKitPage(model, { repoUrl: config.repoUrl, version });

  it('KIT-DOC-005: the page lists every member with its signature and description, under the module it comes from (#154)', () => {
    expect(html).toContain('<h1>Kit API reference</h1>');
    for (const group of model.groups) {
      const section = html.match(
        new RegExp(`<section class="kit-group" data-source="${group.source}"[\\s\\S]*?</section>`)
      );
      expect(section, `${group.source} has no section`).not.toBeNull();
      for (const member of group.members) {
        expect(section[0]).toContain(`id="${member.name}"`);
        expect(section[0]).toContain(`<code>${escaped(member.signature)}</code>`);
      }
      expect(section[0].match(/<tr id="/g)).toHaveLength(group.members.length);
      if (group.source !== CHART_SOURCE) {
        expect(section[0]).toContain(`${config.repoUrl}/blob/HEAD/${group.source}`);
      }
    }
    expect(html.match(/<section class="kit-group"/g)).toHaveLength(model.groups.length);
    expect(html.match(/<tr id="/g)).toHaveLength(model.count);
    // Descriptions are rendered, with their inline code.
    expect(html).toContain('Append an option to a select.');
    expect(html).toContain('<code>participantsSelected</code>');
  });

  it('KIT-DOC-006: the page says how a second library reaches the kit from each bundle, and which file to load (#154)', () => {
    expect(html).toContain('SafetyViz.kit');
    expect(html).toContain(`dist/safety.viz-${version}/safety.viz.js`);
    expect(html).toContain(
      escaped(`import { kit } from './dist/safety.viz-${version}/safety.viz.esm.js';`)
    );
    expect(html).toContain(`Chart.js ${model.chart.version}`);
    for (const names of Object.values(model.chart.registered)) {
      for (const name of names) expect(html).toContain(`<code>${name}</code>`);
    }
    // The working example is the fixture page the browser tests drive.
    expect(html).toContain(`${config.repoUrl}/blob/HEAD/tests/e2e/fixtures/kit.html`);
  });

  it('KIT-DOC-007: the page states that the kit is public surface and a change to any member is a breaking change, from the release in the typedef (#154)', () => {
    expect(html).toContain(`from v${model.since}`);
    expect(html).toMatch(/a change to any member[^<]*is a breaking change/);
    // What is deliberately left out is named, so its absence reads as a decision.
    expect(html).toContain('<code>prototypeBanner</code>');
    expect(html).toContain('<code>experimentalBanner</code>');
    expect(html).toContain('<code>hexToRgba</code>');
  });

  it('KIT-DOC-010: the page says the Kaplan–Meier estimator follows the Time-to-Event Explorer’s Experimental status: its estimates, intervals and at-risk counts may change after the external clinical review without counting as a breaking change, its row is styled to say so, and the other members are full public surface (#193)', () => {
    const contract = html.match(/<h2 id="contract">[\s\S]*?<\/ul>/)[0];
    expect(contract).toContain(
      '<code>kmEstimate</code> follows the Time-to-Event Explorer&#39;s Experimental status'
    );
    expect(contract).toContain('https://github.com/jwildfire/obot.roadmap/issues/182');
    // What obot.roadmap#182 withholds confidence in: the curves, the bands and
    // the at-risk arithmetic.
    expect(contract).toMatch(
      /its estimates, intervals and at-risk counts may change after that review without counting as a breaking change/
    );
    // Said once: no "until that review lands … after that review".
    expect(contract).not.toMatch(/until that review lands/);
    expect(contract).toContain(`The other ${model.count - 1} members are public surface in full.`);
    // The member's own row says so too.
    const row = html.match(/<tr id="kmEstimate">[\s\S]*?<\/tr>/)[0];
    expect(row).toContain('class="kit-status"');
    expect(row).toContain('Experimental');
    expect(html.match(/class="kit-status"/g)).toHaveLength(1);
    // And the site's stylesheet gives that note a rule of its own.
    const css = readFileSync(new URL('../../../site/site.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.kit-status\s*\{[^}]+\}/);
  });

  it('KIT-DOC-008: the kit page is reachable from the architecture page and from every chart’s API reference (#154)', () => {
    expect(renderArchitecturePage({ config, version })).toContain('href="kit/index.html"');
    const api = renderApiPage({
      module: 'histogram',
      factory: {
        name: 'histogram',
        signature: 'histogram()',
        description: '',
        params: [],
        returns: null
      },
      methods: [],
      settings: [],
      dataContract: { title: '', description: '', fields: [] }
    });
    expect(api).toContain('href="../kit/index.html"');
  });
});
