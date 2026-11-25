import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILDER_AREAS,
  BUILDER_CAVEATS,
  BUILDER_DEFAULTS,
  BUILDER_LIMITS,
  BUILDER_OUTLIERS,
  BUILDER_PHASES,
  BUILDER_TAB_ID,
  builtFiles,
  builtSaid,
  downloadsSaid,
  readForm,
  withPhase
} from '../../../src/app/builder.js';
import {
  BUILDER,
  BUILDER_TAB_ID as PAGE_TAB_ID,
  builderFiles,
  builderTabExpression,
  builderTabOptions
} from '../../../scripts/builder-lib.mjs';
import {
  GSM_DATASIM,
  GSM_MAPPING_VITALS,
  readRecord,
  verifyVendored
} from '../../../scripts/vendor-lib.mjs';

// The study builder's rules (the Build a study tab): what the form may hold,
// what R is asked for, the sentences, and what the page hands R. R itself is
// not started here.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const builderR = readFileSync(path.join(root, BUILDER.source), 'utf8');

describe('the form', () => {
  it('opens on values R accepts', () => {
    const { problems, args } = readForm(BUILDER_DEFAULTS);
    expect(problems).toEqual([]);
    expect(args).toEqual({
      study_name: 'BUILT-001',
      participants: 150,
      sites: 20,
      months: 9,
      outlier_intensity: 1,
      phase: 'P2',
      therapeutic_area: 'Oncology'
    });
  });

  it('sends a seed only when one is given', () => {
    expect(readForm(BUILDER_DEFAULTS).args).not.toHaveProperty('seed');
    expect(readForm({ ...BUILDER_DEFAULTS, seed: ' 42 ' }).args.seed).toBe(42);
  });

  it('fills in a typical size when a phase is chosen, and keeps the rest', () => {
    const form = withPhase({ ...BUILDER_DEFAULTS, name: 'MINE', area: 'Virology' }, 'P1');
    expect(form).toMatchObject({
      phase: 'P1',
      participants: '40',
      sites: '4',
      months: '6',
      name: 'MINE',
      area: 'Virology'
    });
    expect(readForm(form).problems).toEqual([]);
  });

  it('leaves the form as it was for a phase it does not know', () => {
    expect(withPhase(BUILDER_DEFAULTS, 'P9')).toEqual(BUILDER_DEFAULTS);
  });

  it('gives every phase a size within the limits', () => {
    for (const phase of BUILDER_PHASES) {
      expect(readForm(withPhase(BUILDER_DEFAULTS, phase.id)).problems, phase.id).toEqual([]);
    }
  });

  it('names each number that is out of range, not whole or missing', () => {
    const { problems, args } = readForm({
      ...BUILDER_DEFAULTS,
      participants: '501',
      sites: '1.5',
      months: ''
    });
    expect(args).toBeNull();
    expect(problems).toEqual([
      'Participants must be a whole number from 20 to 500.',
      'Sites must be a whole number from 2 to 100.',
      'Months must be a whole number from 3 to 12.'
    ]);
  });

  it('refuses more sites than participants', () => {
    const { problems } = readForm({ ...BUILDER_DEFAULTS, participants: '20', sites: '30' });
    expect(problems).toEqual(['Sites must be no more than participants.']);
  });

  it('refuses a study with no name, an unknown choice or a seed that is not a whole number', () => {
    expect(readForm({ ...BUILDER_DEFAULTS, name: '  ' }).problems).toEqual([
      'The study needs a name.'
    ]);
    expect(readForm({ ...BUILDER_DEFAULTS, phase: 'P9' }).problems).toEqual(['Choose a phase.']);
    expect(readForm({ ...BUILDER_DEFAULTS, area: 'Neurology' }).problems).toEqual([
      'Choose a therapeutic area.'
    ]);
    expect(readForm({ ...BUILDER_DEFAULTS, outliers: 'none' }).problems).toEqual([
      'Choose how many outliers.'
    ]);
    expect(readForm({ ...BUILDER_DEFAULTS, seed: '-3' }).problems).toEqual([
      'The seed must be a whole number, or left empty.'
    ]);
    expect(readForm(null).args).toBeNull();
  });
});

describe('what R returned', () => {
  const answer = {
    study_id: 'BUILT-001',
    snapshot_date: '2012-09-30',
    snapshots: 9,
    seconds: 2.1,
    simulator: '2.1.0',
    files: [
      { name: 'Raw_SUBJ.csv', rows: 150, text: 'studyid,subjid\nA,1\n' },
      { name: 'Raw_AE.csv', rows: 450, text: 'studyid,subjid\nA,1\n' }
    ]
  };

  it('is read as files the app can load', () => {
    expect(builtFiles(answer)).toEqual([
      { name: 'Raw_SUBJ.csv', rows: 150, text: 'studyid,subjid\nA,1\n' },
      { name: 'Raw_AE.csv', rows: 450, text: 'studyid,subjid\nA,1\n' }
    ]);
  });

  it('reads the standard domains’ files by their own key', () => {
    const standard = [{ name: 'adsl.csv', rows: 1, text: 'USUBJID\nS1\n' }];
    expect(builtFiles({ ...answer, standard }, 'standard')).toEqual(standard);
    expect(builtFiles(answer, 'standard')).toBeNull();
  });

  it('is not read when a file has no name or no text, or there are none', () => {
    expect(builtFiles(null)).toBeNull();
    expect(builtFiles({ files: [] })).toBeNull();
    expect(builtFiles({ files: [{ name: 'Raw_AE.csv', text: '' }] })).toBeNull();
    expect(builtFiles({ files: [{ name: '', text: 'a\n' }] })).toBeNull();
  });

  it('is said in one sentence that names the study, its size and its maker', () => {
    expect(builtSaid(answer, readForm(BUILDER_DEFAULTS).args)).toBe(
      'BUILT-001 is a simulated Phase 2 Oncology study: 150 participants at 20 sites over ' +
        '9 months, made by gsm.datasim 2.1.0 in this browser in 2.1 seconds. Every row is synthetic.'
    );
  });
});

describe('what the tab says', () => {
  it('says what the first build downloads and from where', () => {
    expect(
      downloadsSaid([
        { what: 'R itself', host: 'webr.r-wasm.org', megabytes: 13 },
        { what: 'its packages', host: 'repo.r-wasm.org', megabytes: 40 },
        { what: 'gsm’s packages', host: null, megabytes: 2 }
      ])
    ).toBe(
      'The first build starts R in this browser and downloads about 55 MB from webr.r-wasm.org ' +
        'and repo.r-wasm.org. Later builds reuse it. The study is made here and is sent nowhere.'
    );
    expect(downloadsSaid([])).toBe('');
  });

  it('says the study is synthetic and that phase and area are labels', () => {
    expect(BUILDER_CAVEATS.join(' ')).toMatch(/synthetic/);
    expect(BUILDER_CAVEATS.join(' ')).toMatch(/Phase and therapeutic area are labels/);
    expect(BUILDER_CAVEATS.join(' ')).toMatch(/makes no lab results/);
    expect(BUILDER_CAVEATS.join(' ')).toMatch(/placeholders/);
  });
});

describe('the page and R agree', () => {
  it('on the tab’s address', () => {
    expect(PAGE_TAB_ID).toBe(BUILDER_TAB_ID);
    const config = JSON.parse(readFileSync(path.join(root, 'site/config.json'), 'utf8'));
    expect(config.appTabs.map((tab) => tab.id)).toContain(BUILDER_TAB_ID);
  });

  it('on the limits of each number', () => {
    for (const [field, { min, max }] of Object.entries(BUILDER_LIMITS)) {
      expect(builderR, field).toMatch(new RegExp(`${field} = c\\(${min}L, ${max}L\\)`));
    }
  });

  it('on the outlier dial: every setting is within what R accepts', () => {
    const [, low, high] = builderR.match(/outlier_intensity = c\(([\d.]+), ([\d.]+)\)/);
    for (const entry of BUILDER_OUTLIERS) {
      expect(entry.intensity).toBeGreaterThanOrEqual(Number(low));
      expect(entry.intensity).toBeLessThanOrEqual(Number(high));
    }
  });

  it('on the therapeutic areas gsm.datasim names', () => {
    const study = readFileSync(path.join(root, GSM_DATASIM.directory, 'R/Raw_STUDY.R'), 'utf8');
    for (const area of BUILDER_AREAS) expect(study).toContain(`"${area}"`);
    for (const phase of BUILDER_PHASES) expect(study).toContain(`"${phase.id}"`);
  });

  it('on the function R is asked to call and the packages it attaches', () => {
    expect(builderR).toMatch(new RegExp(`^${BUILDER.call} <- function\\(`, 'm'));
    const [, listed] = builderR.match(/builder_packages <- c\(([^)]*)\)/);
    const attached = [...listed.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect([...BUILDER.packages].sort()).toEqual(attached.sort());
  });
});

describe('what R is given', () => {
  it('is the builder’s R first, then every gsm.datasim file R reads, each in the repository', () => {
    const files = builderFiles();
    expect(files[0]).toEqual({ file: BUILDER.source, path: '/builder/builder.R' });
    expect(files.filter((entry) => /\/R\/[^/]+\.R$/.test(entry.path)).length).toBe(41);
    expect(files.map((entry) => entry.path)).toContain('/builder/gsm.datasim/inst/template.csv');
    expect(files.map((entry) => entry.path)).toContain('/builder/gsm.datasim/DESCRIPTION');
    expect(files.at(-1).path).toBe('/builder/gsm.mapping/VS.yaml');
    for (const entry of files)
      expect(existsSync(path.join(root, entry.file)), entry.file).toBe(true);
  });

  it('is served beside the app, with gsm’s packages from the page’s own address first', () => {
    const options = builderTabOptions();
    expect(options.r.files[0]).toEqual({ path: '/builder/builder.R', url: './builder/builder.R' });
    expect(options.r.source).toEqual(['/builder/builder.R']);
    expect(options.r.repos).toEqual(['./r-wasm', 'https://repo.r-wasm.org']);
    expect(options.r.call).toBe('builder_run');
    expect(options.r.simulator).toBe('/builder/gsm.datasim');
    expect(options.r.vitals).toBe('/builder/gsm.mapping/VS.yaml');
    expect(options.open).toBe('rbqm');
  });

  it('is a view the page mounts with the app’s own connection, or a sentence where R cannot start', () => {
    expect(builderTabExpression()).toMatch(
      /^\{ name: 'gsm\.datasim', view: SafetyVizApp\.builderTab\(\{ createConnection: SafetyVizApp\.createRConnection, /
    );
    expect(builderTabExpression({ r: 'unavailable' })).toContain(
      '"unavailable":"Building a study needs R'
    );
  });
});

describe('the copy of the vital signs spec', () => {
  it('matches its record, and names the raw vital signs table the generator is given', () => {
    const directory = path.join(root, GSM_MAPPING_VITALS.directory);
    expect(verifyVendored(directory)).toEqual([]);
    expect(readRecord(directory).tag).toBe(GSM_MAPPING_VITALS.tag);
    const text = readFileSync(path.join(directory, GSM_MAPPING_VITALS.files[0].file), 'utf8');
    expect(text).toMatch(/^ {2}Raw_VS:$/m);
    // Every vital sign the builder names a unit for is a column of the spec.
    const [, listed] = builderR.match(/builder_vital_signs <- list\(([\s\S]*?)\n\)/);
    for (const [, column] of listed.matchAll(/^ {2}(\w+) = c\(/gm)) {
      expect(text, column).toMatch(new RegExp(`^ {4}${column}:$`, 'm'));
    }
  });
});

describe('the copy of gsm.datasim', () => {
  it('matches its record, which names the release tag it was copied from', () => {
    const directory = path.join(root, GSM_DATASIM.directory);
    expect(verifyVendored(directory)).toEqual([]);
    const record = readRecord(directory);
    expect(record.tag).toBe(GSM_DATASIM.tag);
    expect(record.version).toBe(GSM_DATASIM.tag.replace(/^v/, ''));
    expect(record.files.map((entry) => entry.file).sort()).toEqual(
      GSM_DATASIM.files.map((entry) => entry.file).sort()
    );
  });
});
