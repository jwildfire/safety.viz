// Demo app: further chart libraries beside safety.viz's own (#181,
// obot.roadmap#366). A host page hands the app, besides safety.viz's chart
// factories and manifest, any number of other libraries, each its own chart
// factories and its own chart list in the portfolio manifest's format
// (version 2). This module merges those chart lists into the one manifest the
// page works from, says which library each chart's factory comes from, and
// says in words why a chart cannot be drawn when its library or its factory is
// not there or its entry cannot be read. It also decides the groups the charts
// are listed under. Pure: no document, nothing thrown.
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

/**
 * The library a merged manifest entry comes from.
 * @param {Object} entry A manifest entry.
 * @returns {string} Its library's name.
 */
export const libraryOf = (entry) => entry.library || OWN_LIBRARY;

/**
 * Why an entry cannot be used against the app's standard domains, or null when
 * it can. The schema holds an entry's shape; these are the things only the
 * app, which knows the domains and the declared groups, can check.
 * @private
 */
function entryProblem(entry, domains, groups) {
  const label = (id) => (has(domains, id) ? domains[id].label : id);
  const reads = [...(entry.domains || []), ...(entry.optionalDomains || [])];
  const outside = reads.find((id) => !has(domains, id));
  if (outside) return `it reads ${outside}, which is not one of the standard domains`;
  for (const [key, setting] of Object.entries(entry.settings || {})) {
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
 * whose name is already listed, a library with no name, and a group already
 * declared are left out with a console warning: the page still mounts. The
 * domains are always the host's: a library's charts read the standard set.
 *
 * @param {Object} host safety.viz's portfolio manifest.
 * @param {Object} hostCharts safety.viz's chart factories, keyed by export name.
 * @param {Array<{name: string, charts: ?Object, manifest: Object}>} [libraries] The further libraries.
 * @returns {{manifest: Object, problems: Object<string, string>, factoryOf: (module: string) => ?Function}} The merged manifest; for each chart that cannot be drawn, the sentence that says why; and the factory to draw a chart with, or null.
 */
export function mergeLibraries(host, hostCharts, libraries = []) {
  const modules = {};
  const groups = { ...(host.groups || {}) };
  const charts = { [OWN_LIBRARY]: hostCharts };
  const warn = (message) => console.warn(`safety.viz app: ${message}`);

  for (const [module, entry] of Object.entries(host.modules)) modules[module] = entry;

  for (const library of libraries) {
    const name = library && library.name;
    if (typeof name !== 'string' || !name || !library.manifest || has(charts, name)) {
      warn(
        `a library was handed in with no name, no chart list or a name already used (${name}); it was left out.`
      );
      continue;
    }
    charts[name] = library.charts || null;
    for (const [id, group] of Object.entries(library.manifest.groups || {})) {
      if (has(groups, id)) warn(`${name} declares the group ${id}, which is already declared.`);
      else groups[id] = group;
    }
    for (const [module, entry] of Object.entries(library.manifest.modules || {})) {
      if (has(modules, module)) {
        warn(
          `${name}'s chart ${module} has the same name as a chart already listed, and was left out.`
        );
        continue;
      }
      modules[module] = entry.library ? entry : { ...entry, library: name };
    }
  }

  const manifest = { ...host, groups, modules };
  const problems = {};
  for (const [module, entry] of Object.entries(modules)) {
    const name = libraryOf(entry);
    const collection = has(charts, name) ? charts[name] : null;
    if (!collection || typeof collection !== 'object') {
      problems[module] =
        `The ${name} library is not loaded on this page, so this chart cannot be drawn.`;
      continue;
    }
    if (typeof collection[entry.export] !== 'function') {
      problems[module] =
        `The ${name} library on this page has no chart called ${entry.export}, so this chart cannot be drawn.`;
      continue;
    }
    const problem = entryProblem(entry, host.domains, groups);
    if (problem) {
      problems[module] = `This chart’s entry in the ${name} chart list cannot be used: ${problem}.`;
    }
  }

  return {
    manifest,
    problems,
    factoryOf(module) {
      if (!has(modules, module) || has(problems, module)) return null;
      const entry = modules[module];
      return charts[libraryOf(entry)][entry.export];
    }
  };
}

/**
 * The group a chart is listed under: the group its entry names, else the first
 * domain it reads, else the group of charts outside the standard set.
 * @param {Object} entry A manifest entry.
 * @returns {string} The group's id.
 */
export function groupOf(entry) {
  if (entry.group) return entry.group;
  return entry.externalDomains ? OTHER_GROUP : entry.domains[0];
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
