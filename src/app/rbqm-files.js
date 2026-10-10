// Demo app: a reader's own raw files for the RBQM tab (#236, obot.roadmap#374).
// Each kept file is placed in one of gsm's raw domains by its name, or by its
// columns when its name says nothing, and the app says, before R is started,
// which metrics the placed files support. This module is that with no document
// in it.
//
// The files come in on the Data tab, where a study's standard files come in
// too (#282, obot.roadmap#406), so the first question is whether a file is a
// raw file at all (`isRawFile`). That path is interim: every study is to be
// read as RAW, then SDTM, then ADaM in a later release, so only what moving the
// loading needs is here.
//
// What a domain's file must hold, and what each metric needs, is not written
// here: it is `needs`, which desktop R reads from gsm's own workflow specs
// (`rbqm_needs` in site/rbqm/pipeline.R; site/rbqm/needs.json). The rule that
// turns it into "this metric needs that file" is the one R follows when it
// runs (`gaps` and `sentence` there), and the sentences are R's, word for
// word: a unit test holds these to what desktop R said of the same files.
//
// The study the other charts use runs here too (#253, obot.roadmap#398): R
// makes a raw table that is not loaded from the standard domain that can give
// it, by workflows `needs.standard` lists. So a standard domain's file, under
// the column names the reader mapped on the Data tab, is one more table the
// rule reads, and R is handed it as text with those names.
//
// Nothing here reads a file's rows but `standardCsv`, which writes them out
// again under the standard names: a file is its name and its column names.

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

/** "a", "a and b", "a, b and c", as R's pipeline writes a list. */
function listed(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** A file's name with no folder, extension or `Raw_` in front, in capitals: what a raw domain is called. */
const domainNamed = (name) =>
  String(name)
    .replace(/^.*[\\/]/, '')
    .replace(/\.csv$/i, '')
    .replace(/^raw_/i, '')
    .toUpperCase();

/** The raw domains every column of which a file has, by table. */
function matching(columns, raw) {
  const has = new Set(list(columns));
  return raw
    .filter((entry) => list(entry.columns).every((column) => has.has(column)))
    .map((entry) => entry.table);
}

/**
 * Whether a file is one of gsm's raw files, where a study's standard files are
 * loaded too (#282): only when its name starts with `Raw_`, or its columns
 * match exactly one raw domain. `placeRaw` goes by a name alone, which is
 * right among files already known to be raw and wrong here: by it the `ae.csv`
 * of a study of standard files would be the adverse events raw file.
 * @param {{name: string, columns: string[]}} file A loaded file.
 * @param {Object} needs What the workflows need, as R reads it.
 * @returns {boolean} Whether it is kept as a raw file.
 */
export function isRawFile(file, needs) {
  if (/^raw_/i.test(String(file.name).replace(/^.*[\\/]/, ''))) return true;
  return matching(file.columns, list(needs && needs.raw)).length === 1;
}

/**
 * Place one file in a raw domain.
 *
 * By its name first: `Raw_AE.csv`, or `ae.csv`, is the adverse events file
 * whatever its columns, so a column it lacks can be named. Otherwise by its
 * columns: the one raw domain every column of which the file has. A file that
 * matches none, or more than one, is not placed.
 * @param {{name: string, columns: string[]}} file A loaded file.
 * @param {Object} needs What the workflows need, as R reads it.
 * @returns {{table: ?string, by: ?('name'|'columns'), candidates: string[]}} The raw table it is, how that was told, and, for a file not placed, the tables its columns match.
 */
export function placeRaw(file, needs) {
  const raw = list(needs && needs.raw);
  const named = raw.find((entry) => domainNamed(entry.table) === domainNamed(file.name));
  if (named) return { table: named.table, by: 'name', candidates: [] };
  const candidates = matching(file.columns, raw);
  if (candidates.length === 1) return { table: candidates[0], by: 'columns', candidates: [] };
  return { table: null, by: null, candidates };
}

/**
 * The loaded files as a study of raw domains: each file with the domain it was
 * placed in, and for each domain the one file R is handed. A later file of a
 * domain replaces an earlier one.
 * @param {Array<{name: string, columns: string[]}>} files The loaded files, in the order loaded.
 * @param {Object} needs What the workflows need, as R reads it.
 * @returns {{files: Array<{file: Object, table: ?string, by: ?string, used: boolean, lacks: string[], sentence: string}>, tables: Map<string, Object>}} Each file with what the tab says of it, and the file used for each raw table.
 */
export function rawStudy(files, needs) {
  const raw = new Map(list(needs && needs.raw).map((entry) => [entry.table, entry]));
  const tables = new Map();
  const placed = list(files).map((file) => ({ file, ...placeRaw(file, needs) }));
  for (const entry of placed) if (entry.table) tables.set(entry.table, entry.file);
  return {
    tables,
    files: placed.map(({ file, table, by, candidates }) => {
      if (!table) {
        return {
          file,
          table: null,
          by: null,
          used: false,
          lacks: [],
          sentence: candidates.length
            ? `${file.name} is not recognised: its columns match more than one gsm raw domain ` +
              `(${listed(candidates)}), and its name says which of none. Name it for the one it is.`
            : `${file.name} is not recognised: its name and its columns match no gsm raw domain.`
        };
      }
      const used = tables.get(table) === file;
      const has = new Set(list(file.columns));
      const lacks = list(raw.get(table).columns).filter((column) => !has.has(column));
      const how = by === 'name' ? 'by its name' : 'by its columns';
      return {
        file,
        table,
        by,
        used,
        lacks,
        sentence: !used
          ? `${file.name} is ${table}, ${how}; ${tables.get(table).name}, loaded after it, is used in its place.`
          : `${file.name} is ${table}, ${how}.` +
            (lacks.length
              ? ` It lacks the ${lacks.length === 1 ? 'column' : 'columns'} ${listed(lacks)}.`
              : '')
      };
    })
  };
}

const noReason = () => ({ files: [], columns: {}, unmapped: {} });
const hasReason = (why) =>
  why.files.length > 0 ||
  Object.keys(why.columns).length > 0 ||
  Object.keys(why.unmapped).length > 0;
const unique = (items) => [...new Set(items)];

/**
 * Two reasons as one, as R joins them: every file not loaded, every column a
 * file lacks, and every standard column the reader's mapping gives no column for.
 */
function both(left, right) {
  const joined = (a, b) => {
    const columns = { ...a };
    for (const [file, names] of Object.entries(b)) {
      columns[file] = unique([...(columns[file] || []), ...names]);
    }
    return columns;
  };
  return {
    files: unique([...left.files, ...right.files]),
    columns: joined(left.columns, right.columns),
    unmapped: joined(left.unmapped, right.unmapped)
  };
}

/**
 * What a workflow's needs ask for that is not there, by R's rule: a raw table
 * that is not there is a file not loaded; a mapped table that is not there was
 * not made, for the reason its mapping workflow could not run; a column a raw
 * file lacks is named with the file. What columns a mapped table will hold is
 * R's to say once it has run.
 */
function gaps(needed, tables, made, unmade) {
  let why = noReason();
  for (const need of list(needed)) {
    if (tables.has(need.table)) {
      const lacking = list(need.columns).filter((column) => !tables.get(need.table).has(column));
      if (lacking.length) {
        const file = `${need.table}.csv`;
        why.columns[file] = unique([...(why.columns[file] || []), ...lacking]);
      }
    } else if (unmade.has(need.table)) {
      why = both(why, unmade.get(need.table));
    } else if (!made.has(need.table)) {
      why.files = unique([...why.files, `${need.table}.csv`]);
    }
  }
  return why;
}

/** The reason in a sentence, of the thing named, in the words R's pipeline uses. */
function sentence(name, why) {
  const said = [];
  if (why.files.length) {
    said.push(
      `${name} needs ${listed(why.files)}, which ${why.files.length === 1 ? 'is' : 'are'} not loaded.`
    );
  }
  for (const [file, columns] of Object.entries(why.columns)) {
    said.push(
      `${name} needs the ${columns.length === 1 ? 'column' : 'columns'} ${listed(columns)}, ` +
        `which ${file} does not have.`
    );
  }
  for (const [file, columns] of Object.entries(why.unmapped)) {
    said.push(
      `${name} needs the ${columns.length === 1 ? 'column' : 'columns'} ${listed(columns)}, ` +
        `which no column of ${file} is mapped to.`
    );
  }
  return said.join(' ');
}

const STANDARD = 'Standard_';

/**
 * The loaded study's standard domains as R can read them: for each standard
 * table a workflow of `needs.standard` names, the reader's file placed in that
 * domain, with the standard columns the workflows ask for that the reader's
 * mapping gives a column of the file.
 * @param {Object<string, {name: string, columns: string[], rows: Object[]}>} files The parsed file of each loaded standard domain (the app's `state.files`).
 * @param {Object<string, {columns: Object<string, {value: ?string}>}>} mappings The mapping of each (the app's `state.mappings`).
 * @param {Object} needs What the workflows need, as R reads it.
 * @returns {Map<string, {table: string, domain: string, name: string, file: Object, mapping: Object, columns: string[], from: Object<string, string>}>} By standard table: the reader's file and its name, the standard columns it gives, and the reader's column each is read from.
 */
export function standardStudy(files, mappings, needs) {
  const asked = new Map();
  for (const workflow of list(needs && needs.standard)) {
    for (const need of list(workflow.needs)) {
      asked.set(need.table, unique([...(asked.get(need.table) || []), ...list(need.columns)]));
    }
  }
  // In the order the study's files were loaded, not the workflows' order.
  const domainOf = (table) => (table.startsWith(STANDARD) ? table.slice(STANDARD.length) : table);
  const order = Object.keys(isRecord(files) ? files : {});
  const tables = [...asked].sort(
    ([a], [b]) => order.indexOf(domainOf(a)) - order.indexOf(domainOf(b))
  );
  const study = new Map();
  for (const [table, columns] of tables) {
    const domain = domainOf(table);
    const file = isRecord(files) ? files[domain] : null;
    const mapping = isRecord(mappings) ? mappings[domain] : null;
    if (!file || !isRecord(mapping) || !isRecord(mapping.columns)) continue;
    const from = {};
    for (const column of columns) {
      const row = mapping.columns[column];
      const mapped = isRecord(row) ? row.value : null;
      if (mapped && list(file.columns).includes(mapped)) from[column] = mapped;
    }
    study.set(table, {
      table,
      domain,
      name: file.name,
      file,
      mapping,
      columns: Object.keys(from),
      from
    });
  }
  return study;
}

/** One field of a CSV line: quoted when it holds a comma, a quote or a line break. */
const csvField = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * A standard domain as R is handed it: the reader's rows as CSV, with only the
 * columns the workflows ask for, each under its standard name. Nothing of a
 * row is changed.
 * @param {{file: {rows: Object[]}, columns: string[], from: Object<string, string>}} entry One table of standardStudy's.
 * @returns {string} The CSV text.
 */
export function standardCsv(entry) {
  const lines = [entry.columns.map(csvField).join(',')];
  for (const row of list(entry.file.rows)) {
    lines.push(entry.columns.map((column) => csvField(row[entry.from[column]])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Which metrics the loaded files support, said before R is started: for each
 * metric, that the files it needs are there with their columns, or the
 * sentence R will say of it. The Groups table the same.
 *
 * A raw table that is not loaded is made from a standard domain when a
 * workflow of `needs.standard` can: its standard domain is loaded and has the
 * columns the workflow names. One whose standard domain lacks a column is not
 * made, and what needs it names the column with the reader's file, as one no
 * column of the file is mapped to: R is handed only what the mapping gives.
 * @param {Map<string, {columns: string[]}>} tables The file used for each raw table (rawStudy's).
 * @param {Object} needs What the workflows need, as R reads it.
 * @param {Map<string, {name: string, columns: string[]}>} [standard] The loaded study's standard domains (standardStudy's).
 * @returns {{metrics: Array<{id: string, name: string, abbreviation: string, supported: boolean, message: string}>, groups: {supported: boolean, message: string}, made: Map<string, string[]>, lacking: Map<string, Object>, reads: Set<string>}} What the tab lists; and, of the standard domains, the raw tables made (`made`, each with the standard tables it is made from), the ones not made for a column (`lacking`), and the standard tables read either way (`reads`).
 */
export function supportOf(tables, needs, standard = new Map()) {
  const columns = new Map([...tables].map(([table, file]) => [table, new Set(list(file.columns))]));
  const made = new Set();
  const unmade = new Map();
  const fromStandard = new Map();
  const lacking = new Map();
  const reads = new Set();
  for (const workflow of list(isRecord(needs) && needs.standard)) {
    if (columns.has(workflow.output)) continue;
    const wanted = list(workflow.needs);
    if (!wanted.every((need) => standard.has(need.table))) continue;
    const why = noReason();
    for (const need of wanted) {
      const table = standard.get(need.table);
      reads.add(need.table);
      const missing = list(need.columns).filter((column) => !list(table.columns).includes(column));
      if (missing.length)
        why.unmapped[table.name] = unique([...(why.unmapped[table.name] || []), ...missing]);
    }
    if (hasReason(why)) {
      unmade.set(workflow.output, why);
      lacking.set(workflow.output, why.unmapped);
    } else {
      columns.set(workflow.output, new Set(list(workflow.provides)));
      fromStandard.set(
        workflow.output,
        wanted.map((need) => need.table)
      );
    }
  }
  for (const mapping of list(isRecord(needs) && needs.mappings)) {
    const why = gaps(mapping.needs, columns, made, unmade);
    if (hasReason(why)) unmade.set(mapping.output, why);
    else made.add(mapping.output);
  }
  const of = (name, needed) => {
    const why = gaps(needed, columns, made, unmade);
    return { supported: !hasReason(why), message: sentence(name, why) };
  };
  return {
    metrics: list(isRecord(needs) && needs.metrics).map((metric) => ({
      id: String(metric.id),
      name: String(metric.metric),
      abbreviation: String(metric.abbreviation),
      ...of(metric.metric, metric.needs)
    })),
    groups: of('The Groups table', isRecord(needs) && needs.groups ? needs.groups.needs : []),
    made: fromStandard,
    lacking,
    reads
  };
}

/**
 * The files R is handed for a run: the one file of each raw table, under the
 * name gsm gives that table's file, whatever the reader called it.
 * @param {Map<string, {text: string}>} tables The file used for each raw table.
 * @returns {Array<{name: string, text: string}>} Each file's name in R and its text.
 */
export const filesForR = (tables) =>
  [...tables].map(([table, file]) => ({ name: `${table}.csv`, text: file.text }));

/**
 * A raw file the app does not read: gsm's raw files are CSV, and R is handed
 * their text as CSV. The Data tab takes JSON too, so the rule is said there.
 */
export const NOT_CSV = (name) =>
  `${name} is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.`;

/**
 * What one file of the loaded study gives the metrics, in a sentence: the raw
 * tables R makes from it, and any it cannot make because the reader's mapping
 * gives no column for one the workflow names.
 * @param {{table: string, name: string}} entry One table of standardStudy's.
 * @param {string} label What the app calls the file's domain ("Subject-level").
 * @param {{made: Map<string, string[]>, lacking: Map<string, Object>}} support supportOf's.
 * @returns {string} The sentence.
 */
export function standardSentence(entry, label, support) {
  const made = [...support.made].filter(([, from]) => from.includes(entry.table)).map(([t]) => t);
  const not = [...support.lacking].filter(([, columns]) => columns[entry.name]);
  const columns = unique(not.flatMap(([, lacking]) => lacking[entry.name]));
  const tables = not.map(([table]) => table);
  const file = `${entry.name}, the ${label} file,`;
  const gives = made.length ? `${file} gives ${listed(made)}.` : '';
  if (!tables.length) return gives;
  const lacks =
    `no column mapped to ${listed(columns)}, so ${listed(tables)} ` +
    `${tables.length === 1 ? 'is' : 'are'} not made. Map ${columns.length === 1 ? 'it' : 'them'} on the Data tab.`;
  return made.length ? `${gives} It has ${lacks}` : `${file} has ${lacks}`;
}
