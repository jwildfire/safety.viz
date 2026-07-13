// Docs-site build (#7, design #21): assembles _site/ from site/ (shell,
// stylesheet, config, demo scripts) plus the committed artifacts — coverage
// tables, evidence sets, dist/ bundles — and the _api data artifact
// (scripts/api/build-api-data.mjs; `npm run site` chains both). The build is
// a pure function of the repo tree: no test execution, no network.
//
// Fails on broken internal links or referenced-but-missing screenshots, so a
// bad site can never publish (the same validation gates CI).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCoverage,
  renderAboutPage,
  renderApiPage,
  renderArchitecturePage,
  renderDemoPage,
  renderEvidencePage,
  renderGallery,
  renderShell,
  validateEvidenceScreenshots,
  validateSiteLinks
} from './site-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(rootDir, '_site');
const { version } = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const config = JSON.parse(readFileSync(path.join(rootDir, 'site/config.json'), 'utf8'));
const shell = readFileSync(path.join(rootDir, 'site/shell.html'), 'utf8');

const errors = [];
const page = (file, title, content, root, description = '') =>
  writeFileSync(file, renderShell({ shell, title, content, root, version, description }));

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });
copyFileSync(path.join(rootDir, 'site/site.css'), path.join(siteDir, 'site.css'));

// Dedicated site assets (gallery hero images etc.), when present.
const assetsDir = path.join(rootDir, 'site/assets');
if (existsSync(assetsDir)) {
  mkdirSync(path.join(siteDir, 'assets'), { recursive: true });
  for (const file of readdirSync(assetsDir)) {
    copyFileSync(path.join(assetsDir, file), path.join(siteDir, 'assets', file));
  }
}

// Homepage gallery.
page(
  path.join(siteDir, 'index.html'),
  'safety.viz — clinical safety graphics',
  renderGallery(config),
  '',
  'Nine classic clinical-safety graphics from the safetyGraphics ecosystem, rebuilt on ' +
    'Chart.js with live demos, requirement-traced test evidence, and generated API references.'
);

// About + architecture (#21): the project story and the technical overview.
page(
  path.join(siteDir, 'about.html'),
  'About · safety.viz',
  renderAboutPage(config),
  '',
  'The story behind safety.viz: the R/Pharma 2026 agentic build, the safetyGraphics ' +
    'lineage, and credits for the original Rho, Inc. renderers.'
);
page(
  path.join(siteDir, 'architecture.html'),
  'Architecture · safety.viz',
  renderArchitecturePage({ config, version }),
  '',
  'How safety.viz works: JSON-Schema data contracts, the shared renderer shell, ' +
    'committed versioned bundles, and the gsm.safety R bindings.'
);

// Shared dist bundle for the demo pages (IIFE + source map).
const distDir = path.join(rootDir, `dist/safety.viz-${version}`);
const siteDistDir = path.join(siteDir, `dist/safety.viz-${version}`);
mkdirSync(siteDistDir, { recursive: true });
for (const file of ['safety.viz.js', 'safety.viz.js.map']) {
  copyFileSync(path.join(distDir, file), path.join(siteDistDir, file));
}

for (const renderer of config.renderers.filter((entry) => entry.status === 'available')) {
  const module = renderer.module;
  const moduleDir = path.join(siteDir, module);
  mkdirSync(path.join(moduleDir, 'evidence'), { recursive: true });

  // Committed evidence set → screenshots + evidence.json join input.
  const evidenceDir = path.join(rootDir, 'docs/evidence', module);
  const evidence = JSON.parse(readFileSync(path.join(evidenceDir, 'evidence.json'), 'utf8'));
  errors.push(...validateEvidenceScreenshots(evidence, evidenceDir));
  for (const file of readdirSync(evidenceDir).filter((entry) => entry.endsWith('.png'))) {
    copyFileSync(path.join(evidenceDir, file), path.join(moduleDir, 'evidence', file));
  }

  // Live demo: shell + intro around the demo mount, against the vendored
  // real example data (#15) — not the crafted e2e fixture. Modules with a
  // different data domain name their dataset via the config entry's `data`
  // key (#26); the shared lab/vitals adbds.csv stays the default.
  const dataFile = renderer.data || 'adbds.csv';
  copyFileSync(path.join(rootDir, `site/data/${dataFile}`), path.join(moduleDir, dataFile));
  copyFileSync(path.join(rootDir, `site/demo/${module}.js`), path.join(moduleDir, 'demo.js'));
  page(
    path.join(moduleDir, 'index.html'),
    `${renderer.title} demo · safety.viz`,
    renderDemoPage({ renderer, version }),
    '../',
    `Live ${renderer.title} demo: ${renderer.blurb}`
  );

  // Test evidence: coverage table joined with evidence.json.
  const coverage = parseCoverage(
    readFileSync(path.join(rootDir, `docs/${module}-coverage.md`), 'utf8')
  );
  page(
    path.join(moduleDir, 'evidence.html'),
    `${renderer.title} test evidence · safety.viz`,
    renderEvidencePage({ module, config, coverage, evidence }),
    '../',
    `Requirement-traced qualification evidence for the safety.viz ${module} module: ` +
      'scope, environment, results, and captured screenshots.'
  );

  // API reference from the generated data artifact.
  const apiFile = path.join(rootDir, '_api', `${module}.json`);
  if (!existsSync(apiFile)) {
    errors.push(`missing ${path.relative(rootDir, apiFile)} — run \`npm run docs:api\` first`);
    continue;
  }
  page(
    path.join(moduleDir, 'api.html'),
    `${renderer.title} API reference · safety.viz`,
    renderApiPage(JSON.parse(readFileSync(apiFile, 'utf8'))),
    '../',
    `Generated API reference for the safety.viz ${module} module: factory, lifecycle ` +
      'methods, settings, and the JSON-Schema data contract.'
  );
}

errors.push(...validateSiteLinks(siteDir));

if (errors.length) {
  console.error('✗ Site build failed validation:');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const available = config.renderers.filter((entry) => entry.status === 'available').length;
console.log(
  `✓ Built _site/ — gallery of ${config.renderers.length} renderers, ` +
    `${available} with demo/evidence/API pages, all internal links verified.`
);
