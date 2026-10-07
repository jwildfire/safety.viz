import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../../scripts/vendor-lib.mjs';
import {
  PINS_FILE,
  RECORD_FILE,
  REPOSITORY_DIRECTORY,
  R_WASM_DIRECTORY,
  SERVED_AS,
  parsePackagesIndex,
  pinProblems,
  publishRWasm,
  readPins,
  verifyPins,
  verifyRWasm
} from '../../../scripts/r-wasm-lib.mjs';

// The gsm packages built for R in the browser (#229, obot.roadmap#373):
// gsm.core, gsm.mapping, gsm.reporting and workr, each built from a pinned
// release tag by .github/workflows/r-wasm.yml and served as a package
// repository beside the demo app. A build cannot be compared with its source
// byte for byte, so these tests hold what can be held: the files to their
// record, the record to the pins, and the pins to the repositories they name.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const realDir = path.join(root, R_WASM_DIRECTORY);
const CONTRIB = 'bin/emscripten/contrib/4.6';

const pin = (name, version, commit) => ({
  package: name,
  repository: `https://github.com/Gilead-Public/${name}`,
  tag: `v${version}`,
  commit,
  version
});
const PINS = {
  webr: '0.6.0',
  image: 'ghcr.io/r-wasm/webr:v0.6.0',
  packages: [pin('workr', '1.1.0', 'a'.repeat(40)), pin('gsm.core', '1.3.1', 'b'.repeat(40))]
};

// A folder as the build leaves one: the pins, a package and an index in the
// repository, and the record of both.
function folder({ pins = PINS, change = () => {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'r-wasm-'));
  const contrib = path.join(dir, REPOSITORY_DIRECTORY, CONTRIB);
  mkdirSync(contrib, { recursive: true });
  const pinsText = `${JSON.stringify(pins, null, 2)}\n`;
  writeFileSync(path.join(dir, PINS_FILE), pinsText);
  const describe = (file, text) => {
    writeFileSync(path.join(contrib, file), text);
    return { file, sha256: sha256(Buffer.from(text)), bytes: Buffer.byteLength(text) };
  };
  const record = {
    packages: 'gsm packages built for R in the browser',
    pins_sha256: sha256(Buffer.from(pinsText)),
    contrib: CONTRIB,
    built: pins.packages.map((entry) => ({
      ...entry,
      ...describe(`${entry.package}_${entry.version}.tgz`, `the build of ${entry.package}`)
    })),
    index: [
      describe(
        'PACKAGES',
        pins.packages
          .map((entry) => `Package: ${entry.package}\nVersion: ${entry.version}\nImports: dplyr\n`)
          .join('\n')
      )
    ]
  };
  change({ dir, contrib, record });
  writeFileSync(path.join(dir, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return { dir, contrib };
}

describe('the pins for the gsm packages built for R in the browser (#229)', () => {
  it('APP-R-028: workr, gsm.core, gsm.mapping and gsm.reporting are each pinned to a repository, a release tag, the full commit and a version (#229)', () => {
    const pins = readPins(realDir);
    expect(pinProblems(pins)).toEqual([]);
    expect(pins.packages.map((entry) => `${entry.package} ${entry.tag}`)).toEqual([
      'workr v1.1.0',
      'gsm.core v1.3.1',
      'gsm.mapping v1.1.6',
      'gsm.reporting v1.1.7'
    ]);
    // The tag is the package's version: a pin cannot name one and build another.
    for (const entry of pins.packages) expect(entry.tag).toBe(`v${entry.version}`);
  });

  it('APP-R-028: a pin a build could not be made from is refused, and why is said in words (#229)', () => {
    expect(pinProblems(PINS)).toEqual([]);
    expect(pinProblems({ ...PINS, packages: [] })).toEqual([`${PINS_FILE} pins no packages.`]);
    expect(
      pinProblems({ ...PINS, packages: [{ ...PINS.packages[0], commit: 'd19925e' }] })
    ).toEqual(['workr: its pin does not name the full 40-character commit.']);
    expect(pinProblems({ ...PINS, packages: [PINS.packages[0], PINS.packages[0]] })).toEqual([
      'workr is pinned twice.'
    ]);
    expect(
      pinProblems({ ...PINS, packages: [{ ...PINS.packages[0], repository: 'Gilead/workr' }] })
    ).toEqual(['workr: its pin does not name a GitHub repository.']);
  });
});

describe('the package repository, its record and the pins (#229)', () => {
  it('APP-R-029: the packages as committed, their record and the pins agree: every pinned package is there, built from its pinned commit at its pinned version, and nothing else is served (#229)', () => {
    expect(verifyRWasm(realDir)).toEqual([]);
  });

  it('APP-R-029: a folder as the build leaves one passes the check (#229)', () => {
    expect(verifyRWasm(folder().dir)).toEqual([]);
  });

  it('APP-R-029: the check fails when the pins change after the build (#229)', () => {
    const { dir } = folder();
    const moved = {
      ...PINS,
      packages: [PINS.packages[0], pin('gsm.core', '1.3.2', 'c'.repeat(40))]
    };
    writeFileSync(path.join(dir, PINS_FILE), `${JSON.stringify(moved, null, 2)}\n`);
    const problems = verifyRWasm(dir);
    expect(problems).toContain(
      `${RECORD_FILE} was not made from this ${PINS_FILE}: the pins have changed since the build.`
    );
    expect(problems).toContain('gsm.core: built from version 1.3.1, but its pin says 1.3.2.');
    expect(problems).toContain(
      `gsm.core: built from commit ${'b'.repeat(40)}, but its pin says ${'c'.repeat(40)}.`
    );
  });

  it('APP-R-029: the check fails when a served file is not the one that was built, or was never recorded (#229)', () => {
    const changed = folder();
    appendFileSync(path.join(changed.contrib, 'workr_1.1.0.tgz'), ' ');
    expect(verifyRWasm(changed.dir)).toEqual([
      'workr_1.1.0.tgz: the file no longer matches its recorded checksum.',
      'workr_1.1.0.tgz: 19 bytes, but 18 are recorded.'
    ]);

    const extra = folder();
    writeFileSync(path.join(extra.contrib, 'gsm.kri_1.7.0.tgz'), 'not pinned');
    expect(verifyRWasm(extra.dir)).toEqual([
      `gsm.kri_1.7.0.tgz: served, but not in ${RECORD_FILE}.`
    ]);

    const second = folder();
    mkdirSync(path.join(second.dir, REPOSITORY_DIRECTORY, 'bin/emscripten/contrib/4.5'));
    expect(verifyRWasm(second.dir)).toEqual([
      `bin/emscripten/contrib/4.5: served, but not in ${RECORD_FILE}.`
    ]);
  });

  it('APP-R-029: the check fails when a pinned package was not built, or the index lists something else (#229)', () => {
    const unbuilt = folder({
      change: ({ record }) => {
        record.built = record.built.filter((entry) => entry.package !== 'gsm.core');
      }
    });
    expect(verifyRWasm(unbuilt.dir)).toContain(
      `gsm.core: pinned, but ${RECORD_FILE} records no build of it.`
    );

    const stale = folder({
      change: ({ contrib, record }) => {
        const text = 'Package: workr\nVersion: 1.0.0\n';
        writeFileSync(path.join(contrib, 'PACKAGES'), text);
        record.index = [
          { file: 'PACKAGES', sha256: sha256(Buffer.from(text)), bytes: Buffer.byteLength(text) }
        ];
      }
    });
    expect(verifyRWasm(stale.dir)).toEqual([
      'PACKAGES lists workr 1.0.0, but the pins name gsm.core 1.3.1, workr 1.1.0.'
    ]);
  });

  it('APP-R-029: the check never passes by comparing nothing (#229)', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'r-wasm-'));
    expect(verifyRWasm(bare)).toEqual([`${PINS_FILE} is missing.`]);
    writeFileSync(path.join(bare, PINS_FILE), JSON.stringify(PINS));
    expect(verifyRWasm(bare)).toEqual([
      `${RECORD_FILE} is missing: nothing has been built from the pins.`
    ]);
    const empty = folder({
      change: ({ record }) => {
        record.built = [];
        record.index = [];
      }
    });
    expect(verifyRWasm(empty.dir)).toContain(`${RECORD_FILE} records no files.`);
  });

  it('APP-R-029: an R package index is read as one entry per package, whatever else each block holds (#229)', () => {
    expect(
      parsePackagesIndex(
        'Package: workr\nVersion: 1.1.0\nImports: dplyr,\n    glue\n\nPackage: gsm.core\nVersion: 1.3.1\n'
      )
    ).toEqual([
      { package: 'workr', version: '1.1.0' },
      { package: 'gsm.core', version: '1.3.1' }
    ]);
    expect(parsePackagesIndex('')).toEqual([]);
  });
});

describe('the pins against the repositories they name (#229)', () => {
  const description = (entry) =>
    Promise.resolve(`Package: ${entry.package}\nVersion: ${entry.version}\n`);
  const commitOfTag = (entry) => Promise.resolve(entry.commit);

  it('APP-R-030: the pins agree with the repositories they name when each tag names its pinned commit and the package gives its pinned version (#229)', async () => {
    expect(await verifyPins(PINS, { commitOfTag, description })).toEqual([]);
  });

  it('APP-R-030: the pins disagree when a tag has moved, has gone, or the package gives another version (#229)', async () => {
    expect(
      await verifyPins(PINS, {
        description,
        commitOfTag: (entry) =>
          Promise.resolve(entry.package === 'workr' ? 'f'.repeat(40) : entry.commit)
      })
    ).toEqual([
      `workr: tag v1.1.0 names commit ${'f'.repeat(40)}, but its pin says ${'a'.repeat(40)}.`
    ]);
    expect(
      await verifyPins(PINS, { description, commitOfTag: () => Promise.resolve(null) })
    ).toEqual([
      'workr: https://github.com/Gilead-Public/workr has no tag v1.1.0.',
      'gsm.core: https://github.com/Gilead-Public/gsm.core has no tag v1.3.1.'
    ]);
    expect(
      await verifyPins(PINS, {
        commitOfTag,
        description: (entry) => Promise.resolve(`Package: ${entry.package}\nVersion: 9.9.9\n`)
      })
    ).toEqual([
      "workr: the commit's DESCRIPTION gives version 9.9.9, but its pin says 1.1.0.",
      "gsm.core: the commit's DESCRIPTION gives version 9.9.9, but its pin says 1.3.1."
    ]);
  });
});

describe('the package repository beside the demo app (#229)', () => {
  it('APP-R-031: the demo app’s directory serves the packages as a package repository, as R reads one, with the record of what each file was built from (#229)', () => {
    const { dir } = folder();
    const out = mkdtempSync(path.join(tmpdir(), 'demo-'));
    publishRWasm(dir, out);
    const served = path.join(out, SERVED_AS, CONTRIB);
    expect(readFileSync(path.join(served, 'PACKAGES'), 'utf8')).toMatch(/^Package: workr$/m);
    expect(readFileSync(path.join(served, 'workr_1.1.0.tgz'), 'utf8')).toBe('the build of workr');
    const record = JSON.parse(readFileSync(path.join(out, SERVED_AS, RECORD_FILE), 'utf8'));
    expect(record.built.map((entry) => `${entry.package} ${entry.tag} ${entry.commit}`)).toEqual([
      `workr v1.1.0 ${'a'.repeat(40)}`,
      `gsm.core v1.3.1 ${'b'.repeat(40)}`
    ]);
  });

  it('APP-R-031: the directory is not built when the packages, their record and the pins disagree (#229)', () => {
    const { dir, contrib } = folder();
    appendFileSync(path.join(contrib, 'workr_1.1.0.tgz'), ' ');
    const out = mkdtempSync(path.join(tmpdir(), 'demo-'));
    expect(() => publishRWasm(dir, out)).toThrow(/no longer matches its recorded checksum/);
  });
});
