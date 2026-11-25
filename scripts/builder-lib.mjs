// The Build a study tab (the demo app): study.builder, vendored under
// site/vendor/study.builder (scripts/vendor-lib.mjs's STUDY_BUILDER), and the
// tab's entry in the page's `libraries` option. The demo app serves the copy
// in a folder of its own beside the app: the bundle, and under it the files
// study.builder's R reads, at the paths study.builder asks for them.

import { STUDY_BUILDER } from './vendor-lib.mjs';
import { SERVED_AS } from './r-wasm-lib.mjs';

/** The folder the demo app serves study.builder in, beside the app. */
export const BUILDER_SERVED_AS = 'study.builder';

/** The tab's address in the app: its place in site/config.json's `appTabs`. */
export const BUILDER_TAB_ID = 'build';

/** What the tab says in the single file, which cannot start R. */
export const FILE_NO_BUILDER =
  'Building a study needs R, and this file loads nothing, so it cannot start R. ' +
  'The hosted demo app can start R in your browser.';

/**
 * The files the demo app serves for the tab: every vendored file but the
 * record of the copy, each with where the repository keeps it and where the
 * page serves it.
 * @returns {Array<{file: string, served: string}>} `file` is the path in the repository, `served` the path beside the app.
 */
export function builderFiles() {
  return STUDY_BUILDER.files.map((entry) => ({
    file: `${STUDY_BUILDER.directory}/${entry.file}`,
    served: `${BUILDER_SERVED_AS}/${entry.file}`
  }));
}

/**
 * The options the tab is mounted with, as plain values. The connection
 * factory is the app's own and is added by the page.
 * @param {Object} [where] Where the page serves each thing; the demo app's directory by default.
 * @param {string} [where.base] The folder study.builder is served in.
 * @param {string} [where.repository] The address of gsm's packages, as a package repository.
 * @param {?string} [where.open] The tab offered once a study is loaded.
 * @returns {Object} The options, less `createConnection`.
 */
export function builderTabOptions({
  base = `./${BUILDER_SERVED_AS}/`,
  repository = `./${SERVED_AS}`,
  open = 'rbqm'
} = {}) {
  return {
    library: { url: `${base}study.builder.js`, global: STUDY_BUILDER.global },
    base,
    repository,
    open
  };
}

/**
 * The tab's entry in the `libraries` option, as source text: a library that
 * brings a view (src/app/page.js). On a page that can start R the view is
 * given the app's own connection to R in the browser, which the RBQM tab
 * shares; in the single file it says why it cannot start R.
 * @param {{r?: 'request'|'unavailable', where?: Object}} [options]
 * @returns {string} A JavaScript object expression.
 */
export function builderTabExpression({ r = 'request', where } = {}) {
  const options =
    r === 'request'
      ? `{ createConnection: SafetyVizApp.createRConnection, ...${JSON.stringify(builderTabOptions(where))} }`
      : JSON.stringify({ unavailable: FILE_NO_BUILDER });
  return `{ name: 'study.builder', view: SafetyVizApp.builderTab(${options}) }`;
}
