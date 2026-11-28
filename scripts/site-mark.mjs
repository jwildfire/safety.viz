// The safety.viz mark (#270, #436): the seven-hex mark the docs site serves as
// its favicon and the demo app's header carries. It lives here, outside src/,
// so the chart bundle does not carry it; the docs site's generators
// (site-lib.mjs) and the demo app (src/app/styles.js) both import it from here.

/** The seven-hex mark: a graphite centre and six hues of the spectrum. */
export const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<polygon points="50.0,33.3 64.4,41.7 64.4,58.3 50.0,66.7 35.6,58.3 35.6,41.7" fill="#1f2328"/>' +
  '<polygon points="82.1,33.3 96.5,41.7 96.5,58.3 82.1,66.7 67.6,58.3 67.6,41.7" fill="#d87972"/>' +
  '<polygon points="66.0,61.1 80.5,69.4 80.5,86.1 66.0,94.4 51.6,86.1 51.6,69.4" fill="#c78a3b"/>' +
  '<polygon points="34.0,61.1 48.4,69.4 48.4,86.1 34.0,94.4 19.5,86.1 19.5,69.4" fill="#77a95b"/>' +
  '<polygon points="17.9,33.3 32.4,41.7 32.4,58.3 17.9,66.7 3.5,58.3 3.5,41.7" fill="#00afa9"/>' +
  '<polygon points="34.0,5.6 48.4,13.9 48.4,30.6 34.0,38.9 19.5,30.6 19.5,13.9" fill="#519fdd"/>' +
  '<polygon points="66.0,5.6 80.5,13.9 80.5,30.6 66.0,38.9 51.6,30.6 51.6,13.9" fill="#988bdd"/>' +
  '</svg>';

/**
 * The mark as an address a page can use for its favicon (#270): the docs site
 * and the demo app's page both do, so one tab's icon says both are safety.viz.
 */
export const LOGO_HREF = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG).replace(/'/g, '%27')}`;
