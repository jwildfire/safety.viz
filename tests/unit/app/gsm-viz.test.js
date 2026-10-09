// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  GSM_VIZ,
  RECORD_FILE,
  readRecord,
  sha256,
  verifyDeclaredChanges,
  verifyVendored
} from '../../../scripts/vendor-lib.mjs';
import { RBQM_CHARTS, libraryScript, withoutSourceMap } from '../../../scripts/app-libraries.mjs';

// gsm.viz's bundle for the RBQM tab (#232, obot.roadmap#374): the built
// `index.js` Gilead-Public/gsm.viz keeps at the root of its repository, copied
// from its v2.4.1 tag by scripts/vendor-gsm-viz.mjs with the tag, commit,
// licence and checksums recorded. These tests hold the copy to its record, the
// bundle to the three charts the tab draws, and what the demo app's directory
// serves to the copy.

// jsdom's `import.meta.url` is not a file's, so the root is the directory the tests run from.
const root = process.cwd();
const vendorDir = path.join(root, GSM_VIZ.directory);

describe('the vendored gsm.viz bundle (#232)', () => {
  it('APP-RBQM-001: the bundle and the repository’s licence are copied from gsm.viz’s v2.4.1 tag, and match their record of the repository, the tag, the full commit, the version, the licence and each file’s checksum and size (#232)', () => {
    expect(verifyVendored(vendorDir)).toEqual([]);
    expect(verifyDeclaredChanges(readRecord(vendorDir), GSM_VIZ)).toEqual([]);
    const record = readRecord(vendorDir);
    expect(GSM_VIZ.tag).toBe('v2.4.1');
    expect(record).toMatchObject({
      bundle: 'gsm.viz script-tag bundle',
      repository: 'https://github.com/Gilead-Public/gsm.viz',
      ref: 'v2.4.1',
      tag: 'v2.4.1',
      version: '2.4.1',
      merged_to_dev: false
    });
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof record.license).toBe('string');
    expect(record.files.map((entry) => `${entry.source} -> ${entry.file}`)).toEqual([
      'index.js -> index.js',
      'LICENSE -> LICENSE'
    ]);
    for (const entry of record.files) {
      const bytes = readFileSync(path.join(vendorDir, entry.file));
      expect(entry.sha256, entry.file).toBe(sha256(bytes));
      expect(entry.bytes, entry.file).toBe(bytes.length);
      // Copied whole: the record lists no changed line for either file.
      expect(entry.patches, entry.file).toBe(undefined);
    }
  });

  it('APP-RBQM-002: the check fails when a byte of the bundle changes, a file is there unrecorded, or the record is missing (#232)', () => {
    const copy = () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'vendor-gsm-viz-'));
      cpSync(vendorDir, dir, { recursive: true });
      return dir;
    };
    const changed = copy();
    const file = path.join(changed, 'index.js');
    writeFileSync(file, `${readFileSync(file, 'utf8')} `);
    expect(verifyVendored(changed).join(' ')).toMatch(
      /index\.js: the file no longer matches its recorded checksum/
    );
    const extra = copy();
    writeFileSync(path.join(extra, 'index.js.map'), '');
    expect(verifyVendored(extra)).toEqual([`index.js.map: present, but not in ${RECORD_FILE}.`]);
    const unrecorded = copy();
    rmSync(path.join(unrecorded, RECORD_FILE));
    expect(verifyVendored(unrecorded)).toEqual([
      `${RECORD_FILE} is missing: the files have no source record.`
    ]);
  });

  it('APP-RBQM-002: one command makes the check and says the copy matches; with a byte changed it exits 1 naming the file; asked to copy from anywhere but the tag it names, it refuses (#232)', () => {
    const SCRIPT = 'scripts/vendor-gsm-viz.mjs';
    const run = (cwd, ...args) =>
      spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
    const passed = run(root, '--check');
    expect(passed.stderr).toBe('');
    expect(passed.status).toBe(0);
    expect(passed.stdout).toMatch(
      /^✓ site\/vendor\/gsm\.viz: index\.js, LICENSE matches its recorded checksum \(copied from Gilead-Public\/gsm\.viz at [0-9a-f]{7}\)\.$/m
    );
    // The scripts and the folder, copied elsewhere, with one byte added there.
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'vendor-gsm-viz-cli-'));
    mkdirSync(path.join(elsewhere, 'scripts'));
    for (const script of ['vendor-gsm-viz.mjs', 'vendor-cli.mjs', 'vendor-lib.mjs']) {
      cpSync(path.join(root, 'scripts', script), path.join(elsewhere, 'scripts', script));
    }
    cpSync(vendorDir, path.join(elsewhere, GSM_VIZ.directory), { recursive: true });
    expect(run(elsewhere, '--check').status).toBe(0);
    const bundle = path.join(elsewhere, GSM_VIZ.directory, 'index.js');
    writeFileSync(bundle, `${readFileSync(bundle, 'utf8')} `);
    const failed = run(elsewhere, '--check');
    expect(failed.status).toBe(1);
    expect(failed.stderr).toMatch(/index\.js: the file no longer matches its recorded checksum/);
    // Where to copy from is the script's to say, not the command line's.
    const refused = run(elsewhere, '--ref', 'main', '--unmerged', 'because');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/gsm\.viz's tag is named in scripts\/vendor-lib\.mjs/);
  });

  it('APP-RBQM-003: run as a page runs it, the bundle defines the global gsmViz, and the three charts the tab draws, groupOverview, scatterPlot and barChart, are functions on its `default`, where gsm.viz’s own R bindings call them (#232)', () => {
    const script = readFileSync(path.join(vendorDir, 'index.js'), 'utf8');
    const gsmViz = new Function(`${script}\nreturn ${GSM_VIZ.global};`)();
    expect(GSM_VIZ.global).toBe('gsmViz');
    // The bundle is an ES module's exports: the charts are its default export.
    expect(Object.keys(gsmViz)).toEqual(['default']);
    for (const chart of ['groupOverview', 'scatterPlot', 'barChart']) {
      expect(typeof gsmViz.default[chart], chart).toBe('function');
    }
  });

  it('APP-RBQM-004: the demo app’s directory serves the bundle beside the app under a name of its own, the copy but for its source-map line, with the licence byte for byte (#232)', () => {
    expect(RBQM_CHARTS).toMatchObject({
      name: 'gsm.viz',
      global: 'gsmViz',
      file: 'gsm.viz.js',
      path: path.join(GSM_VIZ.directory, 'index.js'),
      license: { file: 'gsm.viz.LICENSE.txt', path: path.join(GSM_VIZ.directory, 'LICENSE') },
      repository: GSM_VIZ.repository
    });
    const vendored = readFileSync(path.join(vendorDir, 'index.js'), 'utf8');
    const served = withoutSourceMap(libraryScript(RBQM_CHARTS));
    expect(vendored).toMatch(/^\/\/# sourceMappingURL=index\.js\.map$/m);
    expect(served).not.toMatch(/sourceMappingURL/);
    expect(served).toBe(vendored.replace('//# sourceMappingURL=index.js.map\n', ''));
  });
});
