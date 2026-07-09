import { readFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildAll, rootDir, distDirFor } from './build.mjs';

const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const committedDir = distDirFor(pkg.version);
const bundleFiles = [
  'safety.viz.js',
  'safety.viz.js.map',
  'safety.viz.esm.js',
  'safety.viz.esm.js.map'
];

// Built as a sibling of dist/safety.viz-{version}/, not os.tmpdir(): esbuild's
// sourcemaps record a path to the source *relative to the output directory*, so
// comparing against a build at a different nesting depth reports drift that isn't real.
const distRoot = path.join(rootDir, 'dist');
mkdirSync(distRoot, { recursive: true });
const tmpDir = mkdtempSync(path.join(distRoot, '.drift-check-'));
let drifted = [];

try {
  await buildAll(tmpDir);

  if (!existsSync(committedDir)) {
    drifted.push(`${path.relative(rootDir, committedDir)}/ does not exist — run \`npm run build\``);
  } else {
    for (const file of bundleFiles) {
      const committedPath = path.join(committedDir, file);
      const freshPath = path.join(tmpDir, file);

      if (!existsSync(committedPath)) {
        drifted.push(`${file}: missing from committed dist/`);
        continue;
      }

      const committed = readFileSync(committedPath, 'utf8');
      const fresh = readFileSync(freshPath, 'utf8');
      if (committed !== fresh) {
        drifted.push(`${file}: committed dist/ does not match a fresh build of src/`);
      }
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (drifted.length > 0) {
  console.error('dist/ drift detected:');
  for (const line of drifted) console.error(`  - ${line}`);
  console.error('\nRun `npm run build` and commit the result.');
  process.exit(1);
}

console.log(`dist/safety.viz-${pkg.version} matches a fresh build of src/.`);
