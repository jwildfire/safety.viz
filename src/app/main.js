// Portfolio app bundle entry (#150, obot.roadmap#352). The app is its own
// bundle — the charts plus the page that hosts them — so the chart library's
// bundle, which the gsm.safety widgets vendor, does not carry it. Built by
// scripts/build-app.mjs into a global `SafetyVizApp`; not committed.

import charts from '../main.js';
import { mountApp } from './page.js';

/**
 * Mount the portfolio app with the bundled charts and manifest.
 * @param {string|Element} target The element, or a selector for it, to mount into.
 * @param {Object} [options] Mount options; see {@link mountApp}. `demo: { base }` loads the demo study from that path.
 * @returns {Object} The app handle.
 */
export function mount(target, options = {}) {
  return mountApp(target, { charts, manifest: charts.portfolio, ...options });
}

export { charts };
