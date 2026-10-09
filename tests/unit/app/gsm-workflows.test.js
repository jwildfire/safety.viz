import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GSM_KRI_WORKFLOWS,
  GSM_MAPPING_WORKFLOWS,
  GSM_REPORTING_WORKFLOWS,
  GSM_WORKFLOWS,
  RECORD_FILE,
  applyPatches,
  buildRecord,
  descriptionField,
  readRecord,
  sha256,
  undoPatches,
  verifyAgainstSource,
  verifyDeclaredChanges,
  verifyVendored,
  writeVendored
} from '../../../scripts/vendor-lib.mjs';

// The gsm pipeline's workflow files (#230, obot.roadmap#373): the mapping,
// metric and reporting YAML that R in the browser is to run, copied from the
// release tags of gsm.mapping, gsm.kri and gsm.reporting by
// scripts/vendor-gsm-workflows.mjs, each folder with its record. These tests
// hold every copy to its record, and the one line that differs from its tag to
// the change the record lists; nothing here asks the network for anything.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = (source) => path.join(root, source.directory);
const RESULTS = 'workflow/3_reporting/Results.yaml';
const [RESULTS_PATCH] = GSM_REPORTING_WORKFLOWS.files.find(
  (entry) => entry.file === RESULTS
).patches;

// A folder's copy, to change without touching the real one.
const copyOf = (source) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'vendor-gsm-workflows-'));
  cpSync(folder(source), directory, { recursive: true });
  return directory;
};

// What the tag holds, as the source check is given it: a copied file as it is,
// and a file with recorded changes with them undone.
const tagOf = (source) => async (commit, file) => {
  const entry = readRecord(folder(source)).files.find((recorded) => recorded.source === file);
  const bytes = readFileSync(path.join(folder(source), entry.file));
  return entry.patches ? undoPatches(bytes, entry.patches) : bytes;
};

// One byte of a file, changed in place: the file keeps its length.
const changeOneByte = (file) => {
  const bytes = readFileSync(file);
  const at = Math.floor(bytes.length / 2);
  bytes[at] = bytes[at] === 0x61 ? 0x62 : 0x61;
  writeFileSync(file, bytes);
};

// The lines of one text that are not the same line of the other.
const changedLines = (ours, theirs) => {
  const [a, b] = [ours, theirs].map((bytes) => bytes.toString('utf8').split('\n'));
  expect(a.length).toBe(b.length);
  return a.map((line, index) => [b[index], line]).filter(([was, is]) => was !== is);
};

describe('the copied gsm workflows', () => {
  it('APP-WF-001: each folder matches its record, which names the package’s repository, its release tag, the full commit and every file’s checksum and size; the files are the ten mapping workflows, the eight metrics with the one R file, and the four reporting tables (#230)', () => {
    expect(GSM_WORKFLOWS).toEqual([
      GSM_MAPPING_WORKFLOWS,
      GSM_KRI_WORKFLOWS,
      GSM_REPORTING_WORKFLOWS
    ]);
    expect(GSM_WORKFLOWS.map((source) => [source.repository, source.tag])).toEqual([
      ['https://github.com/Gilead-Public/gsm.mapping', 'v1.1.6'],
      ['https://github.com/Gilead-Public/gsm.kri', 'v1.7.0'],
      ['https://github.com/Gilead-Public/gsm.reporting', 'v1.1.7']
    ]);
    for (const source of GSM_WORKFLOWS) {
      expect(verifyVendored(folder(source)), source.directory).toEqual([]);
      const record = readRecord(folder(source));
      expect(record).toMatchObject({
        workflows: source.name,
        repository: source.repository,
        ref: source.tag,
        tag: source.tag,
        version: source.tag.slice(1),
        merged_to_dev: false
      });
      expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
      // The record lists what the script says it copies, and nothing else.
      expect(record.files.map(({ file, source: from }) => ({ file, source: from }))).toEqual(
        source.files.map(({ file, source: from }) => ({ file, source: from }))
      );
      for (const entry of record.files) {
        const bytes = readFileSync(path.join(folder(source), entry.file));
        expect(entry.sha256, entry.file).toBe(sha256(bytes));
        expect(entry.bytes, entry.file).toBe(bytes.length);
      }
    }
    const names = (source, pattern) =>
      source.files.map((entry) => (entry.file.match(pattern) || [])[1]).filter(Boolean);
    expect(names(GSM_MAPPING_WORKFLOWS, /^workflow\/1_mappings\/(\w+)\.yaml$/)).toEqual(
      'SUBJ AE PD LB STUDCOMP SDRGCOMP SITE STUDY ENROLL COUNTRY'.split(' ')
    );
    expect(GSM_MAPPING_WORKFLOWS.files).toHaveLength(10);
    expect(names(GSM_KRI_WORKFLOWS, /^workflow\/2_metrics\/(\w+)\.yaml$/)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 12].map((number) => `kri${String(number).padStart(4, '0')}`)
    );
    expect(GSM_KRI_WORKFLOWS.files.map((entry) => entry.file).slice(8)).toEqual([
      'R/util-Report.R'
    ]);
    expect(names(GSM_REPORTING_WORKFLOWS, /^workflow\/3_reporting\/(\w+)\.yaml$/)).toEqual([
      'Results',
      'Bounds',
      'Groups',
      'Metrics'
    ]);
    expect(GSM_REPORTING_WORKFLOWS.files).toHaveLength(4);
  });

  it('APP-WF-002: a one-byte change to any copied file fails the record check and the source check, each naming the file; so does a file in a subfolder that the record does not list, and a listed file that is gone (#230)', async () => {
    for (const source of GSM_WORKFLOWS) {
      for (const { file } of source.files) {
        const changed = copyOf(source);
        changeOneByte(path.join(changed, file));
        const problems = verifyVendored(changed);
        expect(problems, file).toHaveLength(1);
        expect(problems[0], file).toMatch(/no longer matches its recorded checksum/);
        expect(problems[0].startsWith(`${file}: `), file).toBe(true);
        const against = await verifyAgainstSource(changed, tagOf(source));
        expect(against, file).toHaveLength(1);
        expect(against[0].startsWith(`${file}: differs from `), file).toBe(true);
        rmSync(changed, { recursive: true });
      }
      // Unchanged, the same two checks pass: the failures above are the change's.
      const same = copyOf(source);
      expect(verifyVendored(same)).toEqual([]);
      expect(await verifyAgainstSource(same, tagOf(source))).toEqual([]);
      rmSync(same, { recursive: true });
    }
    const [first] = GSM_MAPPING_WORKFLOWS.files;
    const extra = copyOf(GSM_MAPPING_WORKFLOWS);
    writeFileSync(path.join(extra, 'workflow/1_mappings/OTHER.yaml'), '');
    expect(verifyVendored(extra)).toEqual([
      `workflow/1_mappings/OTHER.yaml: present, but not in ${RECORD_FILE}.`
    ]);
    const gone = copyOf(GSM_MAPPING_WORKFLOWS);
    rmSync(path.join(gone, first.file));
    expect(verifyVendored(gone)).toEqual([`${first.file}: recorded, but the file is missing.`]);
  });

  it('APP-WF-003: one line of one file differs from its tag, the line of the Results workflow that names FilterByLatestSnapshotDate, and the record lists the line as it was, as it is and why; the function it names is defined in the R file copied from gsm.kri’s tag (#230)', () => {
    expect(RESULTS_PATCH).toEqual({
      original: '    name: gsm.kri::FilterByLatestSnapshotDate',
      replacement: '    name: FilterByLatestSnapshotDate',
      reason: expect.stringMatching(/gsm\.kri is not installed/)
    });
    // One recorded change in all three records, and it is the one the script declares.
    const patched = GSM_WORKFLOWS.flatMap((source) =>
      readRecord(folder(source)).files.filter((entry) => entry.patches !== undefined)
    );
    expect(patched.map((entry) => entry.file)).toEqual([RESULTS]);
    expect(patched[0].patches).toEqual([RESULTS_PATCH]);
    expect(
      GSM_WORKFLOWS.flatMap((source) => source.files).filter((entry) => entry.patches)
    ).toEqual([
      {
        file: RESULTS,
        source: 'inst/workflow/3_reporting/Results.yaml',
        patches: [RESULTS_PATCH]
      }
    ]);
    // With the change undone the file is the tag's, by the checksum recorded for it.
    const ours = readFileSync(path.join(folder(GSM_REPORTING_WORKFLOWS), RESULTS));
    const theirs = undoPatches(ours, patched[0].patches);
    expect(sha256(theirs)).toBe(patched[0].source_sha256);
    expect(theirs.length).toBe(patched[0].source_bytes);
    expect(applyPatches(theirs, patched[0].patches).equals(ours)).toBe(true);
    expect(changedLines(ours, theirs)).toEqual([
      [RESULTS_PATCH.original, RESULTS_PATCH.replacement]
    ]);
    // No other copied workflow names a gsm.kri function, so no other line needs the change.
    for (const source of GSM_WORKFLOWS) {
      for (const { file } of source.files.filter((entry) => entry.file.endsWith('.yaml'))) {
        expect(readFileSync(path.join(folder(source), file), 'utf8'), file).not.toMatch(
          /gsm\.kri::/
        );
      }
    }
    // The R file is gsm.kri's own, whole: it defines the function and the helper it uses.
    const helpers = readFileSync(path.join(folder(GSM_KRI_WORKFLOWS), 'R/util-Report.R'), 'utf8');
    expect(helpers).toMatch(/^FilterByLatestSnapshotDate <- function\(/m);
    expect(helpers).toMatch(/^`%\|0\|%` <- function\(/m);
  });

  it('APP-WF-004: a second changed line in the Results workflow fails both checks, even when its checksum in the record is rewritten to match; written into the record as a change, it fails because the script declares one change; putting the changed line back as the tag has it fails too (#230)', async () => {
    const tamper = (edit, { rewriteRecord = false } = {}) => {
      const directory = copyOf(GSM_REPORTING_WORKFLOWS);
      const file = path.join(directory, RESULTS);
      const text = edit(readFileSync(file, 'utf8'));
      expect(text).not.toBe(readFileSync(file, 'utf8'));
      writeFileSync(file, text);
      if (rewriteRecord) {
        const record = readRecord(directory);
        const entry = record.files.find((recorded) => recorded.file === RESULTS);
        Object.assign(entry, {
          sha256: sha256(Buffer.from(text)),
          bytes: Buffer.from(text).length
        });
        writeFileSync(path.join(directory, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
      }
      return directory;
    };
    const secondLine = (text) => text.replace('  Priority: 1\n', '  Priority: 2\n');
    const second = tamper(secondLine);
    expect(verifyVendored(second)).toEqual([
      expect.stringMatching(
        /^workflow\/3_reporting\/Results\.yaml: the file no longer matches its recorded checksum/
      )
    ]);
    const tag = tagOf(GSM_REPORTING_WORKFLOWS);
    expect(await verifyAgainstSource(second, tag)).toEqual([
      expect.stringMatching(
        /^workflow\/3_reporting\/Results\.yaml: differs from inst\/workflow\/3_reporting\/Results\.yaml at [0-9a-f]{7} of https:\/\/github\.com\/Gilead-Public\/gsm\.reporting, with its recorded change made\.$/
      )
    ]);
    // The record's checksum rewritten to the changed file: the recorded change,
    // undone, no longer gives the file the record says the tag holds.
    const rewritten = tamper(secondLine, { rewriteRecord: true });
    expect(verifyVendored(rewritten)).toEqual([
      expect.stringMatching(
        /^workflow\/3_reporting\/Results\.yaml: with its recorded change undone, it is not the source file the record names/
      )
    ]);
    expect(await verifyAgainstSource(rewritten, tag)).toHaveLength(1);
    // The changed line put back as the tag has it: the file is the tag's, and
    // is not the file the record describes.
    const reverted = tamper((text) =>
      text.replace(RESULTS_PATCH.replacement, RESULTS_PATCH.original)
    );
    expect(verifyVendored(reverted)).toHaveLength(1);
    expect(await verifyAgainstSource(reverted, tag)).toHaveLength(1);
    const revertedAndRewritten = tamper(
      (text) => text.replace(RESULTS_PATCH.replacement, RESULTS_PATCH.original),
      { rewriteRecord: true }
    );
    expect(verifyVendored(revertedAndRewritten)).toEqual([
      expect.stringMatching(
        /^workflow\/3_reporting\/Results\.yaml: its recorded change cannot be undone: the line "    name: FilterByLatestSnapshotDate" is there 0 times/
      )
    ]);
    // A second line changed and written into the record as a change, with every
    // checksum to match: the folder agrees with its record, and the record with
    // the tag, but the script that copies the file declares one change, not two.
    const forged = tamper(secondLine, { rewriteRecord: true });
    const forgery = readRecord(forged);
    forgery.files
      .find((entry) => entry.file === RESULTS)
      .patches.push({ original: '  Priority: 1', replacement: '  Priority: 2', reason: 'None.' });
    writeFileSync(path.join(forged, RECORD_FILE), `${JSON.stringify(forgery, null, 2)}\n`);
    expect(verifyVendored(forged)).toEqual([]);
    expect(await verifyAgainstSource(forged, tag)).toEqual([]);
    expect(verifyDeclaredChanges(forgery, GSM_REPORTING_WORKFLOWS)).toEqual([
      `${RESULTS}: ${RECORD_FILE} does not list the change the script that copies it declares, as it declares it.`
    ]);
    // The same of a file the script declares no change for, and of a declared change left out.
    const [bounds] = forgery.files.filter((entry) => entry.file.endsWith('/Bounds.yaml'));
    bounds.patches = [RESULTS_PATCH];
    expect(verifyDeclaredChanges(forgery, GSM_REPORTING_WORKFLOWS)[1]).toBe(
      `${bounds.file}: ${RECORD_FILE} lists a change to it, and the script that copies it declares none.`
    );
    const silent = readRecord(folder(GSM_REPORTING_WORKFLOWS));
    delete silent.files.find((entry) => entry.file === RESULTS).patches;
    expect(verifyDeclaredChanges(silent, GSM_REPORTING_WORKFLOWS)).toHaveLength(1);
    for (const source of GSM_WORKFLOWS) {
      expect(verifyDeclaredChanges(readRecord(folder(source)), source)).toEqual([]);
    }
    // A record whose change is edited no longer describes the file either.
    const edited = copyOf(GSM_REPORTING_WORKFLOWS);
    const record = readRecord(edited);
    record.files.find((entry) => entry.file === RESULTS).patches[0].original =
      '    name: gsm.core::FilterByLatestSnapshotDate';
    writeFileSync(path.join(edited, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
    expect(verifyVendored(edited)).toHaveLength(1);
    expect(await verifyAgainstSource(edited, tag)).toEqual([
      expect.stringMatching(/does not take its recorded change: the line .* is there 0 times/)
    ]);
  });

  it('APP-WF-005: a recorded change is refused when the line it replaces is not in the source exactly once, as a whole line: absent, there twice, or there only as part of a line; a change with no reason, of more than one line or that changes nothing is refused too, and nothing is written (#230)', async () => {
    const patch = { original: '  name: a::f', replacement: '  name: f', reason: 'a is not there.' };
    const source = Buffer.from('steps:\n  name: a::f\n  name: b::g\n');
    expect(applyPatches(source, [patch]).toString()).toBe('steps:\n  name: f\n  name: b::g\n');
    expect(undoPatches(applyPatches(source, [patch]), [patch]).equals(source)).toBe(true);
    // No changes: the bytes as they are.
    expect(applyPatches(source, undefined).equals(source)).toBe(true);
    // Every other byte is kept as it is, a carriage return or a byte that is not text among them.
    const odd = Buffer.concat([Buffer.from([0xff, 0x0d, 0x0a]), source, Buffer.from([0x00])]);
    expect(applyPatches(odd, [patch]).length).toBe(odd.length - 3);
    expect(undoPatches(applyPatches(odd, [patch]), [patch]).equals(odd)).toBe(true);
    const absent = () => applyPatches(Buffer.from('steps:\n  name: b::g\n'), [patch]);
    expect(absent).toThrow('the line "  name: a::f" is there 0 times, and must be there once.');
    const twice = () => applyPatches(Buffer.concat([source, source]), [patch]);
    expect(twice).toThrow('the line "  name: a::f" is there 2 times, and must be there once.');
    // Part of a line, or the line with other indentation or a carriage return, is not the line.
    for (const text of [
      '    name: a::f\n',
      '  name: a::fn\n',
      '  name: a::f\r\n',
      'x  name: a::f\n'
    ]) {
      expect(() => applyPatches(Buffer.from(text), [patch]), JSON.stringify(text)).toThrow(
        /is there 0 times/
      );
    }
    // Undoing asks the same of the line as it is now.
    expect(() => undoPatches(source, [patch])).toThrow(
      'the line "  name: f" is there 0 times, and must be there once.'
    );
    for (const bad of [
      { ...patch, reason: '' },
      { original: patch.original, replacement: patch.replacement },
      { ...patch, replacement: patch.original },
      { ...patch, replacement: '  name: f\n  extra: 1' },
      { ...patch, original: 7 },
      null
    ]) {
      expect(() => applyPatches(source, [bad]), JSON.stringify(bad)).toThrow(
        /A recorded change needs/
      );
    }
    expect(() => applyPatches(source, [])).toThrow(/lists no changes/);
    expect(() => applyPatches(source, 'none')).toThrow(/lists no changes/);

    // A copy whose source does not hold the line once is not made.
    const commit = 'a'.repeat(40);
    const files = [{ file: 'workflow/x.yaml', source: 'inst/workflow/x.yaml', patches: [patch] }];
    const copying = { label: 'workflows', name: 'a test', repository: 'https://example.test/a' };
    const build = (bytes) =>
      buildRecord({ source: { ...copying, files }, ref: 'v1', commit, read: () => bytes });
    expect(() => build(Buffer.concat([source, source]))).toThrow(
      'inst/workflow/x.yaml: the line "  name: a::f" is there 2 times, and must be there once.'
    );
    expect(() => build(Buffer.from('steps:\n'))).toThrow(/is there 0 times/);
    // One that does is written into its subfolder, changed, with both checksums.
    const directory = mkdtempSync(path.join(tmpdir(), 'vendor-gsm-workflows-'));
    const vendored = build(source);
    writeVendored(directory, vendored);
    expect(existsSync(path.join(directory, 'workflow/x.yaml'))).toBe(true);
    expect(vendored.record.files).toEqual([
      {
        file: 'workflow/x.yaml',
        source: 'inst/workflow/x.yaml',
        sha256: sha256(Buffer.from('steps:\n  name: f\n  name: b::g\n')),
        bytes: source.length - 3,
        source_sha256: sha256(source),
        source_bytes: source.length,
        patches: [patch]
      }
    ]);
    expect(verifyVendored(directory)).toEqual([]);
    expect(await verifyAgainstSource(directory, async () => source)).toEqual([]);
    // The source check refuses a tag whose file has the line twice, or not at all.
    expect(
      await verifyAgainstSource(directory, async () => Buffer.concat([source, source]))
    ).toEqual([
      `workflow/x.yaml: inst/workflow/x.yaml at aaaaaaa of https://example.test/a does not take its recorded change: the line "  name: a::f" is there 2 times, and must be there once.`
    ]);
    expect(await verifyAgainstSource(directory, async () => Buffer.from('steps:\n'))).toEqual([
      expect.stringMatching(/does not take its recorded change: .* is there 0 times/)
    ]);
  });

  it('APP-WF-006: every mapped table a copied metric or reporting workflow reads is made by a copied mapping workflow, the country table among them, which the Groups workflow reads and gsm.mapping makes from the mapped participants alone (#230)', () => {
    const read = (source, file) => readFileSync(path.join(folder(source), file), 'utf8');
    // The tables a workflow’s `spec` names: the keys one level in (gsm.mapping indents
    // some by one space, some by two), as far as `steps`.
    const reads = (text) => {
      const spec = (text.split(/^spec:\n/m)[1] || '').split(/^\S/m)[0];
      return [...spec.matchAll(/^ {1,2}(\w+):/gm)].map((match) => match[1]);
    };
    const yaml = (source) => source.files.filter((entry) => entry.file.endsWith('.yaml'));
    const made = yaml(GSM_MAPPING_WORKFLOWS).map(
      (entry) => `Mapped_${read(GSM_MAPPING_WORKFLOWS, entry.file).match(/^ {2}ID: (\w+)$/m)[1]}`
    );
    expect(made).toHaveLength(10);
    const wanted = [GSM_MAPPING_WORKFLOWS, GSM_KRI_WORKFLOWS, GSM_REPORTING_WORKFLOWS].flatMap(
      (source) =>
        yaml(source).flatMap((entry) =>
          reads(read(source, entry.file))
            .filter((table) => table.startsWith('Mapped_'))
            .map((table) => `${entry.file} reads ${table}`)
        )
    );
    expect(wanted.length).toBeGreaterThan(10);
    expect(wanted.filter((line) => !made.includes(line.split(' reads ')[1]))).toEqual([]);
    expect(wanted).toContain('workflow/3_reporting/Groups.yaml reads Mapped_COUNTRY');
    expect(reads(read(GSM_MAPPING_WORKFLOWS, 'workflow/1_mappings/COUNTRY.yaml'))).toEqual([
      'Mapped_SUBJ'
    ]);
  });

  it('APP-WF-007: the version and licence a record names are read from the package’s DESCRIPTION file at the tag (#230)', () => {
    const text = 'Package: gsm.kri\nVersion: 1.7.0\nLicense: Apache License (>= 2)\n';
    expect(descriptionField(text, 'Version')).toBe('1.7.0');
    expect(descriptionField(text, 'License')).toBe('Apache License (>= 2)');
    expect(descriptionField(text, 'Title')).toBe(undefined);
    for (const source of GSM_WORKFLOWS) {
      expect(readRecord(folder(source)).license, source.directory).toBe('Apache License (>= 2)');
    }
  });

  it('APP-WF-008: one command checks all three folders and says so of each; with a line changed in one it exits 1 naming that file, and still reports the other two; asked to copy from anywhere but the tags it names, it refuses (#230)', () => {
    const SCRIPT = 'scripts/vendor-gsm-workflows.mjs';
    const run = (cwd, ...args) =>
      spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
    const passed = run(root, '--check');
    expect(passed.stderr).toBe('');
    expect(passed.status).toBe(0);
    expect(passed.stdout.trim().split('\n')).toEqual(
      GSM_WORKFLOWS.map((source) =>
        expect.stringMatching(
          new RegExp(`^✓ ${source.directory}: .* matches its recorded checksum \\(copied from `)
        )
      )
    );
    expect(passed.stdout).toMatch(
      /but for the one line the record lists as changed in workflow\/3_reporting\/Results\.yaml\)\.$/m
    );
    // The scripts and the three folders, copied elsewhere, with one line changed there.
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'vendor-gsm-workflows-'));
    mkdirSync(path.join(elsewhere, 'scripts'));
    for (const script of ['vendor-gsm-workflows.mjs', 'vendor-cli.mjs', 'vendor-lib.mjs']) {
      cpSync(path.join(root, 'scripts', script), path.join(elsewhere, 'scripts', script));
    }
    for (const source of GSM_WORKFLOWS) {
      cpSync(folder(source), path.join(elsewhere, source.directory), { recursive: true });
    }
    expect(run(elsewhere, '--check').status).toBe(0);
    const metric = path.join(
      elsewhere,
      GSM_KRI_WORKFLOWS.directory,
      'workflow/2_metrics/kri0001.yaml'
    );
    const text = readFileSync(metric, 'utf8');
    expect(text).toContain('  GroupLevel: Site\n');
    writeFileSync(metric, text.replace('  GroupLevel: Site\n', '  GroupLevel: Country\n'));
    const failed = run(elsewhere, '--check');
    expect(failed.status).toBe(1);
    expect(failed.stderr).toMatch(
      /^✗ site\/vendor\/gsm\.kri does not match its source record:\n {2}- workflow\/2_metrics\/kri0001\.yaml: the file no longer matches its recorded checksum/
    );
    expect(failed.stdout.trim().split('\n')).toEqual([
      expect.stringMatching(/^✓ site\/vendor\/gsm\.mapping: /),
      expect.stringMatching(/^✓ site\/vendor\/gsm\.reporting: /)
    ]);
    // A second line of the Results workflow changed there, and written into its
    // record as a change with the file's checksum to match: refused, because the
    // script declares one change.
    const reporting = path.join(elsewhere, GSM_REPORTING_WORKFLOWS.directory);
    const results = readFileSync(path.join(reporting, RESULTS), 'utf8');
    const forged = Buffer.from(results.replace('  Priority: 1\n', '  Priority: 2\n'));
    writeFileSync(path.join(reporting, RESULTS), forged);
    const record = readRecord(reporting);
    const entry = record.files.find((recorded) => recorded.file === RESULTS);
    entry.patches.push({
      original: '  Priority: 1',
      replacement: '  Priority: 2',
      reason: 'None.'
    });
    Object.assign(entry, { sha256: sha256(forged), bytes: forged.length });
    writeFileSync(path.join(reporting, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
    expect(verifyVendored(reporting)).toEqual([]);
    const refusedForgery = run(elsewhere, '--check');
    expect(refusedForgery.status).toBe(1);
    expect(refusedForgery.stderr).toContain(
      `✗ site/vendor/gsm.reporting does not match its source record:\n  - ${RESULTS}: ${RECORD_FILE} does not list the change the script that copies it declares, as it declares it.`
    );
    // Where to copy from is not the command line's to say, and nothing is asked for.
    for (const args of [
      ['--tag', 'v1.8.0'],
      ['--ref', 'dev']
    ]) {
      const refused = run(elsewhere, ...args);
      expect(refused.status, args.join(' ')).toBe(1);
      expect(refused.stdout).toBe('');
      expect(refused.stderr).toMatch(/each package's tag is named in scripts\/vendor-lib\.mjs/);
    }
    rmSync(elsewhere, { recursive: true });
  });
});
