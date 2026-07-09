import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
export const distDirFor = (version) => path.join(rootDir, 'dist', `safety.viz-${version}`);

// Emits the two bundles the design settles on: an IIFE build (global `SafetyViz`,
// doubles as the UMD-style asset widgets load via <script>) and an ESM build.
export async function buildAll(outDir) {
  mkdirSync(outDir, { recursive: true });

  const common = {
    entryPoints: [path.join(rootDir, 'src/main.js')],
    bundle: true,
    sourcemap: true,
    absWorkingDir: rootDir
  };

  await build({
    ...common,
    format: 'iife',
    globalName: 'SafetyViz',
    outfile: path.join(outDir, 'safety.viz.js')
  });

  await build({
    ...common,
    format: 'esm',
    outfile: path.join(outDir, 'safety.viz.esm.js')
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = distDirFor(pkg.version);
  await buildAll(outDir);
  console.log(`Built safety.viz ${pkg.version} to ${path.relative(rootDir, outDir)}/`);
}
