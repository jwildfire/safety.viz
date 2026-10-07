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
  GSM_BIO_STATISTICS,
  RECORD_FILE,
  readRecord,
  sha256,
  compareWithDev,
  tagCommitFrom,
  verifyOnDev,
  verifyTag,
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
  it('APP-BIO-001: the copy matches its record, which names bio.viz, the full commit, where it was copied from (the dev branch, or a release tag of the version it records) and the file’s checksum and size (#182, #212)', () => {
    expect(verifyVendored(vendorDir)).toEqual([]);
    const record = readRecord(vendorDir);
    expect(record).toMatchObject({
      bundle: 'bio.viz script-tag bundle',
      repository: 'https://github.com/jwildfire/bio.viz'
    });
    // From the head of dev, or from a release: the record says which.
    expect(record).toMatchObject(
      record.tag === undefined
        ? { ref: 'dev', merged_to_dev: true }
        : { ref: `v${record.version}`, tag: `v${record.version}`, merged_to_dev: false }
    );
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
    // The copy's own record, as one made from the head of dev says it (the
    // copy may be from a release tag, which APP-BIO-020 holds).
    const record = { ...readRecord(vendorDir), merged_to_dev: true };
    delete record.tag;
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

  it('APP-BIO-020: a copy from a release tag records the tag; the source check asks the repository what that tag points at, and fails when it is another commit, when there is no such tag, or when the tag is not the recorded version’s; a record that names no tag is not asked (#212)', async () => {
    const commit = 'a'.repeat(40);
    const other = 'b'.repeat(40);
    const record = {
      repository: 'https://github.com/jwildfire/bio.viz',
      ref: 'v0.3.0',
      commit,
      version: '0.3.0',
      tag: 'v0.3.0',
      merged_to_dev: false
    };
    const asked = vi.fn(async () => commit);
    expect(await verifyTag(record, asked)).toEqual([]);
    expect(asked).toHaveBeenCalledWith('v0.3.0');
    // A release is not on dev, and the record says so: the on-dev check asks nothing.
    const compare = vi.fn();
    expect(await verifyOnDev(record, compare)).toEqual([]);
    expect(compare).not.toHaveBeenCalled();
    expect(await verifyTag(record, async () => other)).toEqual([
      `${RECORD_FILE} says aaaaaaa is ${record.repository}’s tag v0.3.0, but that tag is bbbbbbb.`
    ]);
    expect(await verifyTag(record, async () => null)).toEqual([
      `${RECORD_FILE} says aaaaaaa is ${record.repository}’s tag v0.3.0, but there is no such tag.`
    ]);
    expect(await verifyTag({ ...record, version: '0.2.0' }, asked)).toEqual([
      `${RECORD_FILE} names the tag v0.3.0 and version 0.2.0, which is not that tag's version.`
    ]);
    expect(await verifyTag({ ...record, tag: '' }, asked)).toEqual([
      `${RECORD_FILE} names a tag that is not a name.`
    ]);
    // A copy from dev names no tag, and is not asked about one.
    const unasked = vi.fn();
    expect(
      await verifyTag(readRecord(vendorDir).tag ? { commit } : readRecord(vendorDir), unasked)
    ).toEqual([]);
    expect(unasked).not.toHaveBeenCalled();
    // What git lists for a tag: an annotated tag's commit is its peeled line.
    const tagObject = 'c'.repeat(40);
    expect(
      tagCommitFrom(`${tagObject}\trefs/tags/v0.3.0\n${commit}\trefs/tags/v0.3.0^{}\n`, 'v0.3.0')
    ).toBe(commit);
    expect(tagCommitFrom(`${commit}\trefs/tags/v0.3.0\n`, 'v0.3.0')).toBe(commit);
    expect(tagCommitFrom(`${commit}\trefs/tags/v0.3.0-rc1\n`, 'v0.3.0')).toBe(null);
    expect(tagCommitFrom('', 'v0.3.0')).toBe(null);
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

  it('APP-BIO-003: its chart list is format version 2 and valid, lists five charts under one Biomarkers group, the cross-tabulation among them, and merges into the app with every factory present and every entry usable (#182, #212)', () => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    expect(validate(bioManifest), JSON.stringify(validate.errors)).toBe(true);
    expect(bioManifest.version).toBe(2);
    expect(bioManifest.groups).toEqual({ biomarkers: { label: 'Biomarkers', order: 0 } });
    expect(
      Object.entries(bioManifest.modules).map(([module, entry]) => [module, entry.title])
    ).toEqual([
      ['group-comparison', 'Group comparison'],
      ['association-scatter', 'Association scatter'],
      ['correlation-matrix', 'Correlation matrix'],
      ['biomarker-screen', 'Biomarker screen'],
      ['cross-tab', 'Cross-tabulation']
    ]);
    const entries = Object.values(bioManifest.modules);
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
    // No entry is refused: each reads only columns the standard domains have.
    expect(problems).toEqual({});
    for (const module of Object.keys(bioManifest.modules)) {
      expect(typeof factoryOf(module)).toBe('function');
    }
    expect(chartGroups(all).map(([group, members]) => [group, members.length])).toEqual([
      ['bds', 9],
      ['eg', 1],
      ['ae', 3],
      ['biomarkers', 5]
    ]);
  });

  it('APP-BIO-019: the copied bundle is at least bio.viz 0.2.0, the first with the cross-tabulation, and the statistics file beside it is no older: each record names its version (#212)', () => {
    const parts = (version) => String(version).split('.').slice(0, 3).map(Number);
    const atLeast = (version, least) => {
      const [a, b] = [parts(version), parts(least)];
      const at = a.findIndex((part, index) => part !== b[index]);
      return at === -1 || a[at] > b[at];
    };
    const bundle = readRecord(vendorDir);
    const statistics = readRecord(path.join(root, GSM_BIO_STATISTICS.directory));
    expect(atLeast(bundle.version, '0.2.0'), `bio.viz ${bundle.version}`).toBe(true);
    expect(atLeast(statistics.version, '0.2.0'), `gsm.bio ${statistics.version}`).toBe(true);
    // The version the bundle says of itself is the record's.
    const exports = new Function(`${libraryScript(bioViz)}\nreturn BioViz;`)();
    expect(exports.version).toBe(bundle.version);
    expect(typeof exports.crossTab).toBe('function');
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
