// API data for the kit (#154, obot.roadmap#354): the shared parts the bundle
// exports as `kit`. The renderer pages are built from each module's JSDoc and
// schema; the kit page is built from the `Kit` typedef in src/kit.js plus what
// can be computed from the kit itself — which module each member comes from
// (by identity with that module's export, so the page cannot name the wrong
// one), its signature (from the function's own source text) and what the
// bundled Chart.js has registered. Nothing is hand-copied into the page, and a
// member with no documentation is reported in `missing`, which fails
// `npm run docs:api`.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Chart } from 'chart.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Where the kit is assembled and documented.
export const KIT_FILE = 'src/kit.js';

// The modules the kit re-exports from, in the order the kit lists them.
export const KIT_SOURCE_FILES = [
  'src/shell.js',
  'src/filters.js',
  'src/axis-limits.js',
  'src/histogram/listing.js',
  'src/profile-host.js',
  'src/box-whisker.js',
  'src/measure-list.js',
  'src/time-to-event/km.js'
];

// The name the page gives the Chart.js package as a source.
export const CHART_SOURCE = 'chart.js';

// The text from an opening bracket to its match, or null when it never closes.
function bracketed(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (char === '(' || char === '{' || char === '[') depth += 1;
    else if (char === ')' || char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  return null;
}

const isClass = (value) =>
  typeof value === 'function' && /^class\b/.test(Function.prototype.toString.call(value));

/**
 * How a kit member is written at its point of use, read from the member
 * itself: a function's parameter list as its source declares it, a class's
 * constructor, or a constant's value.
 * @param {string} name The member's name on the kit.
 * @param {*} value The member.
 * @returns {string} The signature to show.
 */
export function signatureOf(name, value) {
  if (typeof value !== 'function') return `${name} = ${JSON.stringify(value)}`;
  const text = Function.prototype.toString.call(value);
  if (isClass(value)) {
    const at = text.indexOf('constructor(');
    const params = at === -1 ? null : bracketed(text, at + 'constructor'.length);
    return `new ${name}${(params || '()').replace(/\s+/g, ' ')}`;
  }
  const open = text.indexOf('(');
  const params = open === -1 ? null : bracketed(text, open);
  return `${name}${(params || '()').replace(/\s+/g, ' ')}`;
}

/**
 * Assemble the kit's API data from its typedef doclets and the kit itself.
 * Members are grouped by the module they come from, in the kit's own order.
 * @param {Object} options
 * @param {Object[]} options.doclets Raw `jsdoc -X` doclets for src/kit.js.
 * @param {Object} options.kit The kit object.
 * @param {Array<{file: string, exports: Object}>} options.sources The modules the kit re-exports from, each with its exports.
 * @param {?Object} [options.chart=null] What is known of the bundled Chart.js: `{ version, registered }`.
 * @returns {{module: string, description: string, since: ?string, count: number, chart: ?Object, groups: Array<{source: string, members: Object[]}>, missing: Object[]}} The model; `missing` lists every gap in the documentation.
 */
export function buildKitModel({ doclets, kit, sources, chart = null }) {
  const missing = [];
  const typedef = doclets.find(
    (doclet) => doclet.kind === 'typedef' && doclet.name === 'Kit' && !doclet.undocumented
  );
  const properties = new Map(
    ((typedef && typedef.properties) || []).map((property) => [property.name, property])
  );

  const groups = [];
  for (const [name, value] of Object.entries(kit)) {
    const property = properties.get(name);
    if (!property) {
      missing.push({ kind: 'member', name, reason: 'not documented in the Kit typedef' });
    } else if (!property.description) {
      missing.push({ kind: 'member', name, reason: 'missing description' });
    }

    const source = sources.find((entry) => entry.exports[name] === value);
    if (!source) {
      missing.push({
        kind: 'member',
        name,
        reason: 'is not the export of that name from any kit source module'
      });
      continue;
    }

    let group = groups.find((entry) => entry.source === source.file);
    if (!group) {
      group = { source: source.file, members: [] };
      groups.push(group);
    }
    group.members.push({
      name,
      kind: isClass(value) ? 'class' : typeof value === 'function' ? 'function' : 'constant',
      signature: signatureOf(name, value),
      description: (property && property.description) || ''
    });
  }

  for (const name of properties.keys()) {
    if (!Object.prototype.hasOwnProperty.call(kit, name)) {
      missing.push({
        kind: 'member',
        name,
        reason: 'documented in the Kit typedef but not on the kit'
      });
    }
  }

  return {
    module: 'kit',
    description: (typedef && typedef.description) || '',
    since: (typedef && typedef.since) || null,
    count: Object.keys(kit).length,
    chart,
    groups,
    missing
  };
}

/**
 * Load what the kit page is built from: the kit, the modules it re-exports
 * from, and the Chart.js facts read off the committed bundle — the bundle is
 * where every chart has registered its controllers, so it is the only place
 * that says what `kit.Chart` can draw.
 * @param {Object} [options]
 * @param {string} [options.root] The repository root.
 * @returns {Promise<{kit: Object, sources: Array<{file: string, exports: Object}>, chart: {version: string, registered: Object<string, string[]>}}>} The inputs to buildKitModel.
 */
export async function loadKit({ root = repoRoot } = {}) {
  const load = (file) => import(pathToFileURL(path.join(root, file)).href);
  const { kit } = await load(KIT_FILE);
  const sources = [{ file: CHART_SOURCE, exports: { Chart } }];
  for (const file of KIT_SOURCE_FILES) sources.push({ file, exports: await load(file) });

  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const bundleFile = `dist/safety.viz-${version}/safety.viz.esm.js`;
  const bundle = await load(bundleFile);
  if (!bundle.kit) {
    throw new Error(`${bundleFile} does not export kit — run \`npm run build\` first`);
  }
  const { registry } = bundle.kit.Chart;
  const registered = Object.fromEntries(
    ['controllers', 'elements', 'scales', 'plugins'].map((kind) => [
      kind,
      Object.keys(registry[kind].items).sort()
    ])
  );
  return { kit, sources, chart: { version: bundle.kit.Chart.version, registered } };
}
