// Demo app bundle entry (#150, obot.roadmap#352). The app is its own bundle —
// the charts plus the page that hosts them — so the chart library's bundle,
// which the gsm.safety widgets vendor, does not carry it. Built by
// scripts/build-app.mjs into a global `SafetyVizApp`; not committed.

import charts from '../main.js';
import { mountApp } from './page.js';

/* global __SAFETY_VIZ_VERSION__ */

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
 * @param {Object} [options] Mount options; see {@link mountApp}. `demo: { base }` loads the demo study from that path; `links` overrides where the footer's links go.
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

export { charts };
