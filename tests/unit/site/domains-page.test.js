import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishManifest, renderDomainsPage, renderShell } from '../../../scripts/site-lib.mjs';

// Domains page (#139, obot.roadmap#325): the site states the standard domain
// set and what every chart reads from it, generated from the portfolio
// manifest (src/data/portfolio.json) and nothing else — so the page cannot say
// something the manifest, and through its cross-check test the charts' own
// schemas, do not. The manifest itself is served beside it at the site root.

const read = (relative) => readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');

const manifest = JSON.parse(read('src/data/portfolio.json'));
const config = JSON.parse(read('site/config.json'));
const fixtureConfig = JSON.parse(read('tests/unit/site/fixtures/config.json'));

const domains = Object.entries(manifest.domains);
const modules = Object.entries(manifest.modules);
const onStandardSet = modules.filter(([, entry]) => !entry.externalDomains);
const asList = (value) => [].concat(value);

// The page's own escaping, for comparing manifest text with emitted HTML.
const escaped = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// One <section id="..."> of the page; sections are never nested.
const sectionOf = (html, id) => {
  const match = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`));
  return match ? match[0] : '';
};

// The table row whose first cell names the given setting or column.
const rowOf = (html, name) =>
  html.split('<tr>').find((row) => row.startsWith(`<td><code>${name}</code></td>`)) || '';

describe('site generator: domains page (#139)', () => {
  const html = renderDomainsPage({ manifest, config });

  it('PF-SITE-001: the page lists every module in the manifest (#139)', () => {
    expect(modules).toHaveLength(14);
    for (const [module, entry] of modules) {
      const section = sectionOf(html, `chart-${module}`);
      expect(section, `${module} has no section`).not.toBe('');
      expect(section).toContain(`>${escaped(entry.title)}</h3>`);
    }
    expect(html.match(/<section[^>]*id="chart-/g)).toHaveLength(modules.length);
  });

  it('PF-SITE-002: each of the four domains has a section with its label, what one row is and its demo extract (#139)', () => {
    expect(domains.map(([id]) => id)).toEqual(['subject', 'ae', 'bds', 'eg']);
    for (const [id, domain] of domains) {
      const section = sectionOf(html, `domain-${id}`);
      expect(section, `${id} has no section`).not.toBe('');
      expect(section).toContain(escaped(domain.label));
      expect(section).toContain(escaped(domain.grain));
      expect(section).toContain(`${config.repoUrl}/blob/HEAD/site/data/${domain.demo}`);
    }
    expect(html.match(/<section[^>]*id="domain-/g)).toHaveLength(domains.length);
  });

  it('PF-SITE-003: every domain column appears with its label and description (#139)', () => {
    for (const [id, domain] of domains) {
      const section = sectionOf(html, `domain-${id}`);
      const columns = Object.entries(domain.columns);
      for (const [name, column] of columns) {
        const row = rowOf(section, name);
        expect(row, `${id}.${name} has no row`).not.toBe('');
        expect(row).toContain(`<td>${escaped(column.label)}</td>`);
        expect(row).toContain(`<td>${escaped(column.description)}</td>`);
      }
      expect(section.match(/<tr><td>/g)).toHaveLength(columns.length);
    }
  });

  it('PF-SITE-004: each domain names the charts it feeds, and apart from them the charts that read it only when supplied (#139)', () => {
    for (const [id] of domains) {
      const section = sectionOf(html, `domain-${id}`);
      const feeds = modules.filter(([, entry]) => entry.domains.includes(id));
      const optional = modules.filter(([, entry]) => (entry.optionalDomains || []).includes(id));
      for (const [module, entry] of [...feeds, ...optional]) {
        expect(section).toContain(`<a href="#chart-${module}">${escaped(entry.title)}</a>`);
      }
      expect(section.match(/href="#chart-/g)).toHaveLength(feeds.length + optional.length);
      expect(section.includes('when it is supplied')).toBe(optional.length > 0);
    }
    // The participant profile reads adverse events only when they are supplied.
    const adverseEvents = sectionOf(html, 'domain-ae');
    expect(adverseEvents.indexOf('when it is supplied')).toBeLessThan(
      adverseEvents.indexOf('href="#chart-participant-profile"')
    );
  });

  it('PF-SITE-005: each chart lists every column setting with its default column, what that column holds and the domain it is read from (#139)', () => {
    for (const [module, entry] of onStandardSet) {
      const section = sectionOf(html, `chart-${module}`);
      const settings = Object.entries(entry.settings);
      for (const [key, setting] of settings) {
        const row = rowOf(section, key);
        expect(row, `${module}.${key} has no row`).not.toBe('');
        for (const domain of asList(setting.domain)) {
          expect(row).toContain(
            `<a href="#domain-${domain}">${escaped(manifest.domains[domain].label)}</a>`
          );
        }
        if (setting.column === null) {
          expect(row).toContain('No default');
          expect(row).not.toContain('<code>null</code>');
        } else {
          const [first] = asList(setting.domain);
          expect(row).toContain(`<td><code>${setting.column}</code></td>`);
          expect(row).toContain(
            `<td>${escaped(manifest.domains[first].columns[setting.column].label)}</td>`
          );
        }
      }
      expect(section.match(/<tr><td>/g)).toHaveLength(settings.length);
    }
    // The shapes a plain key → column table would get wrong: a nested setting
    // written with a dot, a setting read from two tables, and no default column.
    expect(rowOf(sectionOf(html, 'chart-ae-timelines'), 'color.value_col')).toContain(
      '<code>AESEV</code>'
    );
    const bothTables = rowOf(sectionOf(html, 'chart-time-to-event'), 'id_col');
    expect(bothTables).toContain('href="#domain-ae"');
    expect(bothTables).toContain('href="#domain-subject"');
    expect(rowOf(sectionOf(html, 'chart-hep-explorer'), 'baseline_col')).toContain('No default');
  });

  it('PF-SITE-006: required settings are marked and optional ones are not (#139)', () => {
    let required = 0;
    for (const [module, entry] of onStandardSet) {
      const section = sectionOf(html, `chart-${module}`);
      for (const [key, setting] of Object.entries(entry.settings)) {
        const row = rowOf(section, key);
        expect(row.includes('<span class="badge">required</span>'), `${module}.${key}`).toBe(
          setting.required
        );
        expect(row.includes('>optional<'), `${module}.${key}`).toBe(!setting.required);
        if (setting.required) required += 1;
      }
    }
    expect(required).toBeGreaterThan(0);
    expect(html.match(/<span class="badge">required<\/span>/g)).toHaveLength(required);
  });

  it('PF-SITE-007: every chart links to its own demo and API reference pages (#139)', () => {
    for (const [module] of modules) {
      const section = sectionOf(html, `chart-${module}`);
      expect(section).toContain(`href="../${module}/index.html"`);
      expect(section).toContain(`href="../${module}/api.html"`);
    }
  });

  it('PF-SITE-008: the Patient Journey Explorer is shown as outside the standard set, with its own six domains (#139)', () => {
    const journey = manifest.modules['patient-journey-explorer'];
    const section = sectionOf(html, 'chart-patient-journey-explorer');
    expect(journey.externalDomains).toHaveLength(6);
    for (const domain of journey.externalDomains) {
      expect(section).toContain(`<code>${domain}</code>`);
    }
    expect(section).toContain(escaped(journey.note));
    // No settings table, and no claim on a standard domain: its `ae` is its own.
    expect(section).not.toContain('<table');
    expect(section).not.toContain('href="#domain-');
    expect(section).toContain('href="../patient-journey-explorer/api.html#data-contract"');
    // It sits under its own heading, after the charts that read the standard set.
    const outside = html.indexOf('<h2 id="outside">Outside the standard set</h2>');
    expect(outside).toBeGreaterThan(-1);
    expect(html.indexOf('id="chart-patient-journey-explorer"')).toBeGreaterThan(outside);
    for (const [module] of onStandardSet) {
      expect(html.indexOf(`id="chart-${module}"`)).toBeLessThan(outside);
    }
    for (const [id] of domains) {
      expect(sectionOf(html, `domain-${id}`)).not.toContain('patient-journey-explorer');
    }
  });

  it('PF-SITE-009: the lead says how many charts read the standard set and links the served manifest (#139)', () => {
    expect(html).toContain('<h1>Standard domain set</h1>');
    expect(html).toContain(`${onStandardSet.length} of the ${modules.length} charts`);
    expect(html).toContain('href="../portfolio.json"');
    expect(html).toContain(`${config.repoUrl}/blob/HEAD/src/data/schema/portfolio.json`);
  });

  it("PF-SITE-010: a module's note is shown with the chart it belongs to (#139)", () => {
    const noted = modules.filter(([, entry]) => entry.note);
    expect(noted.map(([module]) => module)).toEqual([
      'hep-waterfall',
      'participant-profile',
      'time-to-event',
      'patient-journey-explorer'
    ]);
    for (const [module, entry] of noted) {
      expect(sectionOf(html, `chart-${module}`)).toContain(escaped(entry.note));
    }
  });

  it('PF-SITE-011: renderers the manifest does not list never appear (#139)', () => {
    const planned = config.renderers.filter((renderer) => !manifest.modules[renderer.module]);
    expect(planned.map((renderer) => renderer.module)).toEqual([
      'paneled-outlier-explorer',
      'web-codebook'
    ]);
    for (const renderer of planned) {
      expect(html).not.toContain(renderer.module);
      expect(html).not.toContain(renderer.title);
    }
  });

  it('PF-SITE-012: a chart with no pages on the site is listed without links to them (#139)', () => {
    // The fixture registry has only the histogram available.
    const fixtureHtml = renderDomainsPage({ manifest, config: fixtureConfig });
    expect(sectionOf(fixtureHtml, 'chart-histogram')).toContain('href="../histogram/api.html"');
    for (const [module, entry] of modules.filter(([name]) => name !== 'histogram')) {
      const section = sectionOf(fixtureHtml, `chart-${module}`);
      expect(section).toContain(`>${escaped(entry.title)}</h3>`);
      expect(section).not.toContain(`href="../${module}/`);
    }
  });

  it('PF-SITE-013: every in-page link lands on a heading or section the page has (#139)', () => {
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(ids, `#${target} has no target`).toContain(target);
  });

  it('PF-SITE-014: links take the mount-depth root prefix (#139)', () => {
    const atRoot = renderDomainsPage({ manifest, config, root: '' });
    expect(atRoot).toContain('href="portfolio.json"');
    expect(atRoot).toContain('href="histogram/api.html"');
    expect(atRoot).not.toContain('href="../');
  });

  it('PF-SITE-015: manifest text is escaped, and nothing is set in bold (#139)', () => {
    const hostile = JSON.parse(JSON.stringify(manifest));
    hostile.domains.subject.label = 'Subjects <script>alert(1)</script>';
    hostile.domains.subject.columns.USUBJID.description = 'A & B "quoted"';
    hostile.modules.histogram.title = '<b>Histogram</b>';
    const hostileHtml = renderDomainsPage({ manifest: hostile, config });
    expect(hostileHtml).not.toContain('<script>');
    expect(hostileHtml).toContain('Subjects &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(hostileHtml).toContain('A &amp; B &quot;quoted&quot;');
    expect(hostileHtml).toContain('&lt;b&gt;Histogram&lt;/b&gt;');
    expect(html).not.toMatch(/<(strong|b)\b/);
  });

  it('PF-SITE-016: wide tables sit in the scrolling container so the page never scrolls sideways (#139)', () => {
    const tables = html.match(/<table\b/g);
    expect(tables).toHaveLength(domains.length + onStandardSet.length);
    expect(html.match(/<div class="table-scroll"><table\b/g)).toHaveLength(tables.length);
    expect(html).toContain('<div class="domains-page">');
  });
});

describe('site generator: serving the manifest (#139)', () => {
  it('PF-SITE-017: the manifest is copied to the site root byte for byte (#139)', () => {
    const source = fileURLToPath(new URL('../../../src/data/portfolio.json', import.meta.url));
    const siteDir = mkdtempSync(path.join(tmpdir(), 'site-manifest-'));
    const served = publishManifest(source, siteDir);
    expect(served).toBe(path.join(siteDir, 'portfolio.json'));
    expect(readFileSync(served).equals(readFileSync(source))).toBe(true);
  });
});

describe('site shell: Domains nav entry (#139)', () => {
  it('PF-SITE-018: the shell carries a Domains nav entry at every mount depth (#139)', () => {
    const shell = read('site/shell.html');
    for (const root of ['', '../']) {
      const page = renderShell({ shell, title: 'T', content: 'C', root, renderers: [] });
      expect(page).toContain(`<a href="${root}domains/index.html">Domains</a>`);
    }
  });
});
