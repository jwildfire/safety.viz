// Capture gallery hero screenshots (#29): for each available renderer, load
// its built demo page from _site/ and screenshot the rendered chart at 2x into
// site/assets/<module>-hero.png — the image the homepage card leads with (the
// heroAsset hook from #21). Run `npm run site` first; then `node
// scripts/capture-heroes.mjs [module ...]` (no args = every available module).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const siteDir = path.join(rootDir, '_site');
const assetsDir = path.join(rootDir, 'site', 'assets');

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

async function serveSite() {
  const server = createServer(async (req, res) => {
    try {
      let file = path.join(siteDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

const config = JSON.parse(await readFile(path.join(rootDir, 'site', 'config.json'), 'utf8'));
const requested = process.argv.slice(2);
const modules = config.renderers
  .filter((renderer) => renderer.status === 'available')
  .map((renderer) => renderer.module)
  .filter((module) => !requested.length || requested.includes(module));

const { server, port } = await serveSite();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1240, height: 900 },
  deviceScaleFactor: 2
});

for (const module of modules) {
  await page.goto(`http://127.0.0.1:${port}/${module}/index.html`);
  // Chart renderers surface a canvas; table-first renderers (ae-explorer,
  // #60) surface a table in the same main-column slot.
  const canvas = page
    .locator('#container canvas:visible, #container .sv-main table:visible')
    .first();
  await canvas.waitFor({ state: 'visible' });
  // Charts animate in and some demos fetch CSV first; settle before shooting.
  await page.waitForTimeout(1200);
  const out = path.join(assetsDir, `${module}-hero.png`);
  // Tall canvases (ae-timelines: one row per participant) crop to a top slice
  // at the card's rough aspect so the hero stays a chart, not a sliver.
  const box = await canvas.boundingBox();
  const maxHeight = box.width / 2.08;
  if (box.height > maxHeight) {
    await page.screenshot({
      path: out,
      clip: { x: box.x, y: box.y, width: box.width, height: maxHeight }
    });
  } else {
    await canvas.screenshot({ path: out });
  }
  console.log(`✓ ${path.relative(rootDir, out)}`);
}

await browser.close();
server.close();
