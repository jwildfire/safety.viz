import { describe, it, expect } from 'vitest';
import {
  extractHeadings,
  mdBlock,
  mdInline,
  renderGuidePage,
  slugify
} from '../../../scripts/site-lib.mjs';

// Clinical-guide rendering (#52 full port): mdBlock gained standalone image
// figures and GitHub-flavored pipe tables so a guide can carry the ported
// workflow diagrams and reference tables. These additions must not disturb the
// heading / bullet / paragraph rendering the coverage docs already rely on.

describe('mdBlock: image figures', () => {
  it('renders a standalone image line as a captioned figure', () => {
    const html = mdBlock('![Step 1 workflow](guide/step-1.png "The Hy\'s Law entry decision")');
    expect(html).toContain('<figure class="guide-figure">');
    expect(html).toContain('<img src="guide/step-1.png" alt="Step 1 workflow" loading="lazy">');
    expect(html).toContain('<figcaption>The Hy&#39;s Law entry decision</figcaption>');
  });

  it('falls back to the alt text when no caption title is given', () => {
    const html = mdBlock('![eDISH quadrants](guide/edish.png)');
    expect(html).toContain('<img src="guide/edish.png" alt="eDISH quadrants"');
    expect(html).toContain('<figcaption>eDISH quadrants</figcaption>');
  });

  it('accepts a single-quoted caption (Prettier normalizes titles to single quotes)', () => {
    const html = mdBlock(
      "![Step 2a](guide/step-2a.png 'Timing coincidence, then the cholestasis screen')"
    );
    expect(html).toContain('<img src="guide/step-2a.png" alt="Step 2a"');
    expect(html).toContain(
      '<figcaption>Timing coincidence, then the cholestasis screen</figcaption>'
    );
  });

  it('treats a mid-paragraph image inline, not as a broken link', () => {
    const html = mdInline('see ![x](y.png) here');
    expect(html).toContain('<img src="y.png" alt="x">');
    expect(html).not.toContain('!<a');
  });
});

describe('mdBlock: pipe tables', () => {
  const table = [
    '| Pattern | R-Ratio |',
    '| --- | ---: |',
    '| Hepatocellular | > 5 |',
    '| Cholestatic | < 2 |'
  ].join('\n');

  it('renders a GFM pipe table inside a scroll wrapper with header and body', () => {
    const html = mdBlock(table);
    expect(html).toContain('<div class="table-scroll"><table class="guide-table">');
    expect(html).toContain('<th>Pattern</th>');
    expect(html).toContain('<td>Hepatocellular</td>');
    expect(html).toContain('<td style="text-align:right">&gt; 5</td>');
  });

  it('applies column alignment from the delimiter row', () => {
    const html = mdBlock('| a | b | c |\n| :--- | :--: | ---: |\n| 1 | 2 | 3 |');
    expect(html).toContain('<th style="text-align:left">a</th>');
    expect(html).toContain('<th style="text-align:center">b</th>');
    expect(html).toContain('<th style="text-align:right">c</th>');
  });

  it('does not mistake a bare horizontal rule for a table delimiter', () => {
    // `---` with no pipes is not a delimiter, so no table is emitted.
    const html = mdBlock('Intro paragraph.\n\n---\n\nNext paragraph.');
    expect(html).not.toContain('<table');
  });
});

describe('mdBlock: existing blocks are unchanged', () => {
  it('still renders headings, bullets, and paragraphs', () => {
    const html = mdBlock('## Heading\n\nA paragraph with [a link](x.html).\n\n- one\n- two');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<p>A paragraph with <a href="x.html">a link</a>.</p>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
  });

  it('renders a numbered list as an ordered list', () => {
    const html = mdBlock('1. first\n2. second\n3. third');
    expect(html).toContain('<ol><li>first</li><li>second</li><li>third</li></ol>');
  });
});

describe('mdBlock: heading ids and the guide TOC', () => {
  it('adds no heading ids by default (coverage docs stay unchanged)', () => {
    expect(mdBlock('## Routing status')).toContain('<h2>Routing status</h2>');
  });

  it('adds slug ids to headings when opted in', () => {
    const html = mdBlock('## Step 2a — Timing\n\n### Sub step', { headingIds: true });
    expect(html).toContain('<h2 id="step-2a-timing">');
    expect(html).toContain('<h3 id="sub-step">');
  });

  it('disambiguates repeated headings', () => {
    const html = mdBlock('## Step\n\ntext\n\n## Step', { headingIds: true });
    expect(html).toContain('<h2 id="step">');
    expect(html).toContain('<h2 id="step-2">');
  });

  it('extractHeadings ids match the ids mdBlock emits', () => {
    const md = '## First\n\n### Detail\n\n## First\n\n## Second';
    const headings = extractHeadings(md);
    const body = mdBlock(md, { headingIds: true });
    expect(headings.map((h) => h.id)).toEqual(['first', 'detail', 'first-2', 'second']);
    for (const { id } of headings) expect(body).toContain(`id="${id}"`);
  });

  it('slugify lowercases and collapses non-alphanumerics', () => {
    expect(slugify('Step 5c — Hepatocyte-loss (P_ALT)')).toBe('step-5c-hepatocyte-loss-p-alt');
  });
});

describe('renderGuidePage: composition', () => {
  const renderer = {
    module: 'hep-explorer',
    title: 'Hepatic Safety Explorer',
    matrix: 'hep-explorer.md'
  };
  const config = { matrixBaseUrl: 'https://example.test/matrix' };
  const html = renderGuidePage({
    renderer,
    config,
    guideMarkdown:
      '## What it shows\n\n![Overview](guide/edish.png)\n\n## Workflow\n\n### Step 1\n\ntext\n'
  });

  it('renders the title, non-diagnostic caution, and the guide tab', () => {
    expect(html).toContain('Hepatic Safety Explorer: clinical guide');
    expect(html).toContain('guide-caution');
    expect(html).toContain('href="guide.html"');
  });

  it('renders authored figures from the guide markdown', () => {
    expect(html).toContain('<figure class="guide-figure">');
    expect(html).toContain('src="guide/edish.png"');
  });

  it('renders a sticky TOC sidebar whose links anchor to the heading ids', () => {
    expect(html).toContain('<div class="guide-layout">');
    expect(html).toContain('<nav class="guide-toc"');
    // Top-level sections and their nested subsection, linked to matching ids.
    expect(html).toContain('<a href="#what-it-shows">What it shows</a>');
    expect(html).toContain('<a href="#workflow">Workflow</a>');
    expect(html).toContain('<a href="#step-1">Step 1</a>');
    expect(html).toContain('<h2 id="workflow">');
    expect(html).toContain('<h3 id="step-1">');
  });
});
