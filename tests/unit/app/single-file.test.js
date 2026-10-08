import { describe, it, expect } from 'vitest';
import { renderAppHtml } from '../../../scripts/build-app.mjs';

// The single-file build (#152): the app bundle inlined into one HTML file that
// opens from disk with no network. The app draws its own header, so the wrapper
// is a bare document. These tests pin it; the browser test opens the real file
// offline.

describe('demo app: the single file', () => {
  const html = renderAppHtml({ script: 'window.SafetyVizApp={mount(){}};' });

  it('APP-FILE-001: the script is inlined and the app mounted with no demo study (#152)', () => {
    expect(html).toContain('<script>window.SafetyVizApp={mount(){}};</script>');
    expect(html).toContain("window.__safetyVizApp = SafetyVizApp.mount('#app');");
    expect(html).not.toContain('demo:');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('APP-FILE-002: nothing in the file points at another URL: no script source, stylesheet, image, font or source map (#152)', () => {
    const withMap = renderAppHtml({
      script: 'var a=1;\n//# sourceMappingURL=safety.viz-app.js.map\n'
    });
    for (const page of [html, withMap]) {
      expect(page).not.toMatch(/<script[^>]*\ssrc=/i);
      expect(page).not.toMatch(/<link\b/i);
      expect(page).not.toMatch(/<img\b/i);
      expect(page).not.toMatch(/@import|url\(/i);
      expect(page).not.toContain('sourceMappingURL');
    }
  });

  it('APP-FILE-003: a closing script tag inside the bundle cannot end the inline script early (#152)', () => {
    const tricky = renderAppHtml({ script: 'var s="</script><p>oops";' });
    expect(tricky).toContain('var s="<\\/script><p>oops";');
    expect(tricky.match(/<\/script>/g)).toHaveLength(2);
  });

  it('APP-PAGE-031: given each chart’s pages, the file hands them to the app when it mounts; a less-than sign in an address cannot end the inline script, and the file still loads nothing (#246)', () => {
    const chartLinks = {
      histogram: { evidence: 'https://jwildfire.github.io/safety.viz/histogram/evidence.html' },
      odd: { evidence: '</script><p>oops' }
    };
    const withLinks = renderAppHtml({ script: 'window.SafetyVizApp={mount(){}};', chartLinks });
    const [, written] = withLinks.match(
      /SafetyVizApp\.mount\('#app', \{ chartLinks: (.*) \}\);<\/script>/
    );
    expect(JSON.parse(written)).toEqual(chartLinks);
    expect(withLinks.match(/<\/script>/g)).toHaveLength(2);
    expect(withLinks).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(withLinks).not.toMatch(/<link\b|<img\b|@import|url\(/i);
    // Given none, the file is as it was.
    expect(renderAppHtml({ script: 'window.SafetyVizApp={mount(){}};', chartLinks: {} })).toBe(
      html
    );
  });

  it('APP-FILE-004: the document is titled and described, and leaves the page to the app (#152)', () => {
    expect(html).toContain('<title>safety.viz demo</title>');
    expect(html).toMatch(/<meta name="description" content="[^"]*nothing is sent anywhere[^"]*">/);
    // No header of its own: the app's rail carries the wordmark and the version.
    expect(html).not.toMatch(/<h1|<header/);
    expect(html).toContain('<div id="app"></div>');
  });
});
