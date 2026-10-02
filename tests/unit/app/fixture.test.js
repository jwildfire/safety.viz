import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The renamed-column study the browser tests load is generated, never edited by
// hand: a hand-edited fixture would test the edit, not the app.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const committedDir = path.join(rootDir, 'tests/e2e/fixtures/app');

describe('portfolio app: the renamed-column study', () => {
  it('APP-LOAD-016: scripts/build-app-fixture.mjs reproduces the committed files byte for byte (#151)', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'safety-viz-app-fixture-'));
    try {
      execFileSync('node', ['scripts/build-app-fixture.mjs', '--out-dir', outDir], {
        cwd: rootDir
      });
      const committed = readdirSync(committedDir).sort();
      expect(readdirSync(outDir).sort()).toEqual(committed);
      expect(committed).toEqual([
        'ae.csv',
        'dm.csv',
        'ecg.json',
        'labs_final.csv',
        'site_notes.csv'
      ]);
      for (const file of committed) {
        expect(
          readFileSync(path.join(outDir, file)).equals(readFileSync(path.join(committedDir, file))),
          `${file} differs from the generator's output`
        ).toBe(true);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
