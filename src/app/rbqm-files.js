// Demo app: a reader's own raw files on the RBQM tab (#236, obot.roadmap#374).
// Each loaded file is placed in one of gsm's raw domains by its name, or by its
// columns when its name says nothing, and the tab says, before R is started,
// which metrics the placed files support. This module is that with no document
// in it.
//
// What a domain's file must hold, and what each metric needs, is not written
// here: it is `needs`, which desktop R reads from gsm's own workflow specs
// (`rbqm_needs` in site/rbqm/pipeline.R; site/rbqm/needs.json). The rule that
// turns it into "this metric needs that file" is the one R follows when it
// runs (`gaps` and `sentence` there), and the sentences are R's, word for
// word: a unit test holds these to what desktop R said of the same files.
//
// Nothing here reads a file's rows: a file is its name and its column names.

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
  const has = new Set(list(file.columns));
  const candidates = raw
    .filter((entry) => list(entry.columns).every((column) => has.has(column)))
    .map((entry) => entry.table);
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

const noReason = () => ({ files: [], columns: {} });
const hasReason = (why) => why.files.length > 0 || Object.keys(why.columns).length > 0;
const unique = (items) => [...new Set(items)];

/** Two reasons as one, as R joins them: every file not loaded, and every column a file lacks. */
function both(left, right) {
  const columns = { ...left.columns };
  for (const [file, names] of Object.entries(right.columns)) {
    columns[file] = unique([...(columns[file] || []), ...names]);
  }
  return { files: unique([...left.files, ...right.files]), columns };
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
  return said.join(' ');
}

/**
 * Which metrics the loaded files support, said before R is started: for each
 * metric, that the files it needs are there with their columns, or the
 * sentence R will say of it. The Groups table the same.
 * @param {Map<string, {columns: string[]}>} tables The file used for each raw table (rawStudy's).
 * @param {Object} needs What the workflows need, as R reads it.
 * @returns {{metrics: Array<{id: string, name: string, abbreviation: string, supported: boolean, message: string}>, groups: {supported: boolean, message: string}}} What the tab lists.
 */
export function supportOf(tables, needs) {
  const columns = new Map([...tables].map(([table, file]) => [table, new Set(list(file.columns))]));
  const made = new Set();
  const unmade = new Map();
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
    groups: of('The Groups table', isRecord(needs) && needs.groups ? needs.groups.needs : [])
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

const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** A file the tab does not read: gsm's raw files are CSV, and R is handed their text as CSV. */
export const NOT_CSV = (name) =>
  `${name} is not a CSV file: the RBQM tab reads gsm’s raw files as CSV.`;

/**
 * The loaded files in a sentence, said before R is started: how many are
 * loaded, how many were placed in a raw domain, and how many metrics they
 * support.
 * @param {{files: Object[], tables: Map}} study The loaded files as a study (rawStudy's).
 * @param {{metrics: Array<{supported: boolean}>}} support What they support (supportOf's).
 * @returns {string} The sentence.
 */
export function filesSentence(study, support) {
  const loaded = study.files.length;
  if (!loaded) return 'No files are loaded.';
  const supported = support.metrics.filter((metric) => metric.supported).length;
  return (
    `${counted(loaded, 'file')} loaded, ${study.tables.size} placed in a gsm raw domain. ` +
    `${loaded === 1 ? 'It supports' : 'They support'} ${supported} of ` +
    `${counted(support.metrics.length, 'metric')}.`
  );
}
