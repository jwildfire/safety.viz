// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chartStatus, renderShell } from '../../../src/shell.js';
import CHART_TIERS from '../../../src/data/chart-tiers.js';
import { chartsBelow, chartTiersText, CHART_TIERS_FILE } from '../../../scripts/tiers.mjs';

// A chart's own status label (#274, obot.roadmap#403; it replaced the two
// status banners of #97 and #165). A chart that stands below Exploratory says
// so wherever it is drawn, so the status travels with the chart into a docs
// page or a downstream embed; a host that shows the label itself tells the
// chart, and the chart draws none. Shared-scaffold test, so its records route
// to shared-scaffold evidence.

// jsdom replaces the global URL, so the path is built with node:path.
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const config = JSON.parse(readFileSync(path.join(rootDir, 'site/config.json'), 'utf8'));
const BELOW = [
  'hep-waterfall',
  'participant-profile',
  'nep-explorer',
  'time-to-event',
  'qt-explorer',
  'patient-journey-explorer'
];

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="chart"></div>';
});

describe('shell: a chart’s own status label', () => {
  it('APP-TIER-017: the charts read their rung from a file written from the site’s configuration, which names the six charts below Exploratory with their reasons, and the file on disk is the one the script would write (#274)', async () => {
    expect(Object.keys(CHART_TIERS)).toEqual(BELOW);
    expect(CHART_TIERS).toEqual(chartsBelow(config));
    for (const module of BELOW) {
      const renderer = config.renderers.find((entry) => entry.module === module);
      expect(CHART_TIERS[module].tier, module).toBe(renderer.tier);
      expect(CHART_TIERS[module].title, module).toBe(renderer.title);
      expect(CHART_TIERS[module].note, module).toBe(renderer.tierNote);
    }
    expect(CHART_TIERS['patient-journey-explorer'].tier).toBe('prototype');
    // Stale after an edit to site/config.json until `npm run tiers` is run.
    expect(readFileSync(path.join(rootDir, CHART_TIERS_FILE), 'utf8')).toBe(
      await chartTiersText(config)
    );
  });

  it('APP-TIER-018: a chart below Exploratory drawn with no host around it shows its status label at the top of its main column, with its name, its reason and its rung marked; an Exploratory chart shows none (#274)', () => {
    const element = document.querySelector('#chart');
    const slots = renderShell(element, {
      moduleClass: 'safety-time-to-event',
      module: 'time-to-event'
    });
    const row = slots.main.firstElementChild;
    expect(row.className).toBe('sv-status-row');
    const pill = row.querySelector('.sv-status-label');
    expect(pill.dataset.tier).toBe('experimental');
    expect(pill.querySelector('.sv-status-word').textContent).toBe('Experimental');
    expect(pill.querySelector('.sv-status-tip').textContent).toBe(
      'Experimental until an external clinical review confirms its Kaplan–Meier estimates.'
    );
    const panel = row.querySelector('.sv-status-panel');
    expect(panel.querySelector('[role="heading"]').textContent).toBe(
      'Time-to-Event Explorer is experimental'
    );
    expect(panel.querySelector('[role="paragraph"]').textContent).toBe(
      'Experimental until an external clinical review confirms its Kaplan–Meier estimates.'
    );
    expect(panel.querySelector('.sv-status-here').dataset.tier).toBe('experimental');
    expect([...panel.querySelectorAll('.sv-status-mark')].map((mark) => mark.textContent)).toEqual([
      'This chart'
    ]);
    // Drawn alone there is no app to speak of.
    expect(panel.textContent).not.toContain('This app');
    expect(panel.textContent).toContain(
      'An early look, on the docs site only. Not in the demo app.'
    );
    pill.click();
    expect(panel.hidden).toBe(false);
    // Each of the six says its own.
    for (const module of BELOW) {
      const label = chartStatus(element, module);
      expect(label.querySelector('.sv-status-label').dataset.tier, module).toBe(
        CHART_TIERS[module].tier
      );
      expect(label.querySelector('[role="heading"]').textContent, module).toBe(
        `${CHART_TIERS[module].title} is ${CHART_TIERS[module].tier}`
      );
    }
    // The prototype has no reason sentence: its hover line says what the rung means.
    expect(
      chartStatus(element, 'patient-journey-explorer').querySelector('.sv-status-tip').textContent
    ).toBe('An early look, on the docs site only. Not in the demo app.');
    // An Exploratory chart, and a shell told nothing of its module, show none.
    expect(chartStatus(element, 'histogram')).toBeNull();
    expect(chartStatus(element, '')).toBeNull();
    expect(chartStatus(element, 'toString')).toBeNull();
    for (const options of [{ moduleClass: 'safety-histogram', module: 'histogram' }, {}]) {
      const plain = renderShell(element, options);
      expect(plain.root.querySelector('.sv-status')).toBeNull();
      expect(plain.main.firstElementChild.className).toBe('sv-notes');
    }
    // No chart draws a status banner inside itself.
    renderShell(element, { module: 'hep-waterfall' });
    expect(element.querySelector('.sv-experimental, .sv-prototype')).toBeNull();
    expect(element.querySelectorAll('.sv-status')).toHaveLength(1);
  });

  it('APP-TIER-019: a host that shows the label itself says so on the chart’s element or on anything around it, and the chart draws none (#274)', () => {
    document.body.innerHTML =
      '<div data-sv-status-host><div><div id="inside"></div></div></div><div id="own" data-sv-status-host></div><div id="alone"></div>';
    for (const id of ['inside', 'own']) {
      const element = document.querySelector(`#${id}`);
      expect(chartStatus(element, 'time-to-event'), id).toBeNull();
      const slots = renderShell(element, { module: 'time-to-event' });
      expect(slots.root.querySelector('.sv-status'), id).toBeNull();
    }
    const alone = renderShell(document.querySelector('#alone'), { module: 'time-to-event' });
    expect(alone.root.querySelectorAll('.sv-status')).toHaveLength(1);
  });
});
