import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { DEMO_STUDIES, studyUrls } from '../../../src/app/studies.js';
import { parseFile } from '../../../src/app/parse.js';
import { RBQM_STUDY, readRecord, sha256 } from '../../../scripts/vendor-lib.mjs';

// The demo studies the hosted app offers (#159): a name, a sentence and a list
// of files each. The files are kept in the repository and copied beside the
// app by the site build; the single file carries none of them.

const kept = (study, file) => new URL(`../../../${study.source}/${file}`, import.meta.url);

describe('demo app: the demo studies', () => {
  it('APP-LOAD-022: each demo study has an id, a name, a description and files the repository keeps (#159)', () => {
    expect(DEMO_STUDIES.map((study) => study.id)).toEqual(['pilot', 'renamed', 'liver', 'rbqm']);
    for (const study of DEMO_STUDIES) {
      expect(study.label).toMatch(/\S/);
      expect(study.description).toMatch(/\.$/);
      expect(study.files.length).toBeGreaterThan(0);
      for (const file of study.files) {
        expect(existsSync(kept(study, file)), `${study.id}: ${study.source}/${file}`).toBe(true);
      }
    }
  });

  it('APP-LOAD-022: the pilot study is the manifest’s demo extracts, and says its labs file holds participants no other file has (#159)', () => {
    const [pilot] = DEMO_STUDIES;
    expect(pilot.files).toEqual(Object.values(manifest.domains).map((domain) => domain.demo));
    // The sentence is held to the files: the labs extract's participants that the subject-level file lacks.
    const ids = (file) =>
      new Set(
        parseFile(file, readFileSync(kept(pilot, file), 'utf8')).rows.map((row) => row.USUBJID)
      );
    const subjects = ids('adsl.csv');
    const extra = [...ids('adbds.csv')].filter((id) => !subjects.has(id));
    expect(pilot.description).toContain(`${subjects.size} participants`);
    expect(pilot.description).toContain(`${extra.length} synthetic liver and kidney participants`);
  });

  it('APP-LOAD-022: the descriptions of the other studies match their files (#159)', () => {
    const [, renamed, liver] = DEMO_STUDIES;
    const rows = (study, file) => parseFile(file, readFileSync(kept(study, file), 'utf8')).rows;
    expect(renamed.description).toContain(
      `${new Set(rows(renamed, 'dm.csv').map((row) => row.SUBJID)).size} pilot participants`
    );
    expect(liver.files).toHaveLength(1);
    expect(liver.description).toContain(
      `${new Set(rows(liver, liver.files[0]).map((row) => row.USUBJID)).size} synthetic participants`
    );
  });

  it('APP-RBQM-005: the RBQM study is the fourth demo study: gsm’s nine raw files, each the file the record of the demo-301 commit names, by checksum and size, in a directory of its own, and marked as raw (#233)', () => {
    const rbqm = DEMO_STUDIES[3];
    expect(rbqm).toMatchObject({
      id: 'rbqm',
      label: 'RBQM study',
      dir: 'rbqm/',
      source: 'site/data/rbqm',
      raw: true
    });
    // No other study is of raw files: each of theirs is placed and mapped.
    expect(DEMO_STUDIES.filter((study) => study.raw).map((study) => study.id)).toEqual(['rbqm']);
    expect(rbqm.source).toBe(RBQM_STUDY.directory);
    expect(rbqm.files).toEqual(RBQM_STUDY.files.map((entry) => entry.file));
    expect(rbqm.files).toEqual(
      'SUBJ AE PD LB STUDCOMP SDRGCOMP SITE STUDY ENROLL'
        .split(' ')
        .map((domain) => `Raw_${domain}.csv`)
    );
    const record = readRecord(new URL(`../../../${rbqm.source}`, import.meta.url).pathname);
    expect(record.repository).toBe('https://github.com/jwildfire/demo-301');
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.files.map((entry) => entry.file)).toEqual(rbqm.files);
    let total = 0;
    for (const entry of record.files) {
      const bytes = readFileSync(kept(rbqm, entry.file));
      expect(sha256(bytes), entry.file).toBe(entry.sha256);
      expect(bytes.length, entry.file).toBe(entry.bytes);
      total += bytes.length;
    }
    // Together under 3.5 MB as a file system counts it: 3,507,259 bytes, 3.34 MiB.
    expect(total).toBeLessThan(3.5 * 1024 * 1024);
    expect(total).toBe(3507259);
  });

  it('APP-RBQM-005: its sentence is held to its files: 1,005 screened participants, 765 of them enrolled, at 150 sites (#233)', () => {
    const rbqm = DEMO_STUDIES[3];
    const rows = (file) => parseFile(file, readFileSync(kept(rbqm, file), 'utf8')).rows;
    const enrolment = rows('Raw_ENROLL.csv');
    const count = (number) => number.toLocaleString('en-US');
    expect(rbqm.description).toContain(`of ${count(enrolment.length)} screened`);
    expect(rbqm.description).toContain(
      `${enrolment.filter((row) => row.enrollyn === 'Y').length} enrolled participants`
    );
    expect(rbqm.description).toContain(`at ${rows('Raw_SITE.csv').length} sites`);
    expect(new Set(rows('Raw_SUBJ.csv').map((row) => row.invid)).size).toBe(150);
    expect(rbqm.description).toContain('gsm’s raw domains');
    expect(rbqm.description).toContain('nine files');
  });

  it('APP-RBQM-006: the three demo studies that were there before are what they were before the RBQM study was added, byte for byte, but for the site column the pilot’s subject file has since gained (#233, #253)', () => {
    // The checksums of the files on `dev` at 4e8bad8, before this change. A file
    // regenerated on purpose later is a change to this list, made with it: the
    // pilot's adsl.csv gained SITEID (#253, at @jwildfire's word of 2026-10-07),
    // and a test below holds every other column of it to what it was.
    const before = {
      'site/data/adsl.csv': '898d324b198ce76f01f28b2be2b890ea4f0d77f357a3d5f0a49440625b176aac',
      'site/data/adae.csv': '6615467075651a3d56ebeb561ccced98450521cf84c127060146d8cde1e9c9a7',
      'site/data/adbds.csv': '8d35ce8a4727e4bcfb26481ebdfba50c2d666c3c7d39a6092b53a860962140c6',
      'site/data/adeg.csv': '3ff1ecb915df817b0a937b0c9fc59a9566d49b1f4544dca5b2fe0b4b803b152d',
      'tests/e2e/fixtures/app/dm.csv':
        '6bce41f6fd61569283f4a7b5ff9b3c3908101a6f7de5d54781221f467c631bfa',
      'tests/e2e/fixtures/app/ae.csv':
        'd0401aa762bcd17790cc67c19c913460edcf2a71e2e1cccefc96de4b76eeaf0d',
      'tests/e2e/fixtures/app/labs_final.csv':
        '85305ea71520fd6fa6b3e2af0ebc5a40de8c8527618f47e902785e00d5faf7ff',
      'tests/e2e/fixtures/app/ecg.json':
        'f802410605bde305d3d073382c36c4c653cdd43f9736340e373c74e14e2039a4',
      'site/data/adbds-abnbl.csv':
        'b6155eb8e1303a75d21ae91fbb230e0c52d8927d09385788e27414d6563e5270'
    };
    const now = {};
    for (const study of DEMO_STUDIES.slice(0, 3)) {
      for (const file of study.files) {
        now[`${study.source}/${file}`] = sha256(readFileSync(kept(study, file)));
      }
    }
    expect(now).toEqual(before);
    // And what the app says of them is what it said.
    expect(DEMO_STUDIES.slice(0, 3).map((study) => [study.id, study.dir, study.source])).toEqual([
      ['pilot', '', 'site/data'],
      ['renamed', 'renamed/', 'tests/e2e/fixtures/app'],
      ['liver', '', 'site/data']
    ]);
  });

  it('APP-RBQM-040: the pilot’s subject-level file gained one column, the site, and nothing else: with SITEID taken out it is byte for byte the file it was; each participant’s site is the site number in their ID, and there are 17 sites (#253)', () => {
    const text = readFileSync(kept(DEMO_STUDIES[0], 'adsl.csv'), 'utf8');
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toBe('USUBJID,SITEID,ARM,EOSDY,EOSSTT');
    // No field of this file is quoted, so a line splits on its commas.
    expect(text).not.toContain('"');
    const without = lines.map((line) => line.split(',').filter((_, index) => index !== 1));
    // The file on `dev` at 4e8bad8, before the column was added.
    expect(sha256(Buffer.from(`${without.map((fields) => fields.join(',')).join('\n')}\n`))).toBe(
      'd2d198906aa06ace5e0fda08442ad234c5835ec7cf19378737db7274ffd54f04'
    );
    const rows = parseFile('adsl.csv', text).rows;
    expect(rows).toHaveLength(254);
    for (const row of rows) expect(row.USUBJID.split('-')[1], row.USUBJID).toBe(row.SITEID);
    expect(new Set(rows.map((row) => row.SITEID)).size).toBe(17);
  });

  it('APP-LOAD-022: a study’s files are fetched from its own directory under the demo base, or from a base of its own (#159)', () => {
    const [pilot, renamed] = DEMO_STUDIES;
    expect(studyUrls(pilot, './').slice(0, 2)).toEqual(['./adsl.csv', './adae.csv']);
    expect(studyUrls(renamed, './')[0]).toBe('./renamed/dm.csv');
    expect(studyUrls({ ...renamed, base: '/tests/e2e/fixtures/app/' }, './')[0]).toBe(
      '/tests/e2e/fixtures/app/dm.csv'
    );
  });
});
