// Demo app: further chart libraries beside safety.viz's own (#181,
// obot.roadmap#366). A host page hands the app, besides safety.viz's chart
// factories and manifest, any number of other libraries, each its own chart
// factories and its own chart list in the portfolio manifest's format
// (version 2). This module merges those chart lists into the one manifest the
// page works from, says which library each chart's factory comes from, and
// says in words why a chart cannot be drawn when its library or its factory is
// not there or its entry cannot be read, and why a library that was asked for
// has no charts listed at all. It also decides the groups the charts are listed
// under. Pure: no document, and nothing thrown, whatever a library hands in
// (#193): a malformed entry is a chart that reads "not loaded", never a page
// that does not mount.
//
// Nothing here, or anywhere in the app, looks a second library's chart up by
// its name: what it reads, what it needs and how it is handed its data come
// from its entry.

/** The library a chart comes from when its entry names none: safety.viz itself. */
export const OWN_LIBRARY = 'safety.viz';

/** The group of the charts that read domains outside the standard set. */
export const OTHER_GROUP = 'other';

/** The view id the app keeps for its data view: no library chart may take it (#197). */
export const DATA_VIEW = 'data';

const has = (object, key) => Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
const asList = (value) => [].concat(value);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value !== '';
const isTextList = (value) => Array.isArray(value) && value.every(isText);

/**
 * The library a merged manifest entry comes from.
 * @param {Object} entry A manifest entry.
 * @returns {string} Its library's name.
 */
export const libraryOf = (entry) => (isRecord(entry) && entry.library) || OWN_LIBRARY;

/**
 * Why an entry does not have the shape the app reads, or null when it has. The
 * schema says the same of a manifest that is validated; a chart list handed in
 * at run time may not have been, so the app checks what it relies on before it
 * relies on it.
 * @private
 */
function shapeProblem(entry) {
  if (!isRecord(entry)) return 'it is not an object';
  if (!isText(entry.export)) return 'it names no export';
  if (!isText(entry.title)) return 'it has no title';
  if (!isTextList(entry.domains)) return 'it does not list the domains it reads';
  if (entry.optionalDomains !== undefined && !isTextList(entry.optionalDomains)) {
    return 'its optional domains are not a list of domains';
  }
  if (entry.group !== undefined && !isText(entry.group)) return 'its group is not a name';
  if (!isRecord(entry.settings)) return 'it does not list its settings';
  for (const [key, setting] of Object.entries(entry.settings)) {
    if (!isRecord(setting)) return `its ${key} setting is not an object`;
    if (!isText(setting.domain) && !isTextList(setting.domain)) {
      return `its ${key} setting names no domain`;
    }
    // A string or null, as the schema says: an empty name is a column no
    // domain has, which entryProblem says in words.
    if (setting.column !== null && typeof setting.column !== 'string') {
      return `its ${key} setting names no column`;
    }
  }
  if (entry.tables !== undefined) {
    if (!isRecord(entry.tables)) return 'its tables are not an object';
    const bad = Object.entries(entry.tables).find(([, table]) => !isRecord(table));
    if (bad) return `its ${bad[0]} table is not an object`;
  }
  return null;
}

/**
 * Why an entry cannot be used against the app's standard domains, or null when
 * it can. The schema holds an entry's shape; these are the things only the
 * app, which knows the domains and the declared groups, can check.
 * @private
 */
function entryProblem(entry, domains, groups) {
  const label = (id) => (has(domains, id) ? domains[id].label : id);
  const reads = [...entry.domains, ...(entry.optionalDomains || [])];
  const outside = reads.find((id) => !has(domains, id));
  if (outside) return `it reads ${outside}, which is not one of the standard domains`;
  for (const [key, setting] of Object.entries(entry.settings)) {
    for (const id of asList(setting.domain)) {
      if (!has(domains, id))
        return `its ${key} setting reads ${id}, which is not a standard domain`;
      if (setting.column === '') {
        return `its ${key} setting reads a column with no name, which is not a column of ${label(id)}`;
      }
      if (setting.column !== null && !has(domains[id].columns, setting.column)) {
        return `its ${key} setting reads ${setting.column}, but ${setting.column} is not a column of ${label(id)}`;
      }
    }
  }
  if (entry.tables) {
    const tables = Object.values(entry.tables);
    const required = new Set(tables.filter((table) => table.required).map((table) => table.domain));
    const optional = new Set(
      tables.filter((table) => !table.required).map((table) => table.domain)
    );
    const same = (set, list) =>
      set.size === new Set(list).size && [...set].every((id) => list.includes(id));
    if (!same(required, entry.domains || []) || !same(optional, entry.optionalDomains || [])) {
      return 'its required tables’ domains are not its domains, or its optional tables’ domains are not its optional domains';
    }
  }
  if (entry.group && !has(domains, entry.group) && !has(groups, entry.group)) {
    return `it is listed under ${entry.group}, a group its chart list does not declare`;
  }
  return null;
}

/**
 * Merge further libraries' chart lists into safety.viz's manifest.
 *
 * safety.viz's own entries come first and are carried as they are. Each
 * library's follow, in the order the libraries were handed in; an entry that
 * names no library takes the one its chart list was handed in with. An entry
 * whose name is already listed, a library with no name or with a name already
 * used (the first library of a name is the one used, #193), and a group
 * already declared, or named like a standard domain or the group outside the
 * set, are left out with a console warning: the page still mounts. A library
 * chart named `data`, the data view's id, is left out too, and `unloaded` says
 * why (#197). The domains
 * are always the host's: a library's charts read the standard set.
 *
 * A library handed in by name with no chart list the app can read — its
 * script did not load, or what it lists is not a chart list — is not left out
 * silently: `unloaded` says, for each, in a sentence, that its charts are not
 * shown and why (#193).
 *
 * @param {Object} host safety.viz's portfolio manifest.
 * @param {Object} hostCharts safety.viz's chart factories, keyed by export name.
 * @param {Array<{name: string, charts: ?Object, manifest: ?Object, file?: string}>} [libraries] The further libraries; `file` is the script the page loaded the library from, named when it did not load.
 * @returns {{manifest: Object, problems: Object<string, string>, unloaded: string[], libraries: Map<string, Object>, declaredBy: Object<string, string>, factoryOf: (module: string) => ?Function}} The merged manifest; for each chart that cannot be drawn, the sentence that says why; for each library asked for whose charts are not listed, the sentence that says why; the libraries used, by name; the library that declared each group; and the factory to draw a chart with, or null.
 */
export function mergeLibraries(host, hostCharts, libraries = []) {
  const modules = {};
  const groups = { ...(host.groups || {}) };
  const charts = { [OWN_LIBRARY]: hostCharts };
  const used = new Map();
  const unloaded = [];
  // Which library declared each group: a group is painted with its library's colour (#268).
  const declaredBy = {};
  const warn = (message) => console.warn(`safety.viz app: ${message}`);
  // A group a library may not declare: one a standard domain or the group
  // outside the set already is, whose tab is safety.viz's own.
  const reserved = (id) => has(host.domains, id) || id === OTHER_GROUP;

  for (const [module, entry] of Object.entries(host.modules)) modules[module] = entry;

  for (const library of libraries) {
    const name = isRecord(library) ? library.name : undefined;
    if (!isText(name) || has(charts, name)) {
      warn(
        `a library was handed in with no name or a name already used (${name}); it was left out.`
      );
      continue;
    }
    const list = library.manifest;
    if (!isRecord(list) || (list.modules !== undefined && !isRecord(list.modules))) {
      // Asked for by name, and nothing to list: say so on the page, and why.
      charts[name] = null;
      // A script that did not load and one that threw as it ran look the same
      // from here: neither defined the library.
      if (!library.charts && list === undefined) {
        unloaded.push(
          isText(library.file)
            ? `The ${name} charts are not shown: ${library.file} did not load on this page, or failed as it loaded.`
            : `The ${name} charts are not shown: the ${name} library did not load on this page, or failed as it loaded.`
        );
      } else {
        unloaded.push(
          `The ${name} charts are not shown: the ${name} library on this page has no chart list the app can read.`
        );
      }
      warn(`${name} was handed in with no chart list the app can read; its charts are not listed.`);
      continue;
    }
    if (!isRecord(list.modules) || !Object.keys(list.modules).length) {
      charts[name] = null;
      unloaded.push(
        `The ${name} charts are not shown: the ${name} library on this page lists no charts.`
      );
      warn(`${name} was handed in with a chart list that lists no charts.`);
      continue;
    }
    charts[name] = library.charts || null;
    used.set(name, library);
    for (const [id, group] of Object.entries(isRecord(list.groups) ? list.groups : {})) {
      if (reserved(id)) {
        warn(`${name} declares the group ${id}, which is safety.viz's own tab; it was left out.`);
      } else if (has(groups, id)) {
        warn(`${name} declares the group ${id}, which is already declared.`);
      } else {
        groups[id] = group;
        declaredBy[id] = name;
      }
    }
    for (const [module, entry] of Object.entries(list.modules)) {
      // Listed, it would be a chip that opens the data view: say so instead.
      if (module === DATA_VIEW) {
        unloaded.push(
          `The ${name} chart “${module}” is not shown: the app keeps the name “${module}” for its data view.`
        );
        warn(`${name}'s chart ${module} takes the name of the data view, and was left out.`);
        continue;
      }
      if (has(modules, module)) {
        warn(
          `${name}'s chart ${module} has the same name as a chart already listed, and was left out.`
        );
        continue;
      }
      // An entry that is not an object is still listed, under its module name,
      // so the page can say why it cannot be drawn.
      const given = isRecord(entry) ? entry : { title: module, malformed: true };
      modules[module] = given.library ? given : { ...given, library: name };
    }
  }

  const manifest = { ...host, groups, modules };
  const problems = {};
  const unusable = (name, problem) =>
    `This chart’s entry in the ${name} chart list cannot be used: ${problem}.`;
  for (const [module, entry] of Object.entries(modules)) {
    const name = libraryOf(entry);
    const collection = has(charts, name) ? charts[name] : null;
    if (!collection || typeof collection !== 'object') {
      problems[module] =
        `The ${name} library is not loaded on this page, so this chart cannot be drawn.`;
      continue;
    }
    const shape = entry.malformed ? 'it is not an object' : shapeProblem(entry);
    if (shape) {
      problems[module] = unusable(name, shape);
      continue;
    }
    // Only the library's own charts count: not a name every object inherits.
    if (!has(collection, entry.export) || typeof collection[entry.export] !== 'function') {
      problems[module] =
        `The ${name} library on this page has no chart called ${entry.export}, so this chart cannot be drawn.`;
      continue;
    }
    const problem = entryProblem(entry, host.domains, groups);
    if (problem) problems[module] = unusable(name, problem);
  }

  return {
    manifest,
    problems,
    unloaded,
    libraries: used,
    declaredBy,
    factoryOf(module) {
      if (!has(modules, module) || has(problems, module)) return null;
      const entry = modules[module];
      return charts[libraryOf(entry)][entry.export];
    }
  };
}

/**
 * The group a chart is listed under: the group its entry names, else the first
 * domain it reads, else the group of charts outside the standard set. An entry
 * that names neither — one the page cannot use (#193) — is listed in the group
 * outside the set, so no tab is ever named "undefined".
 * @param {Object} entry A manifest entry.
 * @returns {string} The group's id.
 */
export function groupOf(entry) {
  if (!isRecord(entry)) return OTHER_GROUP;
  if (isText(entry.group)) return entry.group;
  if (entry.externalDomains) return OTHER_GROUP;
  const [first] = Array.isArray(entry.domains) ? entry.domains : [];
  return isText(first) ? first : OTHER_GROUP;
}

const isDeclared = (group, manifest) => has(manifest.groups, group);

/**
 * The charts of each group, in the order their tabs come: the standard
 * domains' groups (and the group outside the set) first, in the order their
 * charts are listed, which is how the app has always ordered them; then the
 * declared groups by their `order`, ties in the order their charts are listed.
 * @param {Object} manifest The merged manifest.
 * @returns {Array<[string, Array<[string, Object]>]>} Each group's id and its charts as [module, entry] pairs.
 */
export function chartGroups(manifest) {
  const groups = new Map();
  for (const [module, entry] of Object.entries(manifest.modules)) {
    const group = groupOf(entry);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push([module, entry]);
  }
  const listed = [...groups];
  const standard = listed.filter(([group]) => !isDeclared(group, manifest));
  const declared = listed
    .filter(([group]) => isDeclared(group, manifest))
    .sort(([a], [b]) => manifest.groups[a].order - manifest.groups[b].order);
  return [...standard, ...declared];
}

/**
 * A group's name on its tab.
 * @param {string} group A group id.
 * @param {Object} manifest The merged manifest.
 * @returns {string} The declared group's label, the domain's label, or "Other".
 */
export function groupLabel(group, manifest) {
  if (isDeclared(group, manifest)) return manifest.groups[group].label;
  if (group === OTHER_GROUP) return 'Other';
  return has(manifest.domains, group) ? manifest.domains[group].label : group;
}

/**
 * The class a group's tab, chart names and chart card carry. Each standard
 * domain and the group outside the set has a hue of its own, set by its class
 * (styles.js). A declared group's class sets none: the page paints it with its
 * library's colour, which {@link tabColours} gives.
 * @param {string} group A group id.
 * @param {Object} manifest The merged manifest.
 * @returns {string} The class name.
 */
export function hueClass(group, manifest) {
  return isDeclared(group, manifest) ? 'sva-library-group' : `sva-domain-${group}`;
}

/**
 * The hue of each standard domain's tab and of the tab of the charts outside
 * the standard set, as styles.js sets them: green, teal, blue, violet, pink.
 */
export const DOMAIN_COLOURS = {
  subject: '#77a95b',
  ae: '#00afa9',
  bds: '#519fdd',
  eg: '#988bdd',
  other: '#c67bb6'
};

/**
 * The colours a library's tab is given when the library names none, in the
 * order they are given out: pink, amber, green (#268). Red is not one of
 * them: it means "missing" and "did not draw" everywhere in the app.
 */
export const TAB_COLOURS = ['#c67bb6', '#c78a3b', '#77a95b'];

const INK = [0x1f, 0x23, 0x28];
const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/**
 * A colour mixed 40 percent toward the app's ink, channel by channel: what a
 * tab is given once every colour of the list is in use.
 * @param {string} colour A six-digit hex colour.
 * @returns {string} The darker colour, as a six-digit hex.
 */
export function towardInk(colour) {
  const mixed = [1, 3, 5].map((at, index) =>
    Math.round(parseInt(colour.slice(at, at + 2), 16) * 0.6 + INK[index] * 0.4)
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The colour of each library's tab (#268, obot.roadmap#402). A library that
 * names a colour gets it. One that names none is given the first open colour
 * of {@link TAB_COLOURS}, where open means no tab in the header uses it: not a
 * standard domain's tab, and not a library before it. When the list runs out
 * the rule goes round again with each colour mixed 40 percent toward ink, and
 * past that a colour is used twice: no tab is ever grey.
 *
 * The libraries are taken in the order they were handed in, which is the
 * order the app's build lists them, so the same library has the same colour
 * on every load and a library added at the end moves nobody. Whether a
 * library's script loaded changes nothing: it keeps its place in the order.
 * A second library of a name is left out, as the merge leaves it out.
 *
 * @param {Array<{name: string, colour?: string}>} libraries The libraries, in the order the page was handed them.
 * @param {string[]} [taken] The colours the header's other tabs already use.
 * @returns {Map<string, string>} Each library's colour, by its name, as a lower-case six-digit hex.
 */
export function tabColours(libraries, taken = []) {
  const used = new Set(taken.filter(isHex).map((colour) => colour.toLowerCase()));
  const offered = [...TAB_COLOURS, ...TAB_COLOURS.map(towardInk)];
  const colours = new Map();
  let given = 0;
  for (const library of Array.isArray(libraries) ? libraries : []) {
    const name = isRecord(library) ? library.name : undefined;
    if (!isText(name) || colours.has(name)) continue;
    let colour;
    if (isHex(library.colour)) colour = library.colour.toLowerCase();
    else {
      if (library.colour !== undefined) {
        console.warn(
          `safety.viz app: ${name} names a tab colour that is not a six-digit hex colour; the app chose one.`
        );
      }
      colour = offered.find((candidate) => !used.has(candidate));
      // Every colour of both rounds is in use: one is used twice, in the list's order.
      if (!colour) colour = offered[given % offered.length];
      given += 1;
    }
    used.add(colour);
    colours.set(name, colour);
  }
  return colours;
}

// ---- A library's control (#183, #276) ----

const CONTROL_PHASES = ['off', 'starting', 'ready', 'failed'];
const textOr = (value, otherwise = null) => (isText(value) ? value : otherwise);

/**
 * What a library's control says of itself, read safely: the contract a tab
 * gives the R control (#276, src/app/r-control.js).
 *
 * A control's `state()` answers with:
 *
 * - `phase`: `off`, `starting`, `ready` or `failed`. One that names none is
 *   `off`, so a control that only names a button is drawn as a button.
 * - `say`: the few words beside the button, or in the chip. `meta`: the cost,
 *   in a word or two. `title`: the whole sentence, on hover.
 * - `label`: the button's words, and `disabled`, when it cannot be pressed.
 * - `since`: when it started, in milliseconds, for the count of seconds, and
 *   `now`, the clock `since` was read from, when it is not the page's own.
 * - `step`: when starting takes long, the step it is on: `say`, its `index`
 *   from 1 and how many there are, `of`.
 * - `details`: what the panel behind the chip holds: a `heading`, `rows` of a
 *   term and what is said of it, `text` in sentences, `more` sentences behind a
 *   disclosure titled `moreTitle`, and `actions`, each a `label` and a `press`.
 *   A tab with more to say gives `columns`: each a list of sections, and each
 *   section a `title` over any of `steps` (each `say`, a `note` at its right
 *   and its `state`: `done`, `now` or `todo`), `items` in sentences, `rows`
 *   of a term and what is said of it, and `text`. The panel is then a wide one.
 * - `className`: a class for the control's button, for a tab that names its own.
 * - `why`: the word on the chip that opens the details of a failure.
 *
 * The control of #183 named `label`, `done`, `note` and `hint`; they are read
 * as the button's words, whether it is disabled, the sentence on hover and the
 * cost, so a library written for it is drawn as it was.
 * @param {?{state: Function}} action The library's control.
 * @returns {?Object} The state, every member present and of its kind; null when the control says nothing that can be read.
 */
export function controlState(action) {
  let said;
  try {
    said = action && typeof action.state === 'function' ? action.state() : null;
  } catch (error) {
    console.warn('safety.viz app: a library’s control could not say its state.', error);
    return null;
  }
  if (!isRecord(said)) return null;
  const phase = CONTROL_PHASES.includes(said.phase) ? said.phase : 'off';
  const step =
    isRecord(said.step) &&
    isText(said.step.say) &&
    Number.isInteger(said.step.index) &&
    Number.isInteger(said.step.of) &&
    said.step.index >= 1 &&
    said.step.index <= said.step.of
      ? { say: said.step.say, index: said.step.index, of: said.step.of }
      : null;
  const list = (value) => (Array.isArray(value) ? value : []);
  const pairs = (value) =>
    list(value).filter((row) => Array.isArray(row) && isText(row[0]) && isText(row[1]));
  const section = (given) => ({
    title: given.title,
    steps: list(given.steps)
      .filter((item) => isRecord(item) && isText(item.say))
      .map((item) => ({
        say: item.say,
        note: textOr(item.note),
        state: ['done', 'now', 'todo'].includes(item.state) ? item.state : 'done'
      })),
    items: list(given.items).filter(isText),
    rows: pairs(given.rows),
    text: list(given.text).filter(isText)
  });
  const details =
    isRecord(said.details) && isText(said.details.heading)
      ? {
          heading: said.details.heading,
          rows: pairs(said.details.rows),
          text: list(said.details.text).filter(isText),
          more: list(said.details.more).filter(isText),
          moreTitle: textOr(said.details.moreTitle, 'More'),
          actions: list(said.details.actions).filter(
            (item) => isRecord(item) && isText(item.label) && typeof item.press === 'function'
          ),
          columns: list(said.details.columns)
            .map((column) =>
              list(column)
                .filter((given) => isRecord(given) && isText(given.title))
                .map(section)
            )
            .filter((column) => column.length)
        }
      : null;
  return {
    phase,
    say: textOr(said.say, ''),
    meta: textOr(said.meta, textOr(said.hint)),
    title: textOr(said.title, textOr(said.note)),
    label: textOr(said.label),
    disabled: Boolean(said.disabled || said.done),
    since: Number.isFinite(said.since) ? said.since : null,
    now: typeof said.now === 'function' ? said.now : null,
    step,
    details,
    why: textOr(said.why, 'Why'),
    className: textOr(said.className)
  };
}
