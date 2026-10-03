import { describe, it, expect } from 'vitest';
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
      `window.__safetyVizApp = SafetyVizApp.mount('#app', { libraries: ${librariesExpression([bioViz], { r: 'unavailable' })}, pitch: ${JSON.stringify(FILE_PITCH)} });`
    );
    expect(html).not.toContain('sourceMappingURL');
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html.match(/<script>/g)).toHaveLength(3);
    expect(librariesExpression([bioViz])).toBe(
      '[{ name: "bio.viz", charts: window.BioViz, manifest: window.BioViz && window.BioViz.portfolio }]'
    );
  });
});
