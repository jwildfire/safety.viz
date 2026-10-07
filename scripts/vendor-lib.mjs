// Vendoring, as a copy with a record (#182, obot.roadmap#366). The demo app
// carries a second chart library's script-tag bundle, made in that library's
// own repository and copied here byte for byte: nothing of its source is
// imported or rebuilt in safety.viz. Beside the copy sits a record,
// SOURCE.json, naming the repository and the commit it came from, whether that
// commit is on the library's `dev` branch, and the file's checksum and size.
// `verifyVendored` is the check that fails when the file and its record no
// longer agree; `verifyAgainstSource` compares the file with the commit itself.
// A copy is made from the head of the library's `dev` branch, or from one of
// its release tags (#212), and its record says which.
// The record's shape is the one bio.viz keeps for its copy of safety.viz's
// bundle, so the two repositories describe their copies of each other alike.
// A copy may keep its source's folders (#230), and one line of a copy may
// differ from its source when the record lists the line as it was, as it is
// and why: both checks then hold the file to its source with that change made,
// and to nothing else.
//
// Pure functions over bytes and a folder; scripts/vendor-cli.mjs is the
// command line that fetches the bytes, run by scripts/vendor-bio-viz.mjs,
// scripts/vendor-statistics.mjs (#183) and scripts/vendor-gsm-workflows.mjs
// (#230).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RECORD_FILE = 'SOURCE.json';

/**
 * bio.viz's script-tag bundle: the global `BioViz`, its chart factories and its
 * chart list (`BioViz.portfolio`). The demo page loads it beside the app and
 * the single file inlines it; it is never bundled into safety.viz. The path it
 * is copied from carries bio.viz's version, read from bio.viz's own
 * package.json at the commit; here it has one name whatever the version.
 */
export const BIO_VIZ = {
  name: 'bio.viz script-tag bundle',
  label: 'bundle',
  repository: 'https://github.com/jwildfire/bio.viz',
  directory: 'site/vendor/bio.viz',
  files: [{ file: 'bio.viz.js', source: 'dist/bio.viz-{version}/bio.viz.js' }]
};

/**
 * gsm.bio's statistics functions: one file of R that defines every Analyze_*
 * function bio.viz's charts ask for, written to stand alone with base R. When
 * the reader starts R in the demo app (#183), R in the browser is given this
 * file; the desktop-R script that writes the app's expected results sources the
 * same copy. It is never edited here.
 */
export const GSM_BIO_STATISTICS = {
  name: 'gsm.bio statistics functions',
  label: 'statistics',
  repository: 'https://github.com/jwildfire/gsm.bio',
  directory: 'site/vendor/gsm.bio',
  files: [{ file: 'statistics.R', source: 'inst/statistics/statistics.R' }]
};

// The gsm pipeline's workflow files, for R in the browser (#230,
// obot.roadmap#373): three packages in the public Gilead-Public organisation,
// each copied from the release tag named here into a folder of its own, with a
// record of its own. The files keep the folders they have under the package's
// `inst/`, so a workflow is found here where the package would install it.
const workflowFiles = (folder, names) =>
  names.map((name) => ({
    file: `workflow/${folder}/${name}.yaml`,
    source: `inst/workflow/${folder}/${name}.yaml`
  }));

/**
 * gsm.mapping's mapping workflows for the domains the copied metrics and
 * reporting tables read: each turns a raw table into its mapped one. COUNTRY
 * is here because the reporting Groups workflow reads Mapped_COUNTRY, which
 * gsm.mapping derives from Mapped_SUBJ alone; no raw country table is asked for.
 */
export const GSM_MAPPING_WORKFLOWS = {
  name: 'gsm.mapping mapping workflows',
  label: 'workflows',
  repository: 'https://github.com/Gilead-Public/gsm.mapping',
  directory: 'site/vendor/gsm.mapping',
  tag: 'v1.1.6',
  files: workflowFiles(
    '1_mappings',
    'SUBJ AE PD LB STUDCOMP SDRGCOMP SITE STUDY ENROLL COUNTRY'.split(' ')
  )
};

/**
 * gsm.kri's metric workflows kri0001 to kri0007 and kri0012, and one file of
 * its R, copied whole: R/util-Report.R defines FilterByLatestSnapshotDate,
 * which the reporting Results workflow calls, and the `%|0|%` helper it uses.
 * gsm.kri is not installed in browser R, so the run sources this file instead.
 */
export const GSM_KRI_WORKFLOWS = {
  name: 'gsm.kri metric workflows and report helpers',
  label: 'workflows',
  repository: 'https://github.com/Gilead-Public/gsm.kri',
  directory: 'site/vendor/gsm.kri',
  tag: 'v1.7.0',
  files: [
    ...workflowFiles(
      '2_metrics',
      [1, 2, 3, 4, 5, 6, 7, 12].map((number) => `kri${String(number).padStart(4, '0')}`)
    ),
    { file: 'R/util-Report.R', source: 'R/util-Report.R' }
  ]
};

/**
 * gsm.reporting's four reporting workflows: the Results, Bounds, Groups and
 * Metrics tables. One line of one of them is changed, and it is the only line
 * of any copied workflow that differs from its tag: Results names gsm.kri's
 * function by its package, and here it is named bare, as the record says.
 */
export const GSM_REPORTING_WORKFLOWS = {
  name: 'gsm.reporting reporting workflows',
  label: 'workflows',
  repository: 'https://github.com/Gilead-Public/gsm.reporting',
  directory: 'site/vendor/gsm.reporting',
  tag: 'v1.1.7',
  files: workflowFiles('3_reporting', ['Results', 'Bounds', 'Groups', 'Metrics']).map((entry) =>
    entry.file.endsWith('/Results.yaml')
      ? {
          ...entry,
          patches: [
            {
              original: '    name: gsm.kri::FilterByLatestSnapshotDate',
              replacement: '    name: FilterByLatestSnapshotDate',
              reason:
                'gsm.kri is not installed in browser R, so the function cannot be named by its package. ' +
                'The browser run sources site/vendor/gsm.kri/R/util-Report.R, copied from gsm.kri’s ' +
                'v1.7.0 tag, which defines FilterByLatestSnapshotDate, and the bare name resolves to it.'
            }
          ]
        }
      : entry
  )
};

/** The three, in the order the pipeline runs them: mapping, metrics, reporting. */
export const GSM_WORKFLOWS = [GSM_MAPPING_WORKFLOWS, GSM_KRI_WORKFLOWS, GSM_REPORTING_WORKFLOWS];

/**
 * A file's checksum.
 * @param {Uint8Array} bytes The file's bytes.
 * @returns {string} Its SHA-256, in hex.
 */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * One field of an R package's DESCRIPTION file.
 * @param {string} text The file.
 * @param {string} name The field, such as Version.
 * @returns {string|undefined} Its value, or undefined when the file has no such field.
 */
export const descriptionField = (text, name) => {
  const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : undefined;
};

// Whole lines of a file swapped for others, byte for byte elsewhere: the file
// is cut at its line feeds and read one byte to a character, so a carriage
// return, or a byte that is not text, comes back as it went in. Each line must
// be there exactly once, as a whole line, when its turn comes.
function swapLines(bytes, swaps) {
  const byteText = (text) => Buffer.from(text, 'utf8').toString('latin1');
  const lines = Buffer.from(bytes).toString('latin1').split('\n');
  for (const [from, to] of swaps) {
    const wanted = byteText(from);
    const found = lines.flatMap((line, index) => (line === wanted ? [index] : []));
    if (found.length !== 1) {
      throw new Error(
        `the line ${JSON.stringify(from)} is there ${found.length} times, and must be there once.`
      );
    }
    lines[found[0]] = byteText(to);
  }
  return Buffer.from(lines.join('\n'), 'latin1');
}

// A record's changes to one file, each checked to be a change that can be held
// to: one whole line for another, with the reason said.
function recordedChanges(patches) {
  if (!Array.isArray(patches) || !patches.length) {
    throw new Error('the record lists no changes where it says the file is changed.');
  }
  const line = (value) => typeof value === 'string' && !/[\r\n]/.test(value);
  for (const patch of patches) {
    const { original, replacement, reason } = patch || {};
    if (!line(original) || !line(replacement) || original === replacement) {
      throw new Error('A recorded change needs one whole line as it was, and another as it is.');
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new Error('A recorded change needs its reason.');
    }
  }
  return patches;
}

/**
 * A source file with its recorded changes made (#230): each `original` line,
 * which must be in the file exactly once, becomes its `replacement`. Every
 * other byte is kept. With no changes to make, the bytes as they are.
 * @param {Uint8Array} bytes The file as its source holds it.
 * @param {Array<{original: string, replacement: string, reason: string}>} [patches] The changes, as the record lists them.
 * @returns {Buffer} The file as it is kept here.
 * @throws {Error} When a change is not one line for another with a reason, or its line is not there once.
 */
export function applyPatches(bytes, patches) {
  if (patches === undefined) return Buffer.from(bytes);
  return swapLines(
    bytes,
    recordedChanges(patches).map(({ original, replacement }) => [original, replacement])
  );
}

/**
 * The other way: a file kept here with its recorded changes undone, last
 * first, which is the file its source holds if nothing else was changed.
 * @param {Uint8Array} bytes The file as it is kept here.
 * @param {Array<{original: string, replacement: string, reason: string}>} patches The changes, as the record lists them.
 * @returns {Buffer} The file as its source holds it.
 * @throws {Error} When a change is not one line for another with a reason, or its line is not there once.
 */
export function undoPatches(bytes, patches) {
  return swapLines(
    bytes,
    recordedChanges(patches)
      .map(({ original, replacement }) => [replacement, original])
      .reverse()
  );
}

/**
 * The record for files as they were read from one commit.
 * @param {Object} options
 * @param {Object} options.source What is vendored: BIO_VIZ, with its files' source paths resolved.
 * @param {string} options.ref The branch or commit the files were asked for at.
 * @param {string} options.commit The full commit they were read from.
 * @param {(file: string) => Uint8Array} options.read The bytes of one source path at that commit.
 * @param {Object} [options.more] What else to record, after the commit: a version, whether it is on dev, a note.
 * @returns {{record: Object, contents: Array<{entry: Object, bytes: Buffer}>}} The record, and the bytes to write.
 * @throws {Error} When a file's change cannot be made: its line is not in the source exactly once (#230).
 */
export function buildRecord({ source, ref, commit, read, more = {} }) {
  if (!/^[0-9a-f]{40}$/.test(commit || '')) {
    throw new Error(`A source record needs the full 40-character commit, not "${commit}".`);
  }
  // A file with changes to make (#230) is written changed; its record keeps
  // the source's own checksum and size beside the changes that were made.
  const contents = source.files.map((entry) => {
    const theirs = Buffer.from(read(entry.source));
    try {
      return { entry, theirs, bytes: applyPatches(theirs, entry.patches) };
    } catch (error) {
      throw new Error(`${entry.source}: ${error.message}`);
    }
  });
  return {
    record: {
      [source.label]: source.name,
      repository: source.repository,
      ref,
      commit,
      ...more,
      files: contents.map(({ entry, theirs, bytes }) => ({
        file: entry.file,
        source: entry.source,
        sha256: sha256(bytes),
        bytes: bytes.length,
        ...(entry.patches === undefined
          ? {}
          : { source_sha256: sha256(theirs), source_bytes: theirs.length, patches: entry.patches })
      }))
    },
    contents
  };
}

/**
 * Write the files exactly as given, each in its folder under the vendor
 * folder, and the record beside them.
 * @param {string} directory The vendor folder.
 * @param {{record: Object, contents: Array}} vendored What buildRecord returned.
 * @returns {void}
 */
export function writeVendored(directory, { record, contents }) {
  mkdirSync(directory, { recursive: true });
  for (const { entry, bytes } of contents) {
    mkdirSync(path.dirname(path.join(directory, entry.file)), { recursive: true });
    writeFileSync(path.join(directory, entry.file), bytes);
  }
  writeFileSync(path.join(directory, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Read a vendor folder's record.
 * @param {string} directory The vendor folder.
 * @returns {Object} The record.
 */
export function readRecord(directory) {
  return JSON.parse(readFileSync(path.join(directory, RECORD_FILE), 'utf8'));
}

// Every file under a folder, in its subfolders too, as the record names files:
// the path from the folder, with forward slashes.
function filesUnder(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? filesUnder(path.join(directory, item.name), `${prefix}${item.name}/`)
      : [`${prefix}${item.name}`]
  );
}

// What is wrong with a changed file's own record (#230), the file being the one
// its checksum names: its changes, undone, must give the source file the record
// names. An empty list means the file is that source with those changes alone.
function changeProblems(entry, bytes) {
  let theirs;
  try {
    theirs = undoPatches(bytes, entry.patches);
  } catch (error) {
    return [`${entry.file}: its recorded change cannot be undone: ${error.message}`];
  }
  if (sha256(theirs) === entry.source_sha256 && theirs.length === entry.source_bytes) return [];
  return [
    `${entry.file}: with its recorded change undone, it is not the source file the record names ` +
      `(recorded ${String(entry.source_sha256).slice(0, 12)}…, found ${sha256(theirs).slice(0, 12)}…).`
  ];
}

/**
 * Every way a vendor folder and its record disagree; an empty list means every
 * recorded file is present and unchanged and nothing else is there, in the
 * folder or under it. A file the record says is changed from its source (#230)
 * must also be that source with the recorded changes and no other. It never
 * passes by comparing nothing.
 * @param {string} directory The vendor folder.
 * @returns {string[]} The problems, each a sentence.
 */
export function verifyVendored(directory) {
  if (!existsSync(path.join(directory, RECORD_FILE))) {
    return [`${RECORD_FILE} is missing: the files have no source record.`];
  }
  let record;
  try {
    record = readRecord(directory);
  } catch (error) {
    return [`${RECORD_FILE} cannot be read: ${error.message}`];
  }
  const problems = [];
  if (!/^[0-9a-f]{40}$/.test(record.commit || '')) {
    problems.push(`${RECORD_FILE} does not name the full commit the files were copied from.`);
  }
  if (typeof record.repository !== 'string' || !record.repository) {
    problems.push(`${RECORD_FILE} does not name the repository the files were copied from.`);
  }
  const files = Array.isArray(record.files) ? record.files : [];
  if (!files.length) problems.push(`${RECORD_FILE} records no files.`);
  for (const entry of files) {
    const file = path.join(directory, String(entry.file));
    if (!existsSync(file)) {
      problems.push(`${entry.file}: recorded, but the file is missing.`);
      continue;
    }
    const bytes = readFileSync(file);
    if (sha256(bytes) !== entry.sha256) {
      problems.push(
        `${entry.file}: the file no longer matches its recorded checksum ` +
          `(recorded ${String(entry.sha256).slice(0, 12)}…, found ${sha256(bytes).slice(0, 12)}…).`
      );
    } else if (bytes.length !== entry.bytes) {
      problems.push(`${entry.file}: ${bytes.length} bytes, and the record says ${entry.bytes}.`);
    } else if (entry.patches !== undefined) {
      problems.push(...changeProblems(entry, bytes));
    }
  }
  const recorded = new Set(files.map((entry) => entry.file));
  for (const file of filesUnder(directory).filter((name) => name !== RECORD_FILE)) {
    if (!recorded.has(file)) problems.push(`${file}: present, but not in ${RECORD_FILE}.`);
  }
  return problems;
}

/**
 * The check of what a record may say is changed (#230): the changes it lists
 * for a file must be the ones the script that copies the file declares for it,
 * word for word, and a file the script declares none for must list none. So a
 * line changed in a copy cannot be passed by writing it into the record: the
 * change has to be made in the script, where it is reviewed.
 * @param {Object} record A vendor record.
 * @param {Object} source What is vendored, as the script declares it: its files, each with its `patches` if it has any.
 * @returns {string[]} The problems, each a sentence.
 */
export function verifyDeclaredChanges(record, source) {
  const declared = new Map(source.files.map((entry) => [entry.file, entry.patches]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return (Array.isArray(record.files) ? record.files : [])
    .filter((entry) => !same(entry.patches, declared.get(entry.file)))
    .map((entry) =>
      declared.get(entry.file) === undefined
        ? `${entry.file}: ${RECORD_FILE} lists a change to it, and the script that copies it declares none.`
        : `${entry.file}: ${RECORD_FILE} does not list the change the script that copies it declares, as it declares it.`
    );
}

/**
 * The second check, against the source itself: every recorded file equals the
 * bytes the library holds at the recorded commit, with the file's recorded
 * changes made to them if it has any (#230). A source that does not hold a
 * change's line exactly once fails.
 * @param {string} directory The vendor folder.
 * @param {(commit: string, file: string) => Promise<Uint8Array>} read The bytes of one source path at one commit.
 * @returns {Promise<string[]>} The problems, each a sentence.
 */
export async function verifyAgainstSource(directory, read) {
  const record = readRecord(directory);
  const problems = [];
  for (const entry of record.files || []) {
    const at = `${entry.source} at ${record.commit.slice(0, 7)} of ${record.repository}`;
    let theirs = Buffer.from(await read(record.commit, entry.source));
    const changed = entry.patches !== undefined;
    try {
      theirs = applyPatches(theirs, entry.patches);
    } catch (error) {
      problems.push(`${entry.file}: ${at} does not take its recorded change: ${error.message}`);
      continue;
    }
    const file = path.join(directory, entry.file);
    const ours = existsSync(file) ? readFileSync(file) : null;
    if (!ours || !ours.equals(theirs)) {
      problems.push(
        `${entry.file}: differs from ${at}${changed ? ', with its recorded change made' : ''}.`
      );
    }
  }
  if (!(record.files || []).length) problems.push(`${RECORD_FILE} records no files.`);
  return problems;
}

/**
 * The third check, of the record's word that its commit is on the source's
 * `dev` branch (#193): a record that says `merged_to_dev: true` is asked about,
 * and fails when `dev` neither is that commit nor has it in its history. A
 * record that says it was copied from elsewhere (`merged_to_dev: false`, with
 * its note saying why) is not asked about; one that says neither fails.
 * @param {Object} record A vendor record.
 * @param {(commit: string) => Promise<string>} compare How `dev` stands to the commit, as GitHub's compare API says it: `ahead` or `identical` when the commit is on `dev`, `behind` or `diverged` when it is not.
 * @returns {Promise<string[]>} The problems, each a sentence.
 */
export async function verifyOnDev(record, compare) {
  const short = String(record.commit).slice(0, 7);
  if (record.merged_to_dev === false) return [];
  if (record.merged_to_dev !== true) {
    return [`${RECORD_FILE} does not say whether ${short} is on dev.`];
  }
  const status = await compare(record.commit);
  if (status === 'ahead' || status === 'identical') return [];
  return [
    `${RECORD_FILE} says ${short} is on ${record.repository}’s dev branch, but it is not (dev is ${status}).`
  ];
}

/**
 * The commit a tag points at, read from what `git ls-remote <repository>
 * refs/tags/<tag> refs/tags/<tag>^{}` prints (#212). An annotated tag is
 * listed twice, once as the tag object and once peeled, `refs/tags/<tag>^{}`,
 * which is the commit; a lightweight tag is listed once, as the commit.
 * @param {string} listed The command's output.
 * @param {string} tag The tag's name.
 * @returns {?string} The full commit, or null when the repository has no such tag.
 */
export function tagCommitFrom(listed, tag) {
  const lines = String(listed)
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([commit, name]) => /^[0-9a-f]{40}$/.test(commit || '') && name);
  const named = (name) => (lines.find(([, listedName]) => listedName === name) || [])[0];
  return named(`refs/tags/${tag}^{}`) || named(`refs/tags/${tag}`) || null;
}

/**
 * The fourth check, of a record copied from a release (#212): a record that
 * names a `tag` is asked about, and fails when the source's tag of that name
 * points at another commit, or is not there. The tag must also be the tag of
 * the version the record names. A record that names no tag is not asked about.
 * @param {Object} record A vendor record.
 * @param {(tag: string) => Promise<?string>} tagCommit The commit the source's tag points at, or null when it has no such tag.
 * @returns {Promise<string[]>} The problems, each a sentence.
 */
export async function verifyTag(record, tagCommit) {
  if (record.tag === undefined) return [];
  const short = String(record.commit).slice(0, 7);
  if (typeof record.tag !== 'string' || !record.tag) {
    return [`${RECORD_FILE} names a tag that is not a name.`];
  }
  const problems = [];
  if (record.version !== undefined && record.tag !== `v${record.version}`) {
    problems.push(
      `${RECORD_FILE} names the tag ${record.tag} and version ${record.version}, which is not that tag's version.`
    );
  }
  const commit = await tagCommit(record.tag);
  if (!commit) {
    problems.push(
      `${RECORD_FILE} says ${short} is ${record.repository}’s tag ${record.tag}, but there is no such tag.`
    );
  } else if (commit !== record.commit) {
    problems.push(
      `${RECORD_FILE} says ${short} is ${record.repository}’s tag ${record.tag}, but that tag is ${commit.slice(0, 7)}.`
    );
  }
  return problems;
}

/**
 * How the source's `dev` branch stands to a commit, from GitHub's compare API
 * (#193): `ahead` or `identical` when the commit is on `dev`. With a token it
 * asks with it, and asks again without it when GitHub refuses the token. When
 * it cannot learn the answer it throws, saying why — the rate limit, the
 * network, or an answer with no status — so the check fails rather than
 * passing on nothing.
 * @param {{slug: string, commit: string, fetch?: Function, token?: string}} options The repository as owner/name, the commit, the fetch to use, and a token.
 * @returns {Promise<string>} The comparison's status.
 */
export async function compareWithDev({ slug, commit, fetch = globalThis.fetch, token }) {
  const url = `https://api.github.com/repos/${slug}/compare/${commit}...dev`;
  const unknown = 'so whether the commit is on dev is unknown';
  const ask = async (withToken) => {
    const headers = { accept: 'application/vnd.github+json' };
    if (withToken) headers.authorization = `Bearer ${withToken}`;
    try {
      return await fetch(url, { headers });
    } catch (error) {
      throw new Error(`${url} could not be reached (${error && error.message}), ${unknown}.`);
    }
  };
  let response = await ask(token);
  if (response.status === 401 && token) response = await ask(null);
  if (!response.ok) {
    const header = (name) => (response.headers ? response.headers.get(name) : null);
    if (header('x-ratelimit-remaining') === '0') {
      const reset = Number(header('x-ratelimit-reset'));
      const until =
        Number.isFinite(reset) && reset > 0 ? ` until ${new Date(reset * 1000).toISOString()}` : '';
      throw new Error(
        `${url} answered ${response.status}: GitHub's API rate limit is used up${until}, ${unknown}. Set GITHUB_TOKEN to ask with a token.`
      );
    }
    throw new Error(`${url} answered ${response.status}, ${unknown}.`);
  }
  const body = await response.json().catch(() => null);
  if (!body || typeof body.status !== 'string' || !body.status) {
    throw new Error(`${url} answered with no comparison status, ${unknown}.`);
  }
  return body.status;
}
