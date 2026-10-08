// Demo app bundle entry (#150, obot.roadmap#352). The app is its own bundle —
// the charts plus the page that hosts them — so the chart library's bundle,
// which the gsm.safety widgets vendor, does not carry it. Built by
// scripts/build-app.mjs into a global `SafetyVizApp`; not committed.

import charts from '../main.js';
import * as bundle from '../main.js';
import { mountApp } from './page.js';
import { DEMO_STUDIES } from './studies.js';

/* global __SAFETY_VIZ_VERSION__ */

// The app carries safety.viz's charts, so a page that loads only the app has
// no `SafetyViz` of its own; a second chart library built from safety.viz's kit
// (#182) looks for `SafetyViz.kit` on the page. The app bundle therefore makes
// the bundle it carries reachable there, as the script-tag bundle does, unless
// the page already loaded safety.viz itself.
if (typeof globalThis !== 'undefined' && !globalThis.SafetyViz) globalThis.SafetyViz = bundle;

const SITE = 'https://jwildfire.github.io/safety.viz/';

/**
 * Where the footer's links go when the host page does not say: the published
 * site. The single-file build keeps these, since it has no site around it.
 */
export const DEFAULT_LINKS = {
  docs: SITE,
  domains: `${SITE}domains/`,
  github: 'https://github.com/jwildfire/safety.viz'
};

/**
 * Mount the demo app with the bundled charts and manifest.
 * @param {string|Element} target The element, or a selector for it, to mount into.
 * @param {Object} [options] Mount options; see {@link mountApp}. `demo: { base }` serves the demo studies from that path and loads the first; `links` overrides where the footer's links go; `libraries: [{ name, charts, manifest }]` lists further chart libraries' charts beside safety.viz's (#181).
 * @returns {Object} The app handle.
 */
export function mount(target, options = {}) {
  return mountApp(target, {
    charts,
    manifest: charts.portfolio,
    version: typeof __SAFETY_VIZ_VERSION__ === 'string' ? __SAFETY_VIZ_VERSION__ : '',
    ...options,
    links: { ...DEFAULT_LINKS, ...(options.links || {}) }
  });
}

export { charts, DEMO_STUDIES };

// R on request for a second library's charts (#183): the page that mounts the
// app makes the connection settings and the control with these and passes them
// in the library's entry.
export { rOnRequest, rUnavailable } from './r-on-request.js';
// The RBQM tab (#235): a view a library brings, and the connection to R in the
// browser it starts when the reader asks. The page that mounts the app says
// where R's files and gsm.viz's bundle are served from.
export { rbqmTab } from './rbqm-view.js';
export { createConnection as createRConnection } from './r-browser.js';
