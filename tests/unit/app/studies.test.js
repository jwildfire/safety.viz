import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { DEMO_STUDIES, studyUrls } from '../../../src/app/studies.js';
import { parseFile } from '../../../src/app/parse.js';

// The demo studies the hosted app offers (#159): a name, a sentence and a list
// of files each. The files are kept in the repository and copied beside the
// app by the site build; the single file carries none of them.

const kept = (study, file) => new URL(`../../../${study.source}/${file}`, import.meta.url);

describe('demo app: the demo studies', () => {
  it('APP-LOAD-022: each demo study has an id, a name, a description and files the repository keeps (#159)', () => {
    expect(DEMO_STUDIES.map((study) => study.id)).toEqual(['pilot', 'renamed', 'liver']);
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

  it('APP-LOAD-022: a study’s files are fetched from its own directory under the demo base, or from a base of its own (#159)', () => {
    const [pilot, renamed] = DEMO_STUDIES;
    expect(studyUrls(pilot, './').slice(0, 2)).toEqual(['./adsl.csv', './adae.csv']);
    expect(studyUrls(renamed, './')[0]).toBe('./renamed/dm.csv');
    expect(studyUrls({ ...renamed, base: '/tests/e2e/fixtures/app/' }, './')[0]).toBe(
      '/tests/e2e/fixtures/app/dm.csv'
    );
  });
});
