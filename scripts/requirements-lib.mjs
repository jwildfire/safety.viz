// Requirement-text extractor (#63): reshapes a requirements matrix
// (requirements/<matrix>.md) into an `{ id: text }` map so the evidence pages
// can show the reviewed requirement each test evidences without leaving the
// page. Pure functions; the CLI (scripts/requirements.mjs) wires them to the
// filesystem and the freshness guard, mirroring scripts/evidence-lib.mjs.

// Requirement IDs are `<PREFIX>-<AREA>-<NUM><suffix?>` per the matrices — SH-
// (histogram), SSP- (shift-plot), SDD- (delta-delta), SROT- (results-over-
// time), SOE- (outlier-explorer), AET- (ae-timelines), … Anchored to the ID
// column so the header row (`ID`) and any non-requirement table rows are
// skipped structurally, not by an enumerated prefix list.
const REQUIREMENT_ID = /^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$/;
const SEPARATOR_ROW = /^\|[\s\-:|]+\|$/;

// Split a Markdown table row into trimmed cells. A `\|` escaped pipe renders as
// a literal `|`, so split only on pipes NOT preceded by a backslash, then strip
// the backslash from any escaped pipe left inside a cell.
function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
}

// Parse the matrix's requirement table into `{ id: text }`. The table columns
// are `ID | Area | Requirement | …`; only rows whose first cell is a
// requirement ID contribute, so the header/separator rows and the source-
// inventory bullet list are ignored without hard-coding the table's position.
export function parseRequirementMatrix(markdown) {
  const requirements = {};
  for (const line of String(markdown || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || SEPARATOR_ROW.test(trimmed)) continue;
    const cells = splitRow(trimmed);
    const id = cells[0];
    const text = cells[2] || '';
    if (REQUIREMENT_ID.test(id) && text) requirements[id] = text;
  }
  return requirements;
}

// Vendored extract shape: module + matrix provenance around the `{ id: text }`
// map. Deliberately timestamp-free so the committed file is a pure function of
// the matrix content and the freshness guard is a plain content comparison.
export function buildRequirementSet({ module, matrix, markdown }) {
  return { module, matrix, requirements: parseRequirementMatrix(markdown) };
}

// Freshness guard: stale when any requirement ID is added, removed, or its
// text changed. Module/matrix provenance is ignored — only the text map
// matters to the evidence page.
export function compareRequirements(committed, fresh) {
  const c = (committed && committed.requirements) || {};
  const f = (fresh && fresh.requirements) || {};
  const differences = [];
  for (const id of Object.keys(c)) {
    if (!(id in f)) differences.push(`removed: ${id}`);
    else if (c[id] !== f[id]) differences.push(`text changed: ${id}`);
  }
  for (const id of Object.keys(f)) {
    if (!(id in c)) differences.push(`added: ${id}`);
  }
  return { stale: differences.length > 0, differences };
}

/**
 * IDs known to have two rows, each with the issue that will give it one: the
 * check passes them while they still do, and fails once they no longer do, so
 * the list cannot outlive its reason. Empty since #195 gave the four older
 * duplicates (HEP-DISPLAY-006, TTE-FILT-001 to 003) one row each.
 */
export const KNOWN_DUPLICATE_IDS = Object.freeze({});

/**
 * Requirement IDs with more than one row across the matrices (#193): an ID is
 * one requirement, so two rows under it means two requirements share a name,
 * and the evidence page would show only the last. Every row whose first cell
 * is a requirement ID counts, whatever its text.
 * @param {Array<{file: string, markdown: string}>} matrices Each matrix's file name and text.
 * @param {{known?: Object<string, string>}} [options] IDs known to have two rows, each with the issue that will fix it: not reported while they still do, and reported once they no longer do.
 * @returns {string[]} One sentence per duplicated ID, naming each row as file:line.
 */
export function duplicateRequirementIds(matrices, { known = {} } = {}) {
  const seen = new Map();
  for (const { file, markdown } of matrices) {
    String(markdown || '')
      .split('\n')
      .forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|') || SEPARATOR_ROW.test(trimmed)) return;
        const [id] = splitRow(trimmed);
        if (!REQUIREMENT_ID.test(id)) return;
        if (!seen.has(id)) seen.set(id, []);
        seen.get(id).push(`${file}:${index + 1}`);
      });
  }
  const problems = [...seen]
    .filter(([id, rows]) => rows.length > 1 && !Object.hasOwn(known, id))
    .map(([id, rows]) => `${id} has ${rows.length} rows: ${rows.join(', ')}.`);
  for (const [id, issue] of Object.entries(known)) {
    if (!seen.has(id) || seen.get(id).length < 2) {
      problems.push(`${id} no longer has two rows (${issue}): take it off the known duplicates.`);
    }
  }
  return problems;
}
