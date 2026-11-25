// Build a study (the demo app): study.builder, vendored under
// site/vendor/study.builder (scripts/vendor-lib.mjs's STUDY_BUILDER), and its
// entry in the page's `libraries` option, as a way to load data on the data view. The demo app serves the copy
// in a folder of its own beside the app: the bundle, and under it the files
// study.builder's R reads, at the paths study.builder asks for them.

import { STUDY_BUILDER } from './vendor-lib.mjs';
import { SERVED_AS } from './r-wasm-lib.mjs';

/** The folder the demo app serves study.builder in, beside the app. */
export const BUILDER_SERVED_AS = 'study.builder';

/** The source's id in the app. */
export const BUILDER_SOURCE_ID = 'build';

/**
 * The files the demo app serves for it: every vendored file but the
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
 * The options the source is made with, as plain values. The connection
 * factory is the app's own and is added by the page.
 * @param {Object} [where] Where the page serves each thing; the demo app's directory by default.
 * @param {string} [where.base] The folder study.builder is served in.
 * @param {string} [where.repository] The address of gsm's packages, as a package repository.
 * @returns {Object} The options, less `createConnection`.
 */
export function builderSourceOptions({
  base = `./${BUILDER_SERVED_AS}/`,
  repository = `./${SERVED_AS}`
} = {}) {
  return {
    library: { url: `${base}study.builder.js`, global: STUDY_BUILDER.global },
    base,
    repository
  };
}

/**
 * The source's entry in the `libraries` option, as source text: a library that
 * brings a way to load data (src/app/page.js). It is given the app's own
 * connection to R in the browser, which the RBQM tab shares. A page that cannot
 * start R has no such entry: there is nothing it could build.
 * @param {{where?: Object}} [options]
 * @returns {string} A JavaScript object expression.
 */
export function builderSourceExpression({ where } = {}) {
  return (
    `{ name: 'study.builder', source: SafetyVizApp.builderSource({ createConnection: ` +
    `SafetyVizApp.createRConnection, ...${JSON.stringify(builderSourceOptions(where))} }) }`
  );
}
