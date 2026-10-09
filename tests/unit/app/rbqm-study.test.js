import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RBQM_STUDY,
  RECORD_FILE,
  buildRecord,
  keepColumns,
  readRecord,
  sha256,
  verifyAgainstSource,
  verifyDeclaredChanges,
  verifyVendored
} from '../../../scripts/vendor-lib.mjs';

// The RBQM demo study's labs file (#233, obot.roadmap#374): demo-301 keeps it
// whole, at 7.3 MB and fourteen columns; the copy here keeps the four columns
// gsm.mapping's labs workflow names, and every row. These tests hold the cut
// itself, the record of it, and both checks of a cut file.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const studyDir = path.join(root, RBQM_STUDY.directory);
const COMMIT = 'c'.repeat(40);
const WHY = { keep: ['id', 'grade'], reason: 'The test keeps two columns.' };
const csv = (text) => Buffer.from(text, 'utf8');

describe('a copied CSV file kept to some of its columns (#233)', () => {
  it('APP-RBQM-008: every row is kept, in the source’s order, and of each only the named columns, in the order named, each field byte for byte as the source has it (#233)', () => {
    const source = csv(
      '"id","visit","grade","note"\n"S1","Week 1","3","a, b"\n"S2","Week 2","0","said ""no"""\nS3,Week 3,,\n'
    );
    expect(keepColumns(source, WHY).toString('utf8')).toBe(
      '"id","grade"\n"S1","3"\n"S2","0"\nS3,\n'
    );
    // The order named is the order kept, and a quoted field keeps its commas, quotes and line breaks.
    expect(
      keepColumns(csv('id,note,grade\n1,"two\nlines, one field",4\n'), {
        keep: ['note', 'id'],
        reason: 'x'
      }).toString('utf8')
    ).toBe('note,id\n"two\nlines, one field",1\n');
    // Carriage returns are kept as line ends, and a last line with no line feed is a row.
    expect(keepColumns(csv('id,grade,x\r\n1,2,3\r\n4,5,6'), WHY).toString('latin1')).toBe(
      'id,grade\r\n1,2\r\n4,5\r\n'
    );
    // With nothing to cut, the bytes as they are.
    expect(keepColumns(source, undefined).equals(source)).toBe(true);
  });

  it('APP-RBQM-008: a cut is refused when a named column is not in the header exactly once, a row has more or fewer fields than the header, the file ends inside a quoted field, or no reason is given (#233)', () => {
    expect(() => keepColumns(csv('id,visit\n1,2\n'), WHY)).toThrow(
      /the column grade is in the header 0 times/
    );
    expect(() => keepColumns(csv('id,grade,grade\n1,2,3\n'), WHY)).toThrow(
      /the column grade is in the header 2 times/
    );
    expect(() => keepColumns(csv('id,grade\n1,2,3\n'), WHY)).toThrow(
      /record 2 has 3 fields, and the header has 2/
    );
    expect(() => keepColumns(csv('id,grade\n1,"2\n'), WHY)).toThrow(/ends inside a quoted field/);
    expect(() => keepColumns(csv('id,grade\n'), { keep: ['id'] })).toThrow(/needs its reason/);
    expect(() => keepColumns(csv('id,grade\n'), { keep: ['id', 'id'], reason: 'x' })).toThrow(
      /named twice/
    );
    expect(() => keepColumns(csv('id,grade\n'), { keep: [], reason: 'x' })).toThrow(
      /not a list of column names/
    );
    expect(() => keepColumns(csv(''), WHY)).toThrow(/no header/);
  });

  it('APP-RBQM-009: the record of a cut file names the columns kept and why, and the whole file’s checksum and size beside the copy’s; the record check fails when the copy’s columns are not the ones recorded (#233)', () => {
    const whole = csv('id,visit,grade\n1,a,3\n2,b,0\n');
    const source = {
      name: 'a study',
      label: 'study',
      repository: 'https://github.com/example/study',
      directory: 'x',
      files: [
        { file: 'labs.csv', source: 'input/labs.csv', columns: WHY },
        { file: 'sites.csv', source: 'input/sites.csv' }
      ]
    };
    const sites = csv('site\nA\n');
    const read = (file) => (file === 'input/labs.csv' ? whole : sites);
    const { record, contents } = buildRecord({ source, ref: COMMIT, commit: COMMIT, read });
    expect(record.files[0]).toEqual({
      file: 'labs.csv',
      source: 'input/labs.csv',
      sha256: sha256(csv('id,grade\n1,3\n2,0\n')),
      bytes: 17,
      source_sha256: sha256(whole),
      source_bytes: whole.length,
      columns: WHY
    });
    // A file kept whole records neither.
    expect(record.files[1]).toEqual({
      file: 'sites.csv',
      source: 'input/sites.csv',
      sha256: sha256(sites),
      bytes: sites.length
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'vendor-cut-'));
    for (const { entry, bytes } of contents) writeFileSync(path.join(dir, entry.file), bytes);
    const write = (changed) =>
      writeFileSync(path.join(dir, RECORD_FILE), `${JSON.stringify(changed, null, 2)}\n`);
    write(record);
    expect(verifyVendored(dir)).toEqual([]);
    expect(verifyDeclaredChanges(record, source)).toEqual([]);
    // The record says other columns were kept than the copy has.
    const other = structuredClone(record);
    other.files[0].columns = { keep: ['id', 'visit'], reason: 'x' };
    write(other);
    expect(verifyVendored(dir)).toEqual([
      'labs.csv: its columns are id, grade, and the record says id, visit were kept.'
    ]);
    // The record no longer names the whole file.
    const unnamed = structuredClone(record);
    delete unnamed.files[0].source_sha256;
    write(unnamed);
    expect(verifyVendored(dir)).toEqual([
      'labs.csv: the record does not name the whole file it was cut from.'
    ]);
  });

  it('APP-RBQM-009: a cut the record lists must be the one the script declares, and a file the script keeps whole may not be recorded as cut (#233)', () => {
    const declared = { files: [{ file: 'labs.csv', columns: WHY }, { file: 'sites.csv' }] };
    const recorded = (labs, sites) => ({
      files: [
        { file: 'labs.csv', ...(labs ? { columns: labs } : {}) },
        { file: 'sites.csv', ...(sites ? { columns: sites } : {}) }
      ]
    });
    expect(verifyDeclaredChanges(recorded(WHY), declared)).toEqual([]);
    expect(verifyDeclaredChanges(recorded({ ...WHY, keep: ['id'] }), declared)).toEqual([
      `labs.csv: ${RECORD_FILE} does not name the columns the script that copies it keeps, as it declares them.`
    ]);
    expect(verifyDeclaredChanges(recorded(null), declared)).toEqual([
      `labs.csv: ${RECORD_FILE} does not name the columns the script that copies it keeps, as it declares them.`
    ]);
    expect(verifyDeclaredChanges(recorded(WHY, WHY), declared)).toEqual([
      `sites.csv: ${RECORD_FILE} says only some of its columns are kept, and the script that copies it keeps them all.`
    ]);
  });

  it('APP-RBQM-010: the comparison with the source cuts the source’s whole file the same way and holds the copy to it: a row changed, added or dropped in the copy fails, and so does a source that is no longer the whole file the record names (#233)', async () => {
    const whole = csv('"id","visit","grade"\n"1","a","3"\n"2","b","0"\n');
    const source = {
      name: 'a study',
      label: 'study',
      repository: 'https://github.com/example/study',
      directory: 'x',
      files: [{ file: 'labs.csv', source: 'input/labs.csv', columns: WHY }]
    };
    const { record, contents } = buildRecord({
      source,
      ref: COMMIT,
      commit: COMMIT,
      read: () => whole
    });
    const make = (bytes = contents[0].bytes) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'vendor-cut-source-'));
      writeFileSync(path.join(dir, 'labs.csv'), bytes);
      writeFileSync(path.join(dir, RECORD_FILE), JSON.stringify(record));
      return dir;
    };
    const theirs = async () => whole;
    expect(await verifyAgainstSource(make(), theirs)).toEqual([]);
    const at = `input/labs.csv at ${COMMIT.slice(0, 7)} of https://github.com/example/study`;
    for (const changed of ['"id","grade"\n"1","3"\n"2","1"\n', '"id","grade"\n"1","3"\n']) {
      expect(await verifyAgainstSource(make(csv(changed)), theirs)).toEqual([
        `labs.csv: differs from ${at}, cut to its recorded columns.`
      ]);
    }
    // The source has moved on from the file the record names.
    expect(
      await verifyAgainstSource(make(), async () => csv('"id","visit","grade"\n"1","a","4"\n'))
    ).toEqual([`labs.csv: ${at} is not the whole file the record says it was cut from.`]);
  });
});

describe('the RBQM demo study’s labs file (#233)', () => {
  it('APP-RBQM-011: the labs file is kept to the four columns gsm.mapping’s labs workflow names in its spec, with every one of its 57,200 rows, and its record names the whole file it was cut from and why; the other eight files are kept whole (#233)', () => {
    expect(verifyVendored(studyDir)).toEqual([]);
    const record = readRecord(studyDir);
    expect(verifyDeclaredChanges(record, RBQM_STUDY)).toEqual([]);
    const cut = record.files.filter((entry) => entry.columns !== undefined);
    expect(cut.map((entry) => entry.file)).toEqual(['Raw_LB.csv']);
    const [labs] = cut;
    expect(labs.columns.keep).toEqual(['studyid', 'subjid', 'lb_dt', 'toxgrg_nsv']);
    expect(labs.columns.reason).toMatch(/Every row is kept\.$/);
    expect(labs.source_bytes).toBe(7320300);
    expect(labs.source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(labs.bytes).toBeLessThan(2.5e6);
    // The columns kept are the ones the copied labs workflow's spec names, and no other.
    const workflow = readFileSync(
      path.join(root, 'site/vendor/gsm.mapping/workflow/1_mappings/LB.yaml'),
      'utf8'
    );
    const spec = workflow.slice(workflow.indexOf('spec:'), workflow.indexOf('steps:'));
    const named = [...spec.matchAll(/^ {4}(\w+):$/gm)].map(([, column]) => column);
    expect(named.sort()).toEqual([...labs.columns.keep].sort());
    const lines = readFileSync(path.join(studyDir, 'Raw_LB.csv'), 'utf8').trimEnd().split('\n');
    expect(lines[0]).toBe('"studyid","subjid","lb_dt","toxgrg_nsv"');
    expect(lines).toHaveLength(57201);
    expect(new Set(lines.map((line) => line.split(',').length))).toEqual(new Set([4]));
  });

  it('APP-RBQM-011: with one row of the labs file changed the record check fails and names the file (#233)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rbqm-study-'));
    cpSync(studyDir, dir, { recursive: true });
    const file = path.join(dir, 'Raw_LB.csv');
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace('"2012-03-01","0"', '"2012-03-01","4"'));
    expect(verifyVendored(dir).join(' ')).toMatch(
      /Raw_LB\.csv: the file no longer matches its recorded checksum/
    );
  });
});
