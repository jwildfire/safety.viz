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
    if (setting.column !== null && !isText(setting.column)) {
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
 * set, are left out with a console warning: the page still mounts. The domains
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
 * @returns {{manifest: Object, problems: Object<string, string>, unloaded: string[], libraries: Map<string, Object>, factoryOf: (module: string) => ?Function}} The merged manifest; for each chart that cannot be drawn, the sentence that says why; for each library asked for whose charts are not listed, the sentence that says why; the libraries used, by name; and the factory to draw a chart with, or null.
 */
export function mergeLibraries(host, hostCharts, libraries = []) {
  const modules = {};
  const groups = { ...(host.groups || {}) };
  const charts = { [OWN_LIBRARY]: hostCharts };
  const used = new Map();
  const unloaded = [];
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
      if (!library.charts && list === undefined) {
        unloaded.push(
          isText(library.file)
            ? `The ${name} charts are not shown: ${library.file} did not load on this page, so the ${name} library is not here.`
            : `The ${name} charts are not shown: the ${name} library did not load on this page.`
        );
      } else {
        unloaded.push(
          `The ${name} charts are not shown: the ${name} library on this page has no chart list the app can read.`
        );
      }
      warn(`${name} was handed in with no chart list the app can read; its charts are not listed.`);
      continue;
    }
    charts[name] = library.charts || null;
    used.set(name, library);
    for (const [id, group] of Object.entries(isRecord(list.groups) ? list.groups : {})) {
      if (reserved(id)) {
        warn(`${name} declares the group ${id}, which is safety.viz's own tab; it was left out.`);
      } else if (has(groups, id)) {
        warn(`${name} declares the group ${id}, which is already declared.`);
      } else groups[id] = group;
    }
    for (const [module, entry] of Object.entries(list.modules || {})) {
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
 * The class that gives a group its hue. Each standard domain and the group
 * outside the set has a hue of its own; every declared group takes the
 * library hue, the graphite of the mark's centre hex, which no domain and no
 * state uses (styles.js).
 * @param {string} group A group id.
 * @param {Object} manifest The merged manifest.
 * @returns {string} The class name.
 */
export function hueClass(group, manifest) {
  return isDeclared(group, manifest) ? 'sva-library-group' : `sva-domain-${group}`;
}
