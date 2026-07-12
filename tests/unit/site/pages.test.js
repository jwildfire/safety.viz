import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  renderAboutPage,
  renderArchitecturePage,
  renderShell
} from '../../../scripts/site-lib.mjs';

// Site pages added for v1.0 (#21): the About page (keynote/project story +
// lineage credits) and the Architecture technical overview, plus the shell's
// version/description tokens they ship inside.

const parsedConfig = JSON.parse(
  readFileSync(new URL('../../../site/config.json', import.meta.url), 'utf8')
);

const ORIGINAL_REPOS = [
  'safety-histogram',
  'safety-outlier-explorer',
  'safety-results-over-time',
  'safety-shift-plot',
  'safety-delta-delta',
  'paneled-outlier-explorer',
  'aeexplorer',
  'ae-timelines',
  'web-codebook'
];

describe('site generator: about page (#21)', () => {
  const html = renderAboutPage(parsedConfig);

  it('tells the keynote / developer-diary story and links the roadmap hub (#21)', () => {
    expect(html).toContain('R/Pharma 2026');
    expect(html).toContain('https://jwildfire.github.io/obot.roadmap/');
  });

  it('carries the OpenRBQM mirror and audience framing moved off the homepage (#29)', () => {
    expect(html).toContain('gsm.kri');
    expect(html).toContain('medical monitor');
  });

  it('credits the safetyGraphics project and every original RhoInc renderer (#21)', () => {
    expect(html).toContain('safetyGraphics');
    for (const repo of ORIGINAL_REPOS) {
      expect(html).toContain(`https://github.com/RhoInc/${repo}`);
    }
  });

  it('describes each original renderer alongside its credit link (#21)', () => {
    expect(html).toContain('renderer-credits');
    // One row per renderer in config, each carrying its blurb.
    for (const renderer of parsedConfig.renderers) {
      expect(html).toContain(renderer.blurb.slice(0, 40));
    }
  });
});

describe('site generator: architecture page (#21)', () => {
  const html = renderArchitecturePage({ config: parsedConfig, version: '9.9.9' });

  it('walks the pipeline from data contract to R htmlwidget (#21)', () => {
    expect(html).toContain('pipeline');
    expect(html).toContain('JSON Schema');
    expect(html).toContain('gsm.safety');
  });

  it('explains the shared shell and module anatomy (#21)', () => {
    expect(html).toContain('shell.js');
    expect(html).toContain('sv-');
    expect(html).toContain('destroy');
  });

  it('names the committed bundle for the running version (#21)', () => {
    expect(html).toContain('safety.viz-9.9.9');
  });
});

describe('site generator: shell tokens (#21)', () => {
  const shell =
    '<title>{{title}}</title><meta name="description" content="{{description}}" />' +
    '<span>v{{version}}</span><a href="{{root}}index.html">home</a><main>{{content}}</main>';

  it('replaces version and description tokens across the shell (#21)', () => {
    const html = renderShell({
      shell,
      title: 'T',
      content: 'C',
      root: '../',
      version: '1.2.3',
      description: 'A "described" page'
    });
    expect(html).toContain('v1.2.3');
    expect(html).toContain('content="A &quot;described&quot; page"');
    expect(html).toContain('href="../index.html"');
    expect(html).not.toContain('{{');
  });

  it('falls back to an empty description when none is given (#21)', () => {
    const html = renderShell({ shell, title: 'T', content: 'C' });
    expect(html).not.toContain('{{');
  });
});
