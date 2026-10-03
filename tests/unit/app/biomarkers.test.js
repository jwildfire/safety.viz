import { describe, it, expect, vi } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import manifest from '../../../src/data/portfolio.json';
import schema from '../../../src/data/schema/portfolio.json';
import { mergeLibraries, chartGroups } from '../../../src/app/libraries.js';
import {
  BIO_VIZ,
  RECORD_FILE,
  readRecord,
  sha256,
  compareWithDev,
  verifyOnDev,
  verifyVendored
} from '../../../scripts/vendor-lib.mjs';
import {
  APP_LIBRARIES,
  FILE_PITCH,
  librariesExpression,
  libraryManifest,
  libraryScript
} from '../../../scripts/app-libraries.mjs';
import { renderAppHtml } from '../../../scripts/build-app.mjs';

// The biomarker charts in the demo app (#182, obot.roadmap#366): bio.viz's
// script-tag bundle, copied from bio.viz's `dev` branch by
// scripts/vendor-bio-viz.mjs with its commit and checksum recorded, and handed
// to the app through the second-library seam by the demo page and the single
// file. These tests hold the copy to its record, the chart list in it to the
// manifest's format and to the app, and the single file to what it inlines.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const vendorDir = path.join(root, BIO_VIZ.directory);
const [bioViz] = APP_LIBRARIES;
const bioManifest = libraryManifest(bioViz);

describe('the vendored bio.viz bundle', () => {
  it('APP-BIO-001: the copy matches its record, which names bio.viz, the full commit, its dev branch and the file’s checksum and size (#182)', () => {
    expect(verifyVendored(vendorDir)).toEqual([]);
    const record = readRecord(vendorDir);
    expect(record).toMatchObject({
      bundle: 'bio.viz script-tag bundle',
      repository: 'https://github.com/jwildfire/bio.viz',
      ref: 'dev',
      merged_to_dev: true
    });
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    const [file] = record.files;
    expect(file).toMatchObject({
      file: 'bio.viz.js',
      source: `dist/bio.viz-${record.version}/bio.viz.js`
    });
    const bytes = readFileSync(path.join(vendorDir, 'bio.viz.js'));
    expect(file.sha256).toBe(sha256(bytes));
    expect(file.bytes).toBe(bytes.length);
  });

  it('APP-BIO-002: the check fails when a byte of the copy changes, a file is there unrecorded, or the record is missing (#182)', () => {
    const copy = () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'vendor-bio-viz-'));
      cpSync(vendorDir, dir, { recursive: true });
      return dir;
    };
    const changed = copy();
    const file = path.join(changed, 'bio.viz.js');
    writeFileSync(file, `${readFileSync(file, 'utf8')} `);
    expect(verifyVendored(changed).join(' ')).toMatch(/no longer matches its recorded checksum/);
    const extra = copy();
    writeFileSync(path.join(extra, 'other.js'), '');
    expect(verifyVendored(extra)).toEqual([`other.js: present, but not in ${RECORD_FILE}.`]);
    const bare = mkdtempSync(path.join(tmpdir(), 'vendor-bio-viz-'));
    expect(verifyVendored(bare)).toEqual([
      `${RECORD_FILE} is missing: the files have no source record.`
    ]);
  });

  it('APP-BIO-013: the source check asks whether a commit recorded as on dev is on dev, and fails when it is not or when the record does not say; a commit recorded as off dev is not asked (#193)', async () => {
    const record = { ...readRecord(vendorDir) };
    expect(record.merged_to_dev).toBe(true);
    // GitHub's compare of the commit with dev: dev is ahead of it, or is it.
    const asked = vi.fn(async () => 'ahead');
    expect(await verifyOnDev(record, asked)).toEqual([]);
    expect(asked).toHaveBeenCalledWith(record.commit);
    expect(await verifyOnDev(record, async () => 'identical')).toEqual([]);
    for (const status of ['behind', 'diverged']) {
      expect(await verifyOnDev(record, async () => status), status).toEqual([
        `${RECORD_FILE} says ${record.commit.slice(0, 7)} is on ${record.repository}’s dev branch, but it is not (dev is ${status}).`
      ]);
    }
    // A commit copied from elsewhere says so, and why; it is not asked about.
    const elsewhere = vi.fn();
    expect(
      await verifyOnDev(
        { ...record, merged_to_dev: false, note: 'a fix not yet merged' },
        elsewhere
      )
    ).toEqual([]);
    expect(elsewhere).not.toHaveBeenCalled();
    const silent = { ...record };
    delete silent.merged_to_dev;
    expect(await verifyOnDev(silent, asked)).toEqual([
      `${RECORD_FILE} does not say whether ${silent.commit.slice(0, 7)} is on dev.`
    ]);
  });

  it('APP-BIO-014: the on-dev check asks GitHub with the token when there is one and without it when GitHub refuses the token, and fails saying why when it cannot ask: the rate limit, the network, or an answer with no status (#193)', async () => {
    const commit = 'a'.repeat(40);
    const url = `https://api.github.com/repos/jwildfire/bio.viz/compare/${commit}...dev`;
    const answer = (status, body, headers = {}) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => body
    });
    const ask = (fetch, token) =>
      compareWithDev({ slug: 'jwildfire/bio.viz', commit, fetch, token });
    // With a token, and an answer.
    const seen = [];
    const fetch = vi.fn(async (given, { headers }) => {
      seen.push(headers.authorization || null);
      return answer(200, { status: 'ahead' });
    });
    expect(await ask(fetch, 'secret')).toBe('ahead');
    expect(fetch).toHaveBeenCalledWith(url, expect.anything());
    expect(seen).toEqual(['Bearer secret']);
    // A token GitHub refuses: asked again without it.
    const tries = [];
    const refused = async (given, { headers }) => {
      tries.push(Boolean(headers.authorization));
      return headers.authorization ? answer(401, {}) : answer(200, { status: 'identical' });
    };
    expect(await ask(refused, 'stale')).toBe('identical');
    expect(tries).toEqual([true, false]);
    // The rate limit, named.
    await expect(
      ask(async () =>
        answer(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791000000' })
      )
    ).rejects.toThrow(
      `${url} answered 403: GitHub's API rate limit is used up until ${new Date(1791000000 * 1000).toISOString()}, so whether the commit is on dev is unknown. Set GITHUB_TOKEN to ask with a token.`
    );
    // The network, with the address.
    await expect(
      ask(async () => {
        throw new TypeError('fetch failed');
      })
    ).rejects.toThrow(
      `${url} could not be reached (fetch failed), so whether the commit is on dev is unknown.`
    );
    // An answer that says nothing.
    await expect(ask(async () => answer(200, { message: 'odd' }))).rejects.toThrow(
      `${url} answered with no comparison status, so whether the commit is on dev is unknown.`
    );
    // Any other refusal.
    await expect(ask(async () => answer(404, {}))).rejects.toThrow(
      `${url} answered 404, so whether the commit is on dev is unknown.`
    );
  });

  it('APP-BIO-003: its chart list is format version 2 and valid, lists four charts under one Biomarkers group, and merges into the app with every factory present (#182)', () => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    expect(validate(bioManifest), JSON.stringify(validate.errors)).toBe(true);
    expect(bioManifest.version).toBe(2);
    expect(bioManifest.groups).toEqual({ biomarkers: { label: 'Biomarkers', order: 0 } });
    const entries = Object.values(bioManifest.modules);
    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        library: 'bio.viz',
        group: 'biomarkers',
        unmappedSettings: 'omit',
        tables: {
          results: { domain: 'bds', required: true },
          participants: { domain: 'subject', required: false }
        }
      });
    }
    const exports = new Function(`${libraryScript(bioViz)}\nreturn BioViz;`)();
    const ownCharts = Object.fromEntries(
      Object.values(manifest.modules).map((entry) => [entry.export, () => ({})])
    );
    const {
      manifest: all,
      problems,
      factoryOf
    } = mergeLibraries(manifest, ownCharts, [
      { name: bioViz.name, charts: exports, manifest: exports.portfolio }
    ]);
    expect(problems).toEqual({});
    for (const module of Object.keys(bioManifest.modules)) {
      expect(typeof factoryOf(module)).toBe('function');
    }
    expect(chartGroups(all).map(([group, members]) => [group, members.length])).toEqual([
      ['bds', 9],
      ['eg', 1],
      ['ae', 3],
      ['biomarkers', 4]
    ]);
  });
});

describe('the single file with the biomarker charts', () => {
  it('APP-BIO-009: each library’s bundle is inlined after the app’s, and the app is mounted with it; nothing points at another URL (#182)', () => {
    const html = renderAppHtml({
      script: 'window.SafetyVizApp={mount(){}};',
      libraries: [
        { ...bioViz, script: 'var BioViz={portfolio:{}};\n//# sourceMappingURL=bio.viz.js.map' }
      ]
    });
    const app = html.indexOf('<script>window.SafetyVizApp');
    const library = html.indexOf('<script>var BioViz');
    expect(app).toBeGreaterThan(-1);
    expect(library).toBeGreaterThan(app);
    expect(html).toContain(
      // The single file cannot start R (#183): its biomarker charts are told so.
      `window.__safetyVizApp = SafetyVizApp.mount('#app', { libraries: ${librariesExpression([bioViz], { r: 'unavailable', fromFile: false })}, pitch: ${JSON.stringify(FILE_PITCH)} });`
    );
    expect(html).not.toContain('sourceMappingURL');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html.match(/<script>/g)).toHaveLength(3);
    expect(librariesExpression([bioViz])).toBe(
      '[{ name: "bio.viz", file: "bio.viz.js", charts: window.BioViz, manifest: window.BioViz && window.BioViz.portfolio }]'
    );
  });
});
