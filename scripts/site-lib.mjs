// Docs-site generators (#7): pure functions scripts/site.mjs assembles into
// _site/. Plain Node, no framework, per design #21 — and every internal URL
// relative, so one build serves the site root, /dev/, and /pr/{N}/ unchanged.

import { LOGO_SVG } from '../src/app/styles.js';
import { HOSTED_PITCH, librariesExpression } from './app-libraries.mjs';

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Minimal inline-markdown renderer for the subset the coverage docs use:
// `code`, ![images](src), [links](url), and **bold**. Escapes HTML first.
// The image rule runs before the link rule so `![alt](src)` is not mis-parsed
// as a link with a stray leading `!` (block-level figures are handled by
// mdBlock; this covers any image that appears mid-paragraph).
// A link destination in either CommonMark spelling: a bare run of non-space,
// non-paren characters admitting BALANCED parenthesised groups, or the
// angle-bracketed form `<...>` that carries anything up to the closing bracket.
//
// Journal permalinks embed parentheses routinely —
// gastrojournal.org/article/S0016-5085(14)01484-X/fulltext — and both spellings
// are load-bearing for them (#54): a pattern that stops at the first `)` ships
// such a link truncated, and Prettier NORMALIZES a parenthesised destination to
// the angle-bracketed form when it formats the markdown, so a renderer that
// handles only the bare form puts `&lt;https://…&gt;` in the href.
// Matched AFTER escapeHtml has run, so the angle brackets arrive as entities.
const DESTINATION = '&lt;.*?&gt;|(?:[^()\\s]|\\([^()\\s]*\\))+';

// Strip the angle brackets off an angle-bracketed destination; other
// destinations pass through untouched.
const bareDestination = (destination) =>
  destination.startsWith('&lt;') && destination.endsWith('&gt;')
    ? destination.slice(4, -4)
    : destination;

export function mdInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(
      new RegExp(`!\\[([^\\]]*)\\]\\((${DESTINATION})\\)`, 'g'),
      (match, alt, destination) => `<img src="${bareDestination(destination)}" alt="${alt}">`
    )
    .replace(
      new RegExp(`\\[([^\\]]+)\\]\\((${DESTINATION})\\)`, 'g'),
      (match, label, destination) => `<a href="${bareDestination(destination)}">${label}</a>`
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// GitHub-style heading slug: lowercase, non-alphanumerics collapsed to a single
// dash, edges trimmed. Used for in-page anchor ids and the guide TOC.
export function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

// A stateful slugger that disambiguates repeated headings (foo, foo-2, foo-3),
// so mdBlock's emitted ids and extractHeadings' TOC ids stay in lock-step when
// both walk the same document in order.
function headingSlugger() {
  const seen = new Map();
  return (text) => {
    const base = slugify(text);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  };
}

// Collect a document's ## / ### / #### headings in order, each with the slug id
// mdBlock(markdown, { headingIds: true }) assigns it — the two share
// headingSlugger, so a TOC built from this list links straight to the body.
export function extractHeadings(markdown) {
  const slug = headingSlugger();
  const headings = [];
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading)
      headings.push({ level: heading[1].length, text: heading[2], id: slug(heading[2]) });
  }
  return headings;
}

// A standalone image line becomes a captioned <figure>: `![alt](src)` or
// `![alt](src "caption")`. The title may be double- or single-quoted (Prettier
// normalizes Markdown image titles to single quotes), and the caption falls
// back to the alt text when no title is given. Only whole-line images are
// figures; mid-paragraph images are handled inline by mdInline. Guides use this
// for the ported workflow diagrams.
const FIGURE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)\s*$/;

function figureBlock(alt, src, caption) {
  const cap = caption || alt;
  return (
    `<figure class="guide-figure">` +
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">` +
    (cap ? `<figcaption>${mdInline(cap)}</figcaption>` : '') +
    `</figure>`
  );
}

// GitHub-flavored pipe tables: a header row, a delimiter row of dashes (with
// optional :colons for column alignment), then body rows. A table is only
// recognized when both the header and the delimiter carry pipes, so a bare
// `---` horizontal rule is never mistaken for a delimiter.
function splitTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableDelimiter(line) {
  return line.includes('|') && line.includes('-') && /^[\s|:-]+$/.test(line.trim());
}

function isTableHeader(lines, i) {
  const header = lines[i];
  const delimiter = lines[i + 1];
  return (
    header && header.includes('|') && header.trim() && delimiter && isTableDelimiter(delimiter)
  );
}

function cellAlign(spec) {
  const left = spec.startsWith(':');
  const right = spec.endsWith(':');
  if (left && right) return ' style="text-align:center"';
  if (right) return ' style="text-align:right"';
  if (left) return ' style="text-align:left"';
  return '';
}

// Render the pipe table beginning at line `start`; returns the HTML and the
// index of the first line past the table.
function renderPipeTable(lines, start) {
  const headers = splitTableCells(lines[start]);
  const aligns = splitTableCells(lines[start + 1]).map(cellAlign);
  const align = (col) => aligns[col] || '';
  let end = start + 2;
  const bodyRows = [];
  while (end < lines.length && lines[end].includes('|') && lines[end].trim()) {
    bodyRows.push(splitTableCells(lines[end]));
    end += 1;
  }
  const head = headers.map((cell, col) => `<th${align(col)}>${mdInline(cell)}</th>`).join('');
  const body = bodyRows
    .map(
      (cells) =>
        `<tr>${cells.map((cell, col) => `<td${align(col)}>${mdInline(cell)}</td>`).join('')}</tr>`
    )
    .join('');
  const table =
    `<div class="table-scroll"><table class="guide-table"><thead><tr>${head}</tr></thead>` +
    `<tbody>${body}</tbody></table></div>`;
  return { table, end };
}

// Block renderer for authored guide content and the coverage doc's
// routing-status tail: ## headings, - bullet and 1. numbered lists (with
// wrapped continuation lines), paragraphs, standalone image figures, and
// GitHub-flavored pipe tables. The figure, table, and ordered-list handling is
// additive — the coverage docs use none of them, so their rendering is
// unchanged. `headingIds` (opt-in) adds slug ids to headings so an on-page TOC
// can anchor to them; it stays off for the coverage docs, which need no ids.
export function mdBlock(markdown, { headingIds = false } = {}) {
  const html = [];
  const slug = headingIds ? headingSlugger() : null;
  let list = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${mdInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${mdInline(item)}</li>`).join('');
      html.push(`<${list.tag}>${items}</${list.tag}>`);
      list = null;
    }
  };
  const startList = (tag) => {
    if (!list || list.tag !== tag) {
      flushList();
      list = { tag, items: [] };
    }
  };

  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (isTableHeader(lines, i)) {
      flushParagraph();
      flushList();
      const { table, end } = renderPipeTable(lines, i);
      html.push(table);
      i = end - 1;
      continue;
    }

    const figure = line.match(FIGURE_RE);
    if (figure) {
      flushParagraph();
      flushList();
      html.push(figureBlock(figure[1], figure[2], figure[3] ?? figure[4]));
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const idAttr = slug ? ` id="${slug(heading[2])}"` : '';
      html.push(`<h${level}${idAttr}>${mdInline(heading[2])}</h${level}>`);
    } else if (/^-\s+/.test(line)) {
      flushParagraph();
      startList('ul');
      list.items.push(line.replace(/^-\s+/, ''));
    } else if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      startList('ol');
      list.items.push(line.replace(/^\d+\.\s+/, ''));
    } else if (/^\s+\S/.test(line) && list) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join('\n');
}

// Expand a coverage-table requirement cell into full IDs. Handles the doc's
// shorthands: full IDs (SH-CFG-004, SSP-CTRL-001, suffixed SH-FUNC-004A),
// slash lists continuing the last prefix (SH-LIST-002/003), and double-dot
// ranges (SH-CFG-004..009). The leading module prefix is any 2–4 letter code
// (SH-, SSP-, SDD-, AET-, …) per the requirement matrices, so every
// renderer's coverage doc parses (#14, #26). Prose like "(defaults)" or "—"
// contributes nothing.
export function expandRequirementIds(cell) {
  const ids = [];
  const token = /[A-Z]{2,4}-[A-Z]+-(\d+)([A-D])?|\.\.(\d+)([A-D])?|\/(\d+)([A-D])?/g;
  let prefix = null;
  let lastNumber = null;
  let width = 3;
  const push = (num, letter) => {
    if (!prefix) return;
    ids.push(`${prefix}${num}${letter || ''}`);
  };
  for (const match of String(cell || '').matchAll(token)) {
    if (match[1] !== undefined) {
      prefix = match[0].slice(0, match[0].length - match[1].length - (match[2] || '').length);
      width = match[1].length;
      lastNumber = Number(match[1]);
      push(match[1], match[2]);
    } else if (match[3] !== undefined && lastNumber !== null) {
      for (let n = lastNumber + 1; n <= Number(match[3]); n += 1) {
        push(String(n).padStart(width, '0'), match[4]);
      }
      lastNumber = Number(match[3]);
    } else if (match[5] !== undefined) {
      push(match[5], match[6]);
      lastNumber = Number(match[5]);
    }
  }
  return [...new Set(ids)];
}

/**
 * Requirement IDs a module's own evidence records carried, but no row of its
 * coverage doc listed, when the check below came in (#195): the evidence page
 * did not show them. They are to be listed under safety.viz#206. Until then
 * they are named here, so the check fails on any new gap, and on a known one
 * once it is listed.
 */
export const KNOWN_UNLISTED_IDS = Object.freeze({
  histogram: [
    'SH-FUNC-004A',
    'SH-FUNC-004B',
    'SH-FUNC-004C',
    'SH-FUNC-005A',
    'SH-FUNC-005B',
    'SH-FUNC-005C',
    'SH-FUNC-005D',
    'SH-FUNC-006',
    'SH-FUNC-010',
    'SH-FUNC-011',
    'SH-FUNC-012',
    'SH-OVW-001',
    'SH-OVW-002',
    'SH-OVW-003',
    'SH-OVW-004',
    'SH-OVW-005',
    'SH-REG-020',
    'SH-REG-024',
    'SH-REG-025',
    'SH-REG-026'
  ],
  'outlier-explorer': [
    'SOE-API-003',
    'SOE-FUNC-001',
    'SOE-FUNC-002',
    'SOE-FUNC-003',
    'SOE-FUNC-010',
    'SOE-FUNC-012',
    'SOE-REG-001',
    'SOE-REG-002',
    'SOE-REG-003',
    'SOE-REG-005',
    'SOE-REG-006',
    'SOE-REG-012',
    'SOE-REG-013',
    'SOE-REG-014',
    'SOE-REG-016',
    'SOE-REG-020',
    'SOE-REG-025',
    'SOE-REG-026',
    'SOE-REG-027',
    'SOE-REG-034',
    'SOE-REG-050',
    'SOE-REG-051',
    'SOE-REG-052',
    'SOE-REG-053'
  ],
  'delta-delta': ['SDD-FUNC-006'],
  'hep-explorer': [
    'HEP-ARM-001',
    'HEP-ARM-002',
    'HEP-ARM-008',
    'HEP-CORE-001',
    'HEP-CORE-002',
    'HEP-CORE-003',
    'HEP-CORE-004',
    'HEP-CORE-005',
    'HEP-CORE-006',
    'HEP-CORE-007',
    'HEP-CORE-008',
    'HEP-CORE-009',
    'HEP-CORE-010',
    'HEP-CORE-011',
    'HEP-CORE-012',
    'HEP-CORE-013',
    'HEP-CORE-014',
    'HEP-CORE-015',
    'HEP-CORE-016',
    'HEP-CORE-017',
    'HEP-CORE-018',
    'HEP-CORE-019',
    'HEP-CTRL-015',
    'HEP-CTRL-016',
    'HEP-DROP-001',
    'HEP-DROP-002',
    'HEP-DROP-003',
    'HEP-IMPUTE-001',
    'HEP-IMPUTE-002',
    'HEP-IMPUTE-003',
    'HEP-SELECT-004'
  ],
  'participant-profile': [
    'PPRF-ACC-001',
    'PPRF-AE-001',
    'PPRF-AE-002',
    'PPRF-AE-003',
    'PPRF-AE-004',
    'PPRF-AE-005',
    'PPRF-AESUM-001',
    'PPRF-AETL-001',
    'PPRF-AETL-002',
    'PPRF-AXIS-001',
    'PPRF-EXP-001',
    'PPRF-GATE-001',
    'PPRF-HDR-003',
    'PPRF-RAIL-002',
    'PPRF-RAIL-005',
    'PPRF-STEP-003'
  ],
  'ae-explorer': ['AE-CFG-009'],
  'ae-timelines': [
    'AET-API-003',
    'AET-REG-002',
    'AET-REG-003',
    'AET-REG-004',
    'AET-REG-008',
    'AET-REG-012',
    'AET-REG-013'
  ],
  'qt-explorer': ['QT-DATA-001', 'QT-OUT-005']
});

/**
 * Requirement IDs a module's evidence page would leave out (#195): those its
 * own records carry — the IDs with the module's prefix, the one most of its
 * coverage rows use — that no row of its coverage doc lists. The page shows a
 * record only through a row that lists one of its IDs, so a requirement whose
 * ID no row lists drops off the page without a word.
 * @param {{coverage: Object, records: Object[], known?: string[]}} options The parsed coverage doc, the module's evidence records, and the IDs known to be unlisted.
 * @returns {string[]} One sentence per ID left out, and per known ID that is now listed or no longer recorded.
 */
export function unlistedRequirementIds({ coverage, records, known = [] }) {
  const listed = new Set();
  const prefixes = {};
  for (const section of coverage.sections) {
    for (const row of section.rows) {
      for (const id of row.requirementIds) {
        listed.add(id);
        const prefix = id.split('-')[0];
        prefixes[prefix] = (prefixes[prefix] || 0) + 1;
      }
    }
  }
  const [prefix] = Object.entries(prefixes).sort((a, b) => b[1] - a[1])[0] || [];
  if (!prefix) return [];
  const recorded = new Set(
    records
      .flatMap((record) => record.requirementIds || [])
      .filter((id) => id.startsWith(`${prefix}-`))
  );
  const problems = [...recorded]
    .filter((id) => !listed.has(id) && !known.includes(id))
    .sort()
    .map(
      (id) =>
        `${id} is recorded, but no row of the coverage doc lists it, so the evidence page does not show it.`
    );
  for (const id of known) {
    if (listed.has(id)) problems.push(`${id} is listed now (#206): take it off the known gaps.`);
    else if (!recorded.has(id))
      problems.push(`${id} is no longer recorded (#206): take it off the known gaps.`);
  }
  return problems;
}

function parseTableRows(lines) {
  return lines
    .filter((line) => line.trim().startsWith('|') && !/^\|[\s\-|]+\|$/.test(line.trim()))
    .slice(1) // header row
    .map((line) => {
      const cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
      const [requirementCell, matrixCell, issueCell, testCell] = cells;
      return {
        requirementCell,
        requirementIds: expandRequirementIds(requirementCell),
        matrixCell,
        matrixIds: expandRequirementIds(matrixCell),
        issue: Number((issueCell.match(/#(\d+)/) || [])[1]) || null,
        test: testCell
      };
    });
}

// Parse docs/<module>-coverage.md: the intro before the first ##, one section
// per evidence table (browser/unit), and everything from the routing-status
// heading down as a raw-markdown tail.
export function parseCoverage(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let intro = [];
  let current = null;
  let tail = null;

  for (const line of lines) {
    if (tail !== null) {
      tail.push(line);
      continue;
    }
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      const title = heading[1];
      if (/routing status/i.test(title)) {
        tail = [line];
      } else {
        current = {
          heading: title,
          kind: /playwright|browser/i.test(title) ? 'browser' : 'unit',
          lines: []
        };
        sections.push(current);
      }
    } else if (current) {
      current.lines.push(line);
    } else if (!line.startsWith('# ')) {
      intro.push(line);
    }
  }

  return {
    intro: intro.join('\n').trim(),
    sections: sections.map(({ heading, kind, lines: sectionLines }) => ({
      heading,
      kind,
      rows: parseTableRows(sectionLines)
    })),
    tail: tail ? tail.join('\n').trim() : ''
  };
}

// Coverage markdown is written repo-relative (the doc lives at docs/); on the
// site those targets must point back at the repository. blob/HEAD follows the
// repo's default branch.
export function rewriteRelativeLinks(markdown, repoUrl, fromDir = 'docs') {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
    if (/^(https?:|mailto:|#)/.test(target)) return match;
    const resolved = path.posix.normalize(path.posix.join(fromDir, target));
    return `](${repoUrl}/blob/HEAD/${resolved})`;
  });
}

function statusChip(status, runUrl) {
  const label = { pass: 'pass', fail: 'fail', none: 'no record' }[status];
  const chip = `<span class="chip status-${status}">${label}</span>`;
  // Result chips link to the CI run that executed them when evidence.json
  // carries run provenance (#20/#21).
  if (runUrl && status !== 'none') {
    return `<a class="chip-link" href="${escapeHtml(runUrl)}" title="View the CI run that executed this test">${chip}</a>`;
  }
  return chip;
}

// Sub-page tabs shared by every renderer page (demo / evidence / API).
export function moduleTabs(active, hasGuide = false) {
  const tab = (id, href, label) =>
    id === active
      ? `<a class="current" aria-current="page" href="${href}">${label}</a>`
      : `<a href="${href}">${label}</a>`;
  return (
    `<nav class="page-tabs">` +
    tab('demo', 'index.html', 'Live demo') +
    (hasGuide ? tab('guide', 'guide.html', 'Clinical guide') : '') +
    tab('evidence', 'evidence.html', 'Test evidence') +
    tab('api', 'api.html', 'API reference') +
    `</nav>`
  );
}

function matchRecords(row, kind, records) {
  const suite = records.filter((record) => record.suite === kind);
  const byIds = () =>
    suite.filter((record) => record.requirementIds.some((id) => row.requirementIds.includes(id)));
  if (kind !== 'browser') return byIds();
  // Browser rows name their test; prefer that, but coverage-table wording can
  // drift from the spec name, so fall back to the shared requirement IDs.
  const byName = suite.filter((record) => record.test.includes(row.test));
  return byName.length ? byName : byIds();
}

function renderMatrixCell(row, matrixUrl) {
  if (!row.matrixIds.length) return mdInline(row.matrixCell);
  let cell = escapeHtml(row.matrixCell);
  for (const id of row.matrixIds) {
    cell = cell.replace(id, `<a href="${matrixUrl}">${id}</a>`);
  }
  return cell;
}

// Reviewed requirement text for a coverage row (#63). Source-matrix IDs carry
// the reviewed text, so they lead; a requirement-scheme ID that also resolves
// (non-histogram modules key both columns to the matrix) is appended. IDs the
// matrix does not enumerate (module-scheme behaviors) contribute nothing, so
// the cell degrades to IDs-only exactly as before the extract existed.
function requirementTexts(row, requirements) {
  const entries = [];
  const seen = new Set();
  for (const id of [...row.matrixIds, ...row.requirementIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const text = requirements[id];
    if (text) entries.push({ id, text });
  }
  return entries;
}

// Requirement cell (#63): the traceability IDs, then each resolvable
// requirement's reviewed text beneath them so a reviewer sees what is under
// test without opening the matrix. Falls back to the bare ID cell when no
// text resolves (no extract yet, or module-scheme-only rows).
function renderRequirementCell(row, requirements) {
  const ids = `<div class="req-ids">${escapeHtml(row.requirementCell)}</div>`;
  const texts = requirementTexts(row, requirements);
  if (!texts.length) return ids;
  const list = texts
    .map(
      ({ id, text }) =>
        `<p class="req-text"><span class="req-id">${escapeHtml(id)}</span> ${mdInline(text)}</p>`
    )
    .join('');
  return `${ids}<div class="req-texts">${list}</div>`;
}

function renderEvidenceCell(row, records, kind, runUrl) {
  const parts = [];
  if (kind === 'unit') {
    parts.push(`<p class="test-file">${mdInline(row.test)}</p>`);
  }
  if (!records.length) {
    parts.push(`<ul class="tests"><li>${statusChip('none')} ${mdInline(row.test)}</li></ul>`);
    return parts.join('\n');
  }
  const tests = records
    .map((record) => `<li>${statusChip(record.status, runUrl)} ${escapeHtml(record.test)}</li>`)
    .join('');
  parts.push(`<ul class="tests">${tests}</ul>`);
  const screenshots = [...new Set(records.flatMap((record) => record.screenshots))];
  if (screenshots.length) {
    const thumbs = screenshots
      .map(
        (file) =>
          `<a href="evidence/${file}"><img class="screenshot" src="evidence/${file}"` +
          ` alt="Evidence screenshot ${escapeHtml(file)}" loading="lazy"></a>`
      )
      .join('');
    parts.push(`<div class="screenshots">${thumbs}</div>`);
  }
  return parts.join('\n');
}

// Provenance fields (#20 contract): evidence.json optionally carries
// generatedAt (ISO string), environment ({os, node, playwright, chromium}),
// and run ({id, url} of the CI run, or null when generated locally). The
// report renders them when present and states their absence honestly when the
// committed evidence set predates the contract.
const NOT_RECORDED = '<span class="sub">Not recorded for this evidence set</span>';

function generatedFact(evidence) {
  if (!evidence.generatedAt) return NOT_RECORDED;
  const date = new Date(evidence.generatedAt);
  if (Number.isNaN(date.valueOf())) return escapeHtml(evidence.generatedAt);
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function environmentFact(evidence) {
  const env = evidence.environment;
  if (!env) return NOT_RECORDED;
  const parts = [
    env.os && escapeHtml(env.os),
    env.node && `node ${escapeHtml(env.node)}`,
    env.playwright && `playwright ${escapeHtml(env.playwright)}`,
    env.chromium && `chromium ${escapeHtml(env.chromium)}`
  ].filter(Boolean);
  return parts.length ? `<code>${parts.join(' · ')}</code>` : NOT_RECORDED;
}

function runFact(evidence) {
  if (evidence.run && evidence.run.url) {
    return (
      `<a href="${escapeHtml(evidence.run.url)}">Actions run` +
      (evidence.run.id ? ` #${escapeHtml(evidence.run.id)}` : '') +
      `</a>`
    );
  }
  if (evidence.run === null || evidence.generatedAt) {
    return '<span class="sub">Generated locally — no CI run recorded</span>';
  }
  return NOT_RECORDED;
}

// Humanize an evidence screenshot filename: "SH-CTRL-004-normal-range.png" →
// { id: 'SH-CTRL-004', caption: 'normal range' }.
function screenshotCaption(file) {
  const match = file.match(/^(SH-[A-Z]+-\d+[A-D]?)-(.+)\.png$/);
  if (!match) return { id: '', caption: file.replace(/\.png$/, '').replace(/-/g, ' ') };
  return { id: match[1], caption: match[2].replace(/-/g, ' ') };
}

// Evidence page (#21 pillar 2, reframed for v1.0): a qualification-style
// report — summary facts (scope, results, provenance), scope & approach,
// requirement-traceability tables joined to evidence.json, a captioned
// visual-evidence gallery, the routing-status appendix, and a reproduction
// note. Adopting groups should be able to review and adapt it as a basic
// audit artifact.
export function renderEvidencePage({ module, config, coverage, evidence, requirements = {} }) {
  const renderer = config.renderers.find((entry) => entry.module === module);
  const matrixUrl = `${config.matrixBaseUrl}/${renderer.matrix}`;
  const runUrl = evidence.run && evidence.run.url ? evidence.run.url : null;
  const html = [];

  const records = evidence.records || [];
  const browser = records.filter((record) => record.suite === 'browser');
  const unit = records.filter((record) => record.suite === 'unit');
  const failing = records.filter((record) => record.status === 'fail');
  const screenshots = [...new Set(records.flatMap((record) => record.screenshots))].sort();
  const coverageRows = coverage.sections.reduce((n, section) => n + section.rows.length, 0);
  const matrixIds = new Set(
    coverage.sections.flatMap((section) =>
      section.rows.flatMap((row) => [...row.requirementIds, ...row.matrixIds])
    )
  );

  html.push(`<h1>${escapeHtml(renderer.title)}: test evidence${experimentalBadge(renderer)}</h1>`);
  html.push(
    `<p class="tagline">Requirement-traced qualification evidence for the safety.viz` +
      ` <code>${escapeHtml(module)}</code> module.</p>`
  );
  html.push(moduleTabs('evidence', !!renderer.guide));
  html.push(
    `<p class="matrix-link"><a href="${matrixUrl}">Requirement matrix ↗</a>` +
      ` — the reviewed source specification these tests trace to.</p>`
  );

  html.push(
    `<dl class="facts">` +
      `<div class="fact"><dt>Scope</dt><dd>${coverageRows} coverage rows` +
      `<span class="sub">${matrixIds.size} distinct requirement IDs</span></dd></div>` +
      `<div class="fact"><dt>Tests executed</dt><dd>${records.length} automated checks` +
      `<span class="sub">${browser.length} browser · ${unit.length} unit</span></dd></div>` +
      `<div class="fact"><dt>Result</dt><dd>${
        failing.length
          ? `${statusChip('fail', runUrl)} ${failing.length} failing`
          : `${statusChip('pass', runUrl)} all passing`
      }<span class="sub">${screenshots.length} evidence screenshots</span></dd></div>` +
      `<div class="fact"><dt>Generated</dt><dd>${generatedFact(evidence)}</dd></div>` +
      `<div class="fact"><dt>Environment</dt><dd>${environmentFact(evidence)}</dd></div>` +
      `<div class="fact"><dt>Test run</dt><dd>${runFact(evidence)}</dd></div>` +
      `</dl>`
  );

  html.push(`<h2 id="scope">Scope &amp; approach</h2>`);
  if (coverage.intro) html.push(mdBlock(rewriteRelativeLinks(coverage.intro, config.repoUrl)));
  html.push(
    `<p>Each table row traces one requirement to the automated test(s) that evidence it:` +
      ` the Requirement column shows the reviewed requirement text and its ID, the source-matrix` +
      ` rows link back to the specification, the issue column links the implementing work, and` +
      ` the result column shows the recorded` +
      ` outcome of every matching test from the committed` +
      ` <a href="${config.repoUrl}/blob/HEAD/docs/evidence/${module}/evidence.json">evidence.json</a>` +
      ` with its captured screenshots. Browser evidence is captured at fixed conditions` +
      ` (1280×800, device scale 1) on the canonical Linux CI environment.</p>`
  );

  for (const section of coverage.sections) {
    const sectionRecords = new Set(
      section.rows.flatMap((row) =>
        matchRecords(row, section.kind, records).map((record) => record.test)
      )
    );
    html.push(`<h2>${mdInline(section.heading)}</h2>`);
    html.push(
      `<p class="section-summary">${section.rows.length} requirement rows · ` +
        `${sectionRecords.size} tests</p>`
    );
    const rows = section.rows
      .map((row) => {
        const matched = matchRecords(row, section.kind, records);
        return (
          `<tr><td>${renderRequirementCell(row, requirements)}</td>` +
          `<td>${renderMatrixCell(row, matrixUrl)}</td>` +
          `<td><a href="${config.repoUrl}/issues/${row.issue}">#${row.issue}</a></td>` +
          `<td>${renderEvidenceCell(row, matched, section.kind, runUrl)}</td></tr>`
        );
      })
      .join('\n');
    html.push(
      `<div class="table-scroll">` +
        `<table class="evidence"><thead><tr><th>Requirement</th><th>Source matrix rows</th>` +
        `<th>Issue</th><th>Tests &amp; evidence</th></tr></thead><tbody>${rows}</tbody></table>` +
        `</div>`
    );
  }

  if (screenshots.length) {
    html.push(`<h2 id="visual-evidence">Visual evidence</h2>`);
    html.push(
      `<p class="section-summary">Every screenshot below is a committed baseline: the same PNG` +
        ` is the visual-regression baseline the browser suite asserts against and the evidence` +
        ` artifact shown here. Click any capture for the full-resolution image.</p>`
    );
    const figures = screenshots
      .map((file) => {
        const { id, caption } = screenshotCaption(file);
        return (
          `<li><figure><a href="evidence/${file}">` +
          `<img src="evidence/${file}" alt="Evidence screenshot: ${escapeHtml(caption)}" loading="lazy">` +
          `</a><figcaption>${id ? `<code>${id}</code> — ` : ''}${escapeHtml(caption)}</figcaption>` +
          `</figure></li>`
        );
      })
      .join('\n');
    html.push(`<ul class="evidence-gallery">${figures}</ul>`);
  }

  if (coverage.tail) {
    html.push(
      `<section class="routing">${mdBlock(rewriteRelativeLinks(coverage.tail, config.repoUrl))}</section>`
    );
  }

  html.push(
    `<section class="reproduce"><h2 id="reproduce">Reproducing this report</h2>` +
      `<p>The evidence set is regenerated from a full test run and committed with the code it` +
      ` qualifies; CI fails when they drift. To verify or rebuild it:</p>` +
      `<pre><code>npm ci\nnpm run evidence:check   # compare a fresh run against the committed evidence\nnpm run evidence         # regenerate docs/evidence/${module}/evidence.json</code></pre>` +
      `<p>Screenshot baselines are canonical to the Linux CI runner; the repository&#39;s` +
      ` <em>Update evidence baselines</em> workflow is the authoritative way to refresh them.` +
      ` See <a href="${config.repoUrl}/blob/HEAD/CONTRIBUTING.md">CONTRIBUTING.md</a> for the` +
      ` traceability convention.</p></section>`
  );

  return html.join('\n');
}

// Gallery (#21 pillar 1, reframed for v1.0 under site issue #21): the
// homepage tells the project story — lineage, architecture mirror, audience —
// then splits the renderer cards into the migrated set and the migration
// queue. Available renderers link to their pages with a dedicated hero asset
// when configured (site/assets/), falling back to the hero evidence
// screenshot.
export function renderGallery(config) {
  const availableCard = (renderer) => {
    const base = renderer.module;
    const hero = renderer.heroAsset
      ? `assets/${renderer.heroAsset}`
      : `${base}/evidence/${renderer.hero}`;
    return (
      `<li class="card status-available">` +
      `<a class="card-thumb" href="${base}/index.html">` +
      `<img src="${hero}" alt="${escapeHtml(renderer.title)} preview" loading="lazy">` +
      `</a><div class="card-body">` +
      `<h3><a href="${base}/index.html">${escapeHtml(renderer.title)}</a>` +
      `${experimentalBadge(renderer)}</h3>` +
      `<p>${escapeHtml(renderer.blurb)}</p>` +
      `<p class="card-links"><a href="${base}/index.html">Demo</a> · ` +
      `<a href="${base}/evidence.html">Evidence</a> · ` +
      `<a href="${base}/api.html">API</a></p>` +
      `</div></li>`
    );
  };

  const available = config.renderers.filter((renderer) => renderer.status === 'available');
  const queued = config.renderers.filter((renderer) => renderer.status !== 'available');

  // Gallery-first layout (#29, option D): the two-sentence intro, then the
  // cards are the page. The migration queue compresses to a one-line strip —
  // each queued title links its reviewed requirement matrix.
  const queueLinks = queued
    .map(
      (renderer) =>
        `<a href="${config.matrixBaseUrl}/${renderer.matrix}">${escapeHtml(renderer.title)}</a>`
    )
    .join(' · ');

  const html = [];
  html.push(
    `<h1>safety.viz</h1>`,
    `<p class="tagline home-intro">safety.viz is a charting library for monitoring clinical` +
      ` trial safety. It&#39;s an <a href="https://jwildfire.github.io/keynote/">agent-assisted` +
      ` update</a> of the <a href="https://github.com/SafetyGraphics">safetyGraphics</a>` +
      ` framework.</p>`,
    `<h2>Available renderers <span class="gallery-count">${available.length} of ` +
      `${config.renderers.length} migrated</span></h2>`,
    `<ul class="gallery gallery-lead">${available.map(availableCard).join('\n')}</ul>`,
    `<p class="queue-strip">In the queue: ${queueLinks} — each already has a` +
      ` <a href="${config.repoUrl}/tree/HEAD/requirements">reviewed requirement matrix</a>` +
      ` in this repo.</p>`
  );
  return html.join('\n');
}

// Each safety.viz module traces to the Rho, Inc. repository it re-implements;
// module names were normalized during migration, so the mapping is explicit.
// Bare names live under the RhoInc org; originals hosted elsewhere (e.g. the
// SafetyGraphics hep-explorer) are stored as full URLs.
const ORIGINAL_REPOS = {
  histogram: 'safety-histogram',
  'outlier-explorer': 'safety-outlier-explorer',
  'results-over-time': 'safety-results-over-time',
  'shift-plot': 'safety-shift-plot',
  'delta-delta': 'safety-delta-delta',
  'hep-explorer': 'https://github.com/SafetyGraphics/hep-explorer',
  'paneled-outlier-explorer': 'paneled-outlier-explorer',
  'ae-explorer': 'aeexplorer',
  'ae-timelines': 'ae-timelines',
  'web-codebook': 'web-codebook'
};

// About page (#21): the keynote/project story, the safetyGraphics lineage,
// and full attribution for the original RhoInc renderers.
export function renderAboutPage(config) {
  const first = config.renderers.find((renderer) => renderer.status === 'available');
  const evidenceRef = first
    ? `<a href="${first.module}/evidence.html">test-evidence report</a>`
    : 'test-evidence report';
  const creditRows = config.renderers
    .map((renderer) => {
      const repo = ORIGINAL_REPOS[renderer.module];
      const repoUrl =
        repo && repo.startsWith('https://') ? repo : `https://github.com/RhoInc/${repo}`;
      const repoCell = repo
        ? `<a href="${repoUrl}"><code>${repoUrl.split('/').pop()}</code></a>`
        : '—';
      const here =
        renderer.status === 'available'
          ? `<a href="${renderer.module}/index.html">${escapeHtml(renderer.title)}</a>`
          : escapeHtml(renderer.title);
      return (
        `<tr><td>${repoCell}</td><td>${here} ` +
        `<span class="badge badge-${renderer.status}">${renderer.status}</span></td>` +
        `<td>${escapeHtml(renderer.blurb)}</td></tr>`
      );
    })
    .join('\n');

  return [
    `<h1>About safety.viz</h1>`,
    `<p class="tagline">An agentic rebuild of the safetyGraphics interactive renderers,` +
      ` documented in the open for R/Pharma 2026.</p>`,

    `<h2 id="project">The project</h2>`,
    `<p>safety.viz is one workstream of a larger experiment: modernizing the safetyGraphics` +
      ` clinical-safety graphics ecosystem with AI agents doing the engineering — requirements,` +
      ` tests, implementation, and this site — under human review, with every requirement,` +
      ` design decision, and release tracked in public. The build is the subject of a` +
      ` developer-diary keynote at R/Pharma 2026; the running story lives on the` +
      ` <a href="${config.hubUrl}">obot roadmap</a>.</p>`,
    `<p>The working method is deliberately conservative for safety software: each renderer` +
      ` starts from a` +
      ` <a href="${config.repoUrl}/tree/HEAD/requirements">reviewed requirement matrix</a>,` +
      ` extracted from the` +
      ` original renderer&#39;s documented behavior; development is red-green (a failing,` +
      ` requirement-keyed test first, then the minimal change); and a renderer only counts as` +
      ` migrated when its live demo, requirement-traced ${evidenceRef}, and generated API` +
      ` reference are all on this site. The R-side companion,` +
      ` <a href="https://github.com/jwildfire/gsm.safety">gsm.safety</a>, wraps the same` +
      ` committed bundle as <code>Widget_*</code> htmlwidgets, mirroring how` +
      ` <a href="https://github.com/Gilead-BioStats/gsm.kri">gsm.kri</a> consumes` +
      ` <a href="https://github.com/Gilead-BioStats/rbm-viz">gsm.viz</a> in the OpenRBQM` +
      ` ecosystem.</p>`,
    `<p>The audience is anyone who reviews clinical-trial safety data — medical monitor,` +
      ` biostatistician, or data scientist. For each migrated renderer, the proof is on this` +
      ` site: a live demo against real example data, an audit-style test-evidence report, and` +
      ` a generated API reference.</p>`,

    `<h2 id="lineage">Lineage</h2>`,
    `<p>The charts themselves are not new — that is the point. Each renderer re-implements an` +
      ` interactive display designed, reviewed, and used in practice under the` +
      ` <a href="https://github.com/SafetyGraphics">safetyGraphics</a> project, the open-source` +
      ` framework for clinical-trial safety monitoring that grew out of the ASA Biopharm / DIA` +
      ` Safety Working Group&#39;s Interactive Safety Graphics task force. The original` +
      ` implementations were built by the open-source team at` +
      ` <a href="https://github.com/RhoInc">Rho, Inc.</a> on their` +
      ` <a href="https://github.com/RhoInc/Webcharts">Webcharts</a> D3 library. safety.viz ports` +
      ` that behavior onto maintained <a href="https://www.chartjs.org/">Chart.js</a>, preserving` +
      ` each chart&#39;s clinical intent while adding JSON-Schema data contracts and` +
      ` requirement-traced evidence.</p>`,

    `<h2 id="credits">Original renderers</h2>`,
    `<p>Full credit to the original authors — each safety.viz module traces to one of these` +
      ` open-source Rho, Inc. repositories:</p>`,
    `<div class="table-scroll"><table class="renderer-credits">` +
      `<thead><tr><th>Original renderer</th><th>In safety.viz</th><th>What it shows</th></tr></thead>` +
      `<tbody>${creditRows}</tbody></table></div>`,
    `<p>If you use these displays in your own work, please also cite the safetyGraphics` +
      ` project and the original repositories above.</p>`
  ].join('\n');
}

// Architecture page (#21): the technical overview — pipeline, data-contract
// philosophy, module anatomy, the shared shell, and the quality machinery.
export function renderArchitecturePage({ config, version }) {
  const first = config.renderers.find((renderer) => renderer.status === 'available');
  const apiHref = first ? `${first.module}/api.html` : null;
  const apiLink = (label) => (apiHref ? `<a href="${apiHref}">${label}</a>` : label);
  return [
    `<h1>Architecture</h1>`,
    `<p class="tagline">One bundle, one shared shell, one data contract per chart — built to be` +
      ` embedded anywhere JavaScript or R can reach.</p>`,

    `<h2 id="overview">The big picture</h2>`,
    `<p>safety.viz mirrors the architecture proven by OpenRBQM&#39;s` +
      ` <a href="https://github.com/Gilead-BioStats/gsm.kri">gsm.kri</a> ↔` +
      ` <a href="https://github.com/Gilead-BioStats/rbm-viz">gsm.viz</a> pairing: a plain` +
      ` JavaScript charting library (this repository) owns all rendering, and a thin R package` +
      ` (<a href="https://github.com/jwildfire/gsm.safety">gsm.safety</a>) wraps the committed` +
      ` bundle as htmlwidgets. The JavaScript side never knows about R; the R side never draws.</p>`,
    `<ol class="pipeline">` +
      `<li><strong>Data contract</strong> — every module publishes a JSON Schema` +
      ` (<a href="${config.repoUrl}/tree/HEAD/src/data/schema">src/data/schema/</a>) describing its` +
      ` long-format input records and settings mapping. The same schema validates data at the` +
      ` boundary at runtime and generates the API reference&#39;s data-contract table.</li>` +
      `<li><strong>Module</strong> — a factory (for example` +
      ` ${apiLink('<code>histogram(element, settings)</code>')}) that mounts` +
      ` into any container. Settings merge onto the module&#39;s defaults, so callers supply only` +
      ` overrides. Internals follow the gsm.viz-style flow: <code>checkInputs</code> →` +
      ` <code>configure</code> → <code>structureData</code> → <code>getScales</code> /` +
      ` <code>getPlugins</code> → <code>new Chart</code>.</li>` +
      `<li><strong>Shared shell</strong> — <code>src/shell.js</code> renders the chrome every` +
      ` renderer shares by construction: a collapsible <code>sv-</code>-prefixed control sidebar` +
      ` beside a main column of chart, footnote, small-multiples, and listing slots.</li>` +
      `<li><strong>Charts</strong> — rendering is <a href="https://www.chartjs.org/">Chart.js 4</a>` +
      ` with module-scoped plugins (normal-range overlay, annotations, selection styling) —` +
      ` no bespoke SVG layer to maintain.</li>` +
      `<li><strong>Committed bundle</strong> — esbuild emits versioned IIFE and ESM bundles to` +
      ` <code>dist/safety.viz-${escapeHtml(version)}/</code>, committed to the repository so` +
      ` consumers (and this site&#39;s demos) pin exactly the artifact that was tested. CI fails` +
      ` when <code>dist/</code> drifts from <code>src/</code>.</li>` +
      `<li><strong>R bindings</strong> — gsm.safety vendors the same IIFE bundle as` +
      ` <code>Widget_*</code> htmlwidgets, completing the gsm.kri ↔ gsm.viz mirror.</li>` +
      `</ol>`,

    `<h2 id="data-contract">The data-contract philosophy</h2>`,
    `<p>Clinical data rarely arrives renderer-shaped, so no column name is hard-coded. Each` +
      ` renderer names its inputs through a settings mapping whose defaults follow ADaM` +
      ` conventions (<code>STRESN</code>, <code>USUBJID</code>, <code>STNRLO</code>…): standard` +
      ` data works untouched, and anything else is one mapping away. Validation happens once, at` +
      ` the boundary — missing required columns throw with a rendered message, missing or` +
      ` non-numeric results are removed with a reported count, and optional columns degrade` +
      ` gracefully (the normal-range control, for instance, hides for measures without normal` +
      ` data). The JSON Schema is the single source of truth: runtime validation, the generated` +
      ` API data-contract table, and the requirement matrix all key to it.</p>`,

    `<h2 id="module-anatomy">Module anatomy</h2>`,
    `<p>Every module exposes the same lifecycle, kept shape-compatible with the original` +
      ` safetyGraphics renderers: <code>init(data)</code> / <code>setData(data)</code> to bind and` +
      ` draw, <code>setSettings(overrides)</code> to re-normalize and rebuild,` +
      ` <code>render()</code> to redraw from current state, <code>resize()</code> for host layouts` +
      ` that change container size without a window resize (the R htmlwidget case), and` +
      ` <code>destroy()</code> to tear down every Chart.js instance. The full per-module surface` +
      ` is documented on each ${apiLink('API reference')} page, generated from` +
      ` JSDoc — the build fails on undocumented public surface.</p>`,

    `<h2 id="shell">How a renderer plugs into the shell</h2>`,
    `<p>A module never rolls its own layout. It calls <code>renderShell(element)</code>, which` +
      ` empties the container and returns named slots — controls, chart canvas, annotation,` +
      ` footnote, small-multiples, listing — then declares its control panel with the bound` +
      ` <code>controlBuilders</code> helpers (sections, rows, labeled inputs) and draws into the` +
      ` main-column slots. One stylesheet is injected per document by whichever module mounts` +
      ` first, and the browser suite enforces per available renderer that its demo renders this` +
      ` shared chrome. The same parts are exported from the bundle as the` +
      ` <a href="kit/index.html">kit</a>, so a second chart library on the page builds from` +
      ` them instead of copying them.</p>`,

    `<h2 id="quality">Quality machinery</h2>`,
    `<p>Each migration starts from a` +
      ` <a href="${config.repoUrl}/tree/HEAD/requirements">reviewed requirement matrix</a>;` +
      ` matrix rows route to` +
      ` unit (Vitest) or browser (Playwright) tests whose names carry the requirement IDs. The` +
      ` evidence pipeline replays both suites and commits results plus screenshots to` +
      ` <a href="${config.repoUrl}/tree/HEAD/docs/evidence">docs/evidence/</a>, which this site` +
      ` joins into each module&#39;s ${first ? `<a href="${first.module}/evidence.html">qualification report</a>` : 'qualification report'}.` +
      ` The site build itself fails on broken links or missing screenshots, so a bad page cannot` +
      ` publish.</p>`
  ].join('\n');
}

function paramsTable(params) {
  if (!params || !params.length) return '';
  const rows = params
    .map(
      (param) =>
        `<tr><td><code>${escapeHtml(param.name)}</code>${param.optional ? ' <em>(optional)</em>' : ''}</td>` +
        `<td><code>${escapeHtml(param.type)}</code></td>` +
        `<td>${param.default === null ? '—' : `<code>${escapeHtml(param.default)}</code>`}</td>` +
        `<td>${escapeHtml(param.description)}</td></tr>`
    )
    .join('');
  return (
    `<table class="api"><thead><tr><th>Param</th><th>Type</th><th>Default</th>` +
    `<th>Description</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function methodSection(method) {
  const parts = [
    `<h3 id="${escapeHtml(method.name)}"><code>${escapeHtml(method.signature)}</code></h3>`,
    `<p>${escapeHtml(method.description)}</p>`,
    paramsTable(method.params)
  ];
  if (method.returns) {
    parts.push(
      `<p class="returns"><strong>Returns:</strong> <code>${escapeHtml(method.returns.type)}</code>` +
        ` — ${escapeHtml(method.returns.description)}</p>`
    );
  }
  return parts.filter(Boolean).join('\n');
}

// API page (#21 pillar 3, reframed for v1.0): rendered straight from the
// _api/<module>.json artifact (scripts/api/build-api-data.mjs, #6) — a
// module-anatomy overview, then factory, methods, settings, and the
// schema-derived data contract, with a sticky sidebar table of contents.
export function renderApiPage(
  model,
  { hasGuide = false, experimental = false, prototype = false } = {}
) {
  const toc =
    `<nav class="api-toc" aria-label="On this page"><h2>On this page</h2><ul>` +
    `<li><a href="#overview">Overview</a></li>` +
    `<li><a href="#factory"><code>${escapeHtml(model.factory.name)}()</code></a></li>` +
    `<li><a href="#methods">Methods</a><ul>` +
    model.methods
      .map(
        (method) =>
          `<li><a href="#${escapeHtml(method.name)}"><code>${escapeHtml(method.name)}()</code></a></li>`
      )
      .join('') +
    `</ul></li>` +
    `<li><a href="#settings">Settings</a></li>` +
    `<li><a href="#data-contract">Data contract</a></li>` +
    `</ul></nav>`;

  const body = [];
  body.push(
    `<section id="overview"><h2>Overview</h2>` +
      `<p>Every safety.viz renderer is one factory call. <code>${escapeHtml(model.factory.name)}(element, settings)</code>` +
      ` empties the container, renders the <a href="../architecture.html">shared control shell</a>,` +
      ` and returns a chart instance; pass data to <code>setData</code> (or <code>init</code>) and the` +
      ` module validates it against its <a href="#data-contract">data contract</a>, structures it, and` +
      ` draws. Settings are merged onto the module&#39;s defaults, so callers supply only overrides —` +
      ` column mappings follow ADaM naming out of the box. The same lifecycle` +
      ` (<code>${model.methods.map((method) => escapeHtml(method.name)).join('</code>, <code>')}</code>)` +
      ` is shared by every module and consumed unchanged by the gsm.safety R bindings.` +
      ` See <a href="../architecture.html">Architecture</a> for how the pieces fit together.` +
      ` The shared parts it is built from are public surface of their own, listed in the` +
      ` <a href="../kit/index.html">kit reference</a>.</p>` +
      `</section>`
  );
  body.push(`<h2 id="factory">Factory</h2>`, methodSection(model.factory));
  body.push(`<h2 id="methods">Methods</h2>`, ...model.methods.map(methodSection));

  const settingsRows = model.settings
    .map(
      (setting) =>
        `<tr><td><code>${escapeHtml(setting.name)}</code></td>` +
        `<td><code>${escapeHtml(setting.type)}${setting.nullable ? ' | null' : ''}</code></td>` +
        `<td>${setting.default === null ? '—' : `<code>${escapeHtml(setting.default)}</code>`}</td>` +
        `<td>${escapeHtml(setting.description)}</td></tr>`
    )
    .join('');
  body.push(
    `<h2 id="settings">Settings</h2>`,
    `<div class="table-scroll"><table class="api"><thead><tr><th>Setting</th><th>Type</th><th>Default</th>` +
      `<th>Description</th></tr></thead><tbody>${settingsRows}</tbody></table></div>`
  );

  const contract = model.dataContract;
  const fieldRows = contract.fields
    .map(
      (field) =>
        `<tr><td><code>${escapeHtml(field.name)}</code></td>` +
        `<td><code>${escapeHtml(field.type)}</code></td>` +
        `<td>${field.required ? 'yes' : 'no'}</td>` +
        `<td>${field.default === null ? '—' : `<code>${escapeHtml(field.default)}</code>`}</td>` +
        `<td>${escapeHtml(field.description)}</td></tr>`
    )
    .join('');
  body.push(
    `<h2 id="data-contract">Data contract</h2>`,
    `<h3>${escapeHtml(contract.title)}</h3>`,
    `<p>${escapeHtml(contract.description)}</p>`,
    `<div class="table-scroll"><table class="api"><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Default</th>` +
      `<th>Description</th></tr></thead><tbody>${fieldRows}</tbody></table></div>`
  );

  const html = [];
  html.push(
    `<h1><code>${escapeHtml(model.module)}</code> API reference${experimentalBadge({ experimental, prototype })}</h1>`
  );
  html.push(
    `<p class="tagline">Generated from the module&#39;s JSDoc and JSON-Schema data contract` +
      ` — <code>npm run docs:api</code> fails on undocumented surface.</p>`
  );
  html.push(moduleTabs('api', hasGuide));
  html.push(`<div class="api-layout">${toc}<div class="api-body">${body.join('\n')}</div></div>`);
  return html.join('\n');
}

// Kit page (#154, obot.roadmap#354): the API reference for the shared parts
// the bundle exports as `kit`. Built from the _api/kit.json artifact
// (scripts/api/kit.mjs) — member names, signatures, descriptions, source
// modules and the Chart.js facts all come from there. What is written here is
// the framing a reader needs around that list: how to load the bundle beside
// another library, what the contract promises, and what was left out on
// purpose.

// A heading and one line for each source the kit re-exports from. A source
// with no entry falls back to its file path, so a new one still renders.
const KIT_GROUPS = {
  'chart.js': {
    id: 'chart',
    title: 'Chart.js',
    blurb: 'The constructor the bundle contains, so a second library draws with the same copy.'
  },
  'src/shell.js': {
    id: 'shell',
    title: 'Shell and controls',
    blurb:
      'The collapsible control sidebar, the slots a chart draws into, and the control builders.'
  },
  'src/filters.js': {
    id: 'filters',
    title: 'Filters',
    blurb:
      'The filter contract: what a filter spec means, its opening state, its control and its test.'
  },
  'src/axis-limits.js': {
    id: 'axis-limits',
    title: 'Axis limits',
    blurb: 'The Lower and Upper inputs that show the limit in force and keep only what was edited.'
  },
  'src/histogram/listing.js': {
    id: 'listing',
    title: 'Record listing',
    blurb: 'The linked listing, with its search, sort, paging and CSV functions.'
  },
  'src/profile-host.js': {
    id: 'participant-rail',
    title: 'Participant rail',
    blurb: 'What a host chart calls to open the participant profile beside itself.'
  },
  'src/box-whisker.js': {
    id: 'box-drawing',
    title: 'Box drawing',
    blurb: 'Box-and-whisker marks on a Chart.js canvas, and the plugin that draws them.'
  },
  'src/measure-list.js': {
    id: 'measure-list',
    title: 'Measure list',
    blurb: 'Which measures a Measure control offers, and in what order.'
  },
  'src/time-to-event/km.js': {
    id: 'kaplan-meier',
    title: 'Kaplan–Meier estimator',
    blurb: 'The estimator behind the Time-to-Event Explorer.'
  }
};

// Members whose promise is narrower than the rest of the kit's (#193). The
// Kaplan–Meier estimator is the Time-to-Event Explorer's, which ships
// Experimental until an external clinical review confirms the implementation
// (obot.roadmap#182): it is on the kit, and follows that status.
const KIT_STATUS = {
  kmEstimate: {
    contract:
      `<code>kmEstimate</code> follows the Time-to-Event Explorer&#39;s Experimental status,` +
      ` which holds until an external clinical review confirms its Kaplan–Meier implementation` +
      ` (<a href="https://github.com/jwildfire/obot.roadmap/issues/182">obot.roadmap#182</a>):` +
      ` its estimates, intervals and at-risk counts may change after that review without` +
      ` counting as a breaking change. Its name and its arguments are kept.`,
    // A function: the badge's wording is defined further down this file.
    row: () =>
      `Follows the Time-to-Event Explorer&#39;s` +
      ` <span class="site-badge" title="${STATUS_MEANING.experimental}">Experimental</span>` +
      ` status: see <a href="#contract">what is promised</a>.`
  }
};

const kitGroupMeta = (source) =>
  KIT_GROUPS[source] || { id: slugify(source), title: source, blurb: '' };

const codeList = (names) => names.map((name) => `<code>${escapeHtml(name)}</code>`).join(', ');

/**
 * The kit's API reference page: how a second library loads and reaches the
 * kit, what the contract promises, then every member grouped by the module it
 * comes from, with its signature and what it does.
 * @param {Object} model The _api/kit.json artifact (scripts/api/kit.mjs::buildKitModel).
 * @param {Object} options Page options.
 * @param {string} options.repoUrl The repository URL, for links to the source files.
 * @param {string} options.version The package version, which names the committed bundle's folder.
 * @returns {string} The page content, for the shared shell.
 */
export function renderKitPage(model, { repoUrl, version }) {
  const bundleDir = `dist/safety.viz-${version}`;
  const modules = model.groups.filter((group) => group.source !== 'chart.js').length;
  const { chart } = model;
  const since = model.since ? `from v${escapeHtml(model.since)}` : 'from this release';

  const toc =
    `<nav class="api-toc" aria-label="On this page"><h2>On this page</h2><ul>` +
    `<li><a href="#overview">Overview</a></li>` +
    `<li><a href="#loading">Loading it</a></li>` +
    `<li><a href="#contract">What is promised</a></li>` +
    `<li><a href="#members">Members</a><ul>` +
    model.groups
      .map((group) => {
        const meta = kitGroupMeta(group.source);
        return `<li><a href="#${meta.id}">${escapeHtml(meta.title)}</a></li>`;
      })
      .join('') +
    `</ul></li>` +
    `<li><a href="#not-in-the-kit">Not in the kit</a></li>` +
    `</ul></nav>`;

  const scriptExample = [
    `<script src="${bundleDir}/safety.viz.js"></script>`,
    `<script src="your-library.js"></script>`,
    `<script>`,
    `  const { renderShell, renderFilterControl, Chart } = SafetyViz.kit;`,
    `</script>`
  ].join('\n');
  const moduleExample = [
    `import { kit } from './${bundleDir}/safety.viz.esm.js';`,
    `const { renderShell, renderFilterControl, Chart } = kit;`
  ].join('\n');

  const body = [];
  body.push(
    `<section id="overview"><h2>Overview</h2>` +
      model.description
        .split(/\n\s*\n/)
        .map((paragraph) => `<p>${mdInline(paragraph.replace(/\s+/g, ' ').trim())}</p>`)
        .join('') +
      `</section>`
  );

  body.push(
    `<h2 id="loading">Loading it beside another library</h2>`,
    `<p>The kit is part of the safety.viz bundle, so there is nothing else to load. Put` +
      ` safety.viz first, then the library that builds on it:</p>`,
    `<pre><code>${escapeHtml(scriptExample)}</code></pre>`,
    `<p>Or, from the ES module bundle:</p>`,
    `<pre><code>${escapeHtml(moduleExample)}</code></pre>`,
    `<ul>` +
      `<li>One file is needed: <code>${bundleDir}/safety.viz.js</code> for a script tag, or` +
      ` <code>safety.viz.esm.js</code> from the same folder for an import. The` +
      ` <code>.map</code> file beside each is its source map and is optional.</li>` +
      `<li>Use one bundle on a page, not both. The script-tag bundle and the ES module bundle` +
      ` are separate copies, each with its own Chart.js.</li>` +
      `<li>Take everything from that one copy. A library that brings its own Chart.js, or its` +
      ` own copy of these functions, draws charts and controls that drift from safety.viz&#39;s.</li>` +
      (chart
        ? `<li><code>kit.Chart</code> is Chart.js ${escapeHtml(chart.version)} with what the` +
          ` charts registered on it: the ${codeList(chart.registered.controllers)} controllers,` +
          ` the ${codeList(chart.registered.elements)} elements, the` +
          ` ${codeList(chart.registered.scales)} scales, and the` +
          ` ${codeList(chart.registered.plugins)} plugins. A chart of one of those types needs` +
          ` nothing more; anything else is registered on the same constructor with` +
          ` <code>kit.Chart.register()</code>.</li>`
        : '') +
      `<li>A working page built this way is the fixture the browser tests drive,` +
      ` <a href="${repoUrl}/blob/HEAD/tests/e2e/fixtures/kit.html">tests/e2e/fixtures/kit.html</a>:` +
      ` a sidebar, a filter, a bar chart, a record listing and the participant rail, from the` +
      ` kit alone.</li>` +
      `</ul>`
  );

  body.push(
    `<h2 id="contract">What is promised</h2>`,
    `<ul>` +
      `<li>The kit is public surface ${since}: a change to any member, whether its name, its` +
      ` signature, what it returns or the elements and class names it produces, is a breaking` +
      ` change, and the release notes say so.</li>` +
      `<li>Every member is the function the charts in the bundle call, not a copy or a wrapper,` +
      ` so a page built from the kit behaves as the charts do. Unit tests hold each member to` +
      ` its module&#39;s export, and browser tests build a page from the committed bundle and` +
      ` the kit alone.</li>` +
      `<li>The kit is flat and frozen: members sit directly on it under the names below, and a` +
      ` library on the page cannot replace, add or remove one.</li>` +
      `<li>Adding a member is not a breaking change.</li>` +
      Object.values(KIT_STATUS)
        .map((status) => `<li>${status.contract}</li>`)
        .join('') +
      (Object.keys(KIT_STATUS).length
        ? `<li>The other ${model.count - Object.keys(KIT_STATUS).length} members are public surface in full.</li>`
        : '') +
      `</ul>`
  );

  body.push(
    `<h2 id="members">Members</h2>`,
    `<p>${model.count} members, grouped by where they come from. Each signature is read from` +
      ` the function itself.</p>`
  );
  for (const group of model.groups) {
    const meta = kitGroupMeta(group.source);
    const from =
      group.source === 'chart.js'
        ? `From <a href="https://www.chartjs.org/">Chart.js</a>` +
          (chart ? ` ${escapeHtml(chart.version)}` : '') +
          `.`
        : `From <a href="${repoUrl}/blob/HEAD/${group.source}"><code>${escapeHtml(group.source)}</code></a>.`;
    const rows = group.members
      .map(
        (member) =>
          `<tr id="${escapeHtml(member.name)}">` +
          `<td><code>${escapeHtml(member.signature)}</code></td>` +
          `<td>${mdInline(member.description)}` +
          (KIT_STATUS[member.name]
            ? ` <span class="kit-status">${KIT_STATUS[member.name].row()}</span>`
            : '') +
          `</td></tr>`
      )
      .join('');
    body.push(
      `<section class="kit-group" data-source="${escapeHtml(group.source)}" id="${meta.id}">` +
        `<h3>${escapeHtml(meta.title)}</h3>` +
        `<p class="section-summary">${from}${meta.blurb ? ` ${escapeHtml(meta.blurb)}` : ''}</p>` +
        `<div class="table-scroll"><table class="api"><thead><tr><th>Member</th>` +
        `<th>What it does</th></tr></thead><tbody>${rows}</tbody></table></div>` +
        `</section>`
    );
  }

  body.push(
    `<h2 id="not-in-the-kit">Not in the kit</h2>`,
    `<ul>` +
      `<li>The chart factories. <code>SafetyViz.histogram()</code> and the rest are the` +
      ` library&#39;s own public surface, documented on each chart&#39;s API reference; the kit` +
      ` is what they are built from.</li>` +
      `<li><code>prototypeBanner</code> and <code>experimentalBanner</code>, which` +
      ` <code>src/shell.js</code> also exports: their wording is safety.viz&#39;s own release` +
      ` status.</li>` +
      `<li><code>hexToRgba</code>, which <code>src/box-whisker.js</code> also exports: a colour` +
      ` helper private to the box drawing.</li>` +
      `<li>Everything else under <code>src/</code>: each chart&#39;s data preparation, scales` +
      ` and plugins stay internal and can change without notice.</li>` +
      `</ul>`
  );

  const html = [];
  html.push(`<div class="kit-page">`);
  html.push(`<h1>Kit API reference</h1>`);
  html.push(
    `<p class="tagline">The parts every safety.viz chart is built from, exported for a second` +
      ` chart library on the same page. Generated from <code>src/kit.js</code> —` +
      ` <code>npm run docs:api</code> fails on an undocumented member.</p>`
  );
  html.push(
    `<dl class="facts">` +
      `<div class="fact"><dt>Members</dt><dd>${model.count}<span class="sub">from ${modules}` +
      ` shared modules and Chart.js</span></dd></div>` +
      `<div class="fact"><dt>Reached as</dt><dd><code>SafetyViz.kit</code><span class="sub">or` +
      ` the <code>kit</code> export of the ES module bundle</span></dd></div>` +
      (chart
        ? `<div class="fact"><dt>Draws with</dt><dd>Chart.js ${escapeHtml(chart.version)}` +
          `<span class="sub">the copy every chart in the bundle uses</span></dd></div>`
        : '') +
      `<div class="fact"><dt>Public surface</dt><dd>${since}<span class="sub">a change to a` +
      ` member is a breaking change</span></dd></div>` +
      `</dl>`
  );
  html.push(`<div class="api-layout">${toc}<div class="api-body">${body.join('\n')}</div></div>`);
  html.push(`</div>`);
  return html.join('\n');
}

// Demo page (#21 pillar 1, reworked under #15): the site shell around the
// recreated original renderer example — committed IIFE bundle + the vendored
// real example data (the renderer's `data` config key, defaulting to the
// shared ADBDS extract, #26). The .demo-page wrapper widens the layout
// (site.css) so the control sidebar and chart get full room.
// A small status pill for a page title / gallery card. A chart has one of three
// tiers, set in site/config.json (#165):
//
//   prototype     "Prototype": not ready for production. Shown on the docs site
//                 only; kept out of the portfolio manifest, and so out of the
//                 demo app and the Domains page; not counted a finished chart.
//   experimental  "Experimental": still being worked on, and fine to ship. In
//                 the manifest and the demo app; its behaviour and settings may
//                 change.
//   neither       stable: no pill.
//
// Prototype takes precedence when both are set. The pill's title says what the
// tier means, for whoever hovers it.
export const STATUS_MEANING = {
  prototype: 'Not ready for production: on the docs site only, and not in the demo app.',
  experimental: 'Still being worked on, and fine to use: its behaviour and settings may change.'
};
export function experimentalBadge(renderer) {
  if (renderer && renderer.prototype) {
    return ` <span class="site-badge site-badge-prototype" title="${STATUS_MEANING.prototype}">Prototype</span>`;
  }
  return renderer && renderer.experimental
    ? ` <span class="site-badge" title="${STATUS_MEANING.experimental}">Experimental</span>`
    : '';
}

export function renderDemoPage({ renderer, version }) {
  return (
    `<div class="demo-page">` +
    `<h1>${escapeHtml(renderer.title)}${experimentalBadge(renderer)}</h1>` +
    `<p class="tagline">${escapeHtml(renderer.blurb)}</p>` +
    moduleTabs('demo', !!renderer.guide) +
    `<p>This live demo mounts the committed` +
    ` <code>dist/safety.viz-${version}</code> IIFE bundle — the same asset gsm.safety vendors —` +
    ` against real example data (<code>${escapeHtml(renderer.data || 'adbds.csv')}</code>, built from the` +
    ` <a href="https://github.com/pharmaverse/pharmaverseadam">pharmaverseadam</a> CDISC Pilot 01 ADaM datasets), with the full control panel active.</p>` +
    `<div id="container"></div>` +
    `<script src="../dist/safety.viz-${version}/safety.viz.js"></script>` +
    `<script src="./demo.js"></script>` +
    `</div>`
  );
}

/**
 * The demo app's typefaces (#165): the font files its page declares, served
 * from the site itself so the page asks no other host for anything. Each is
 * the Latin subset of one face, from an npm package that carries the family
 * under the SIL Open Font License; other scripts fall back to system fonts.
 *
 *   family   the name the app's stylesheet asks for (src/app/styles.js)
 *   weight   the weight the file covers; a range for a variable font
 *   file     the file's name, in the package's files/ and beside the app
 *   package  the devDependency the site build copies it from
 *
 * One file per face and no unicode-range: a face split into subsets fetches
 * each subset when a character in it first appears, which for a user's own
 * file and column names is after a file is chosen (APP-LOAD-014).
 */
export const DEMO_APP_FONTS = [
  {
    family: 'Instrument Sans',
    weight: '400 700',
    file: 'instrument-sans-latin-wght-normal.woff2',
    package: '@fontsource-variable/instrument-sans'
  },
  {
    family: 'Instrument Serif',
    weight: '400',
    file: 'instrument-serif-latin-400-normal.woff2',
    package: '@fontsource/instrument-serif'
  },
  ...['400', '500', '600'].map((weight) => ({
    family: 'IBM Plex Mono',
    weight,
    file: `ibm-plex-mono-latin-${weight}-normal.woff2`,
    package: '@fontsource/ibm-plex-mono'
  }))
];

/** The directory beside the app's page that its font files are served from. */
const DEMO_APP_FONT_DIR = 'fonts';

/**
 * Copy the demo app's font files beside it, each family's licence with them.
 * @param {string} rootDir The repository root, whose node_modules holds the font packages.
 * @param {string} demoDir The app's directory in the site output.
 * @returns {string[]} Paths of the copied files: the fonts, then one licence per package.
 */
export function publishDemoAppFonts(rootDir, demoDir) {
  const fontDir = path.join(demoDir, DEMO_APP_FONT_DIR);
  mkdirSync(fontDir, { recursive: true });
  const packageDir = (name) => path.join(rootDir, 'node_modules', name);
  const copied = DEMO_APP_FONTS.map((font) => {
    const served = path.join(fontDir, font.file);
    copyFileSync(path.join(packageDir(font.package), 'files', font.file), served);
    return served;
  });
  for (const name of new Set(DEMO_APP_FONTS.map((font) => font.package))) {
    const served = path.join(fontDir, `LICENSE-${name.split('/').pop()}.txt`);
    copyFileSync(path.join(packageDir(name), 'LICENSE'), served);
    copied.push(served);
  }
  return copied;
}

/**
 * The demo app's page (#150, #152, obot.roadmap#352): a full-page web app with
 * its own header, so a standalone document and not a page in the docs shell.
 * The app bundle the site build writes beside it (scripts/build-app.mjs) draws
 * everything; this document loads it, the site's three type families and the
 * hex mark, and tells the app where the demo extracts and its links are.
 *
 * The typefaces are the site's own files (#165), fetched as the page opens:
 * each is preloaded, and every declared face is loaded at once rather than
 * when a weight is first used, so no request follows a user choosing a file.
 * @param {Object} options Page options.
 * @param {string} options.bundle File name of the app bundle beside the page.
 * @param {string} options.download File name of the single-file build beside the page.
 * @param {string} options.repoUrl The repository URL, for the app's source link.
 * @param {Array<{name: string, global: string, file: string}>} [options.libraries] Further chart libraries (#182): each bundle is loaded from beside the page after the app's and handed to the app when it mounts.
 * @param {string} [options.charts] What the app reviews a study in, for the page's description: its charts, counted.
 * @returns {string} The complete HTML document.
 */
export function renderDemoAppPage({
  bundle,
  download,
  repoUrl,
  libraries = [],
  charts = 'thirteen clinical safety charts'
}) {
  const icon = encodeURIComponent(LOGO_SVG).replace(/'/g, '%27');
  const js = (value) => `'${String(value).replace(/[\\']/g, '\\$&')}'`;
  const fontUrl = (font) => `./${DEMO_APP_FONT_DIR}/${font.file}`;
  const preloads = DEMO_APP_FONTS.map(
    (font) => `<link rel="preload" href="${fontUrl(font)}" as="font" type="font/woff2" crossorigin>`
  ).join('\n');
  const faces = DEMO_APP_FONTS.map(
    (font) =>
      `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${font.weight};` +
      `font-display:swap;src:url(${fontUrl(font)}) format("woff2")}`
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="The safety.viz demo app: load a study, check how its columns map, and review it in ${escapeHtml(charts)}. ${libraries.length ? 'Your study’s data stays in your browser, and the page fetches nothing from any other host unless you start R.' : 'It runs in your browser; nothing is uploaded.'}">
<title>safety.viz demo</title>
<link rel="icon" href="data:image/svg+xml,${icon}">
${preloads}
<style>
${faces}
body{margin:0;background:#fafaf8}
</style>
<script>if (document.fonts) document.fonts.forEach(function (face) { face.load(); });</script>
</head>
<body>
<div id="app"></div>
<noscript>The safety.viz demo app needs JavaScript: it reads and draws your data in this browser.</noscript>
<script src="./${escapeHtml(bundle)}"></script>
${libraries.map((library) => `<script src="./${escapeHtml(library.file)}"></script>\n`).join('')}<script>
window.__safetyVizApp = SafetyVizApp.mount('#app', {
  demo: { base: './' },${libraries.length ? `\n  libraries: ${librariesExpression(libraries, { r: 'request' })},\n  pitch: ${js(HOSTED_PITCH)},` : ''}
  links: {
    docs: '../index.html',
    domains: '../domains/index.html',
    download: ${js(`./${download}`)},
    github: ${js(repoUrl)}
  }
});
</script>
</body>
</html>
`;
}

// Build the guide's on-page table of contents from its ## sections and their
// ### subsections, nested one level (mirroring the API page's sticky TOC). The
// ids come from extractHeadings, so they match mdBlock's heading ids exactly.
function renderGuideToc(headings) {
  const entries = headings.filter((heading) => heading.level === 2 || heading.level === 3);
  if (!entries.length) return '';
  let html = '<ul>';
  let openSub = false;
  let openTop = false;
  for (const { level, text, id } of entries) {
    const link = `<a href="#${id}">${mdInline(text)}</a>`;
    if (level === 2) {
      if (openSub) {
        html += '</ul>';
        openSub = false;
      }
      if (openTop) html += '</li>';
      html += `<li>${link}`;
      openTop = true;
    } else {
      if (!openSub) {
        html += '<ul>';
        openSub = true;
      }
      html += `<li>${link}</li>`;
    }
  }
  if (openSub) html += '</ul>';
  if (openTop) html += '</li>';
  html += '</ul>';
  return `<nav class="guide-toc" aria-label="On this page"><h2>On this page</h2>${html}</nav>`;
}

// Clinical guide (v1.2): an authored, per-renderer reviewer's guide rendered
// from docs/guides/<module>.md via mdBlock. Teaches the clinical reading of the
// graphic and cross-references the live controls. Opt-in through the config
// `guide` field, so only renderers that ship a guide get the tab. A standing
// non-diagnostic caution is rendered by the page itself, so every guide carries
// it regardless of the authored content. A sticky sidebar TOC (built from the
// authored ## / ### headings) sits beside the body for a long, step-based guide.
export function renderGuidePage({ renderer, config, guideMarkdown }) {
  const matrixUrl = `${config.matrixBaseUrl}/${renderer.matrix}`;
  const html = [];
  html.push(`<h1>${escapeHtml(renderer.title)}: clinical guide${experimentalBadge(renderer)}</h1>`);
  const tagline =
    renderer.guideTagline ||
    `How to read the ${renderer.title} to review participant liver safety, and where each step lives in the controls on this page.`;
  html.push(`<p class="tagline">${escapeHtml(tagline)}</p>`);
  html.push(moduleTabs('guide', matrixUrl, true));
  const caution =
    renderer.guideCaution ||
    'A drug-induced-liver-injury conclusion is a diagnosis of exclusion that requires evidence beyond what this graphic shows.';
  html.push(
    `<p class="guide-caution"><strong>Exploratory review aid, not a validated diagnostic tool.</strong>` +
      ` ${escapeHtml(caution)}</p>`
  );
  const toc = renderGuideToc(extractHeadings(guideMarkdown));
  const body = `<div class="guide-body">${mdBlock(guideMarkdown, { headingIds: true })}</div>`;
  html.push(toc ? `<div class="guide-layout">${toc}${body}</div>` : body);
  return html.join('\n');
}

// Domains page (#139, obot.roadmap#325): the standard domain set and what
// every chart reads from it, rendered from the portfolio manifest
// (src/data/portfolio.json) alone. tests/unit/portfolio/ holds the manifest to
// the charts' own data schemas, so the page inherits that agreement instead of
// restating any of it by hand. site/config.json contributes only the
// repository URL and which charts have site pages to link to.

const asList = (value) => [].concat(value);

// Comma-separated in-page links: to chart sections from [module, entry] pairs,
// and to domain sections from domain ids.
const chartLinks = (entries) =>
  entries
    .map(([module, entry]) => `<a href="#chart-${module}">${escapeHtml(entry.title)}</a>`)
    .join(', ');

const domainLinks = (ids, domains) =>
  ids.map((id) => `<a href="#domain-${id}">${escapeHtml(domains[id].label)}</a>`).join(', ');

// One domain: what a row is, the vendored demo extract that supplies it, the
// charts that cannot draw without it kept apart from those that only add it
// when supplied, and its columns.
function domainSection(id, domain, modules, repoUrl) {
  const feeds = modules.filter(([, entry]) => entry.domains.includes(id));
  const optional = modules.filter(([, entry]) => (entry.optionalDomains || []).includes(id));
  const rows = Object.entries(domain.columns)
    .map(
      ([name, column]) =>
        `<tr><td><code>${escapeHtml(name)}</code></td>` +
        `<td>${escapeHtml(column.label)}</td>` +
        `<td>${escapeHtml(column.description)}</td></tr>`
    )
    .join('');
  return (
    `<section class="domain" id="domain-${id}">` +
    `<h2>${escapeHtml(domain.label)} <code>${id}</code></h2>` +
    `<p class="tagline">${escapeHtml(domain.grain)}</p>` +
    `<ul>` +
    `<li>Demo extract: <a href="${repoUrl}/blob/HEAD/site/data/${escapeHtml(domain.demo)}">` +
    `<code>${escapeHtml(domain.demo)}</code></a></li>` +
    (feeds.length ? `<li>Charts it feeds: ${chartLinks(feeds)}</li>` : '') +
    (optional.length
      ? `<li>Charts that add it when it is supplied: ${chartLinks(optional)}</li>`
      : '') +
    `</ul>` +
    `<div class="table-scroll"><table><thead><tr><th>Column</th><th>Label</th>` +
    `<th>What it holds</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `</section>`
  );
}

// One row per column setting. Whether it is required comes second, so the mark
// stays in view on a phone, where the table scrolls sideways. A setting read
// from two tables (time-to-event's id_col) names both; a setting the chart's
// schema gives no default says so rather than printing null.
function settingRows(settings, domains) {
  return Object.entries(settings)
    .map(([key, setting]) => {
      const ids = asList(setting.domain);
      const column = setting.column === null ? null : domains[ids[0]].columns[setting.column];
      return (
        `<tr><td><code>${escapeHtml(key)}</code></td>` +
        `<td>${setting.required ? '<span class="badge">required</span>' : 'optional'}</td>` +
        (setting.column === null
          ? `<td>No default</td><td>—</td>`
          : `<td><code>${escapeHtml(setting.column)}</code></td>` +
            `<td>${column ? escapeHtml(column.label) : '—'}</td>`) +
        `<td>${domainLinks(ids, domains)}</td></tr>`
      );
    })
    .join('');
}

// One chart: links to its demo and API pages when the site has them (the data
// schema in the repository always exists), the domains it reads, its note, and
// its column settings. A chart outside the standard set names its own domains
// and maps no settings, so it gets no table — only a pointer to where its
// columns are documented.
//
// A chart of another library (#182) links to its pages on that library's own
// site (`site`) and has no data schema here; it names the tables it takes.
function chartSection(module, entry, { domains, hasPages, repoUrl, root, site = null }) {
  const links = (
    site
      ? [
          `<a href="${site}${module}/index.html">Live demo</a>`,
          `<a href="${site}${module}/api.html">API reference</a>`
        ]
      : [
          ...(hasPages
            ? [
                `<a href="${root}${module}/index.html">Live demo</a>`,
                `<a href="${root}${module}/api.html">API reference</a>`
              ]
            : []),
          `<a href="${repoUrl}/blob/HEAD/src/data/schema/${module}.json">Data schema</a>`
        ]
  ).join(' · ');
  const tables = Object.entries(entry.tables || {})
    .map(
      ([name, table]) =>
        `<code>${escapeHtml(name)}</code> from ${domainLinks([table.domain], domains)}` +
        (table.required ? '' : ', when supplied')
    )
    .join('; ');
  const external = entry.externalDomains || [];
  const optional = entry.optionalDomains || [];
  const reads =
    (tables ? `<li>Takes the tables: ${tables}</li>` : '') +
    (entry.domains.length ? `<li>Reads: ${domainLinks(entry.domains, domains)}</li>` : '') +
    (optional.length
      ? `<li>Also reads, when supplied: ${domainLinks(optional, domains)}</li>`
      : '') +
    (external.length
      ? `<li>Reads domains of its own: ` +
        `${external.map((id) => `<code>${escapeHtml(id)}</code>`).join(', ')}</li>`
      : '');
  const rows = settingRows(entry.settings, domains);
  return (
    `<section class="chart-needs" id="chart-${module}">` +
    `<h3>${escapeHtml(entry.title)}</h3>` +
    `<p class="card-links">${links}</p>` +
    `<ul>${reads}</ul>` +
    (entry.note ? `<p>${escapeHtml(entry.note)}</p>` : '') +
    (external.length && hasPages
      ? `<p>Its columns are listed under the` +
        ` <a href="${root}${module}/api.html#data-contract">data contract</a>` +
        ` on its API reference.</p>`
      : '') +
    (rows
      ? `<div class="table-scroll"><table><thead><tr><th>Setting</th><th>Required</th>` +
        `<th>Default column</th><th>What it holds</th><th>Read from</th></tr></thead>` +
        `<tbody>${rows}</tbody></table></div>`
      : '') +
    `</section>`
  );
}

/**
 * The Domains page: the standard domain set a study supplies, one section per
 * domain with its columns and the charts it feeds, then one section per chart
 * with the column settings it needs and which of them its schema requires.
 * A chart that reads domains outside the standard set would be listed last,
 * under its own heading, with no settings table; the manifest lists none since
 * the Patient Journey Explorer, a prototype, left it (#165).
 * @param {Object} options
 * @param {Object} options.manifest The portfolio manifest (src/data/portfolio.json).
 * @param {Object} options.config site/config.json: `repoUrl`, and `renderers` to tell which charts have demo and API pages to link.
 * @param {string} [options.root='../'] Prefix from the page to the site root; the page is built at domains/index.html.
 * @returns {string} The page content, for the shared shell.
 */
export function renderDomainsPage({ manifest, config, root = '../', libraries = [] }) {
  const { domains } = manifest;
  const domainIds = Object.keys(domains);
  // Other libraries' charts (#182) read the same domains, so they are counted
  // and named wherever the page says what the domains feed.
  const fromLibraries = libraries.map((library) => ({
    library,
    charts: Object.entries(library.manifest.modules)
  }));
  const modules = [
    ...Object.entries(manifest.modules),
    ...fromLibraries.flatMap(({ charts }) => charts)
  ];
  const standard = modules.filter(([, entry]) => !entry.externalDomains);
  const outside = modules.filter(([, entry]) => entry.externalDomains);
  const withPages = new Set(
    config.renderers
      .filter((renderer) => renderer.status === 'available')
      .map((renderer) => renderer.module)
  );
  const section = ([module, entry]) =>
    chartSection(module, entry, {
      domains,
      hasPages: withPages.has(module),
      repoUrl: config.repoUrl,
      root
    });

  const feeds = outside.length
    ? `${standard.length} of the ${modules.length}`
    : `all ${modules.length}`;
  const html = [];
  html.push(
    `<div class="domains-page">`,
    `<h1>Standard domain set</h1>`,
    `<p class="tagline">The standard domain set is the ${domainIds.length} tables a study` +
      ` supplies to safety.viz. Their column names are the ADaM-shaped defaults the charts` +
      ` already expect, so data in this shape feeds ${feeds} charts without renaming a` +
      ` column, and a column under another name` +
      ` is mapped through that chart&#39;s settings.</p>`,
    `<dl class="facts">` +
      `<div class="fact"><dt>Domains</dt><dd>${domainLinks(domainIds, domains)}</dd></div>` +
      `<div class="fact"><dt>Charts</dt><dd><a href="#charts">${standard.length} read the` +
      ` standard set</a>` +
      (outside.length
        ? `<span class="sub"><a href="#outside">${outside.length}` +
          ` ${outside.length === 1 ? 'reads' : 'read'} domains of its own</a></span>`
        : '') +
      `</dd></div>` +
      `<div class="fact"><dt>Manifest</dt><dd><a href="${root}portfolio.json">portfolio.json</a>` +
      `<span class="sub">The file this page is generated from, described by its` +
      ` <a href="${config.repoUrl}/blob/HEAD/src/data/schema/portfolio.json">JSON Schema</a>,` +
      ` in <a href="#format">format version ${escapeHtml(manifest.version)}</a>` +
      `</span></dd></div>` +
      `</dl>`,
    ...domainIds.map((id) => domainSection(id, domains[id], modules, config.repoUrl)),
    `<h2 id="charts">What each chart needs</h2>`,
    `<p>Each setting names the column a chart reads for one purpose, and defaults to the` +
      ` column shown. Required marks the settings the chart&#39;s own data schema lists as` +
      ` required; the rest are optional. A setting shown with no default reads no column until` +
      ` one is named, and the chart&#39;s API reference says what each setting does.</p>`,
    ...standard.filter(([module]) => manifest.modules[module]).map(section)
  );
  for (const { library, charts } of fromLibraries) {
    const groups = Object.values(library.manifest.groups || {}).map((group) => group.label);
    const heading = groups.length
      ? `${groups.join(', ')}, from ${library.name}`
      : `Charts from ${library.name}`;
    html.push(
      `<section class="library-charts" id="library-${slugify(library.name)}">` +
        `<h2>${escapeHtml(heading)}</h2>` +
        `<p>${charts.length} ${charts.length === 1 ? 'chart' : 'charts'} from` +
        ` <a href="${library.repository}">${escapeHtml(library.name)}</a>, a second chart library` +
        ` the demo app carries beside these and lists in a tab of its own. They read the` +
        ` standard domains through the same mapping, so a study mapped for the safety charts` +
        ` is mapped for them. Each links to its demo and its reference on` +
        ` <a href="${library.site}">${escapeHtml(library.name)}&#39;s site</a>.</p>` +
        `</section>`,
      ...charts.map(([module, entry]) =>
        chartSection(module, entry, {
          domains,
          hasPages: true,
          repoUrl: config.repoUrl,
          root,
          site: library.site
        })
      )
    );
  }
  if (outside.length) {
    html.push(
      `<h2 id="outside">Outside the standard set</h2>`,
      `<p>${outside.length} ${outside.length === 1 ? 'chart reads' : 'charts read'} domains the` +
        ` standard set does not supply, so no column settings are mapped for` +
        ` ${outside.length === 1 ? 'it' : 'them'} here.</p>`,
      ...outside.map(section)
    );
  }
  html.push(manifestFormatSection(manifest.version), `</div>`);
  return html.join('\n');
}

// The manifest's format (#181): what an entry can say, so that another chart
// library can publish its chart list in the same format and the demo app can
// list its charts beside these. The fields are described here in words; the
// JSON Schema linked from the lead is the exact statement.
function manifestFormatSection(version) {
  const field = (name, text) => `<li><code>${name}</code> ${text}</li>`;
  return (
    `<section class="manifest-format" id="format">` +
    `<h2>The manifest&#39;s format</h2>` +
    `<p>The manifest is written in format version ${escapeHtml(version)}. Version 2 lets a` +
    ` second chart library publish its own chart list in the same format, so the demo app can` +
    ` list its charts beside these, read from the same files through the same mapping. A` +
    ` library&#39;s chart list may leave out the domains: its charts read this standard set.` +
    ` The charts on this page use none of the fields version 2 adds, and each means what it` +
    ` meant in version 1. What a chart entry can say besides its domains and settings:</p>` +
    `<ul>` +
    field('library', 'names the chart library the chart comes from. Left out, it is safety.viz.') +
    field(
      'group',
      'names the group the chart is listed under: a standard domain, or one of the' +
        ' manifest&#39;s <code>groups</code>, each with the <code>label</code> on its tab and an' +
        ' <code>order</code> among such groups, which come after the domains. Left out, a chart' +
        ' is listed under the first domain it reads.'
    ) +
    field(
      'tables',
      'names the tables the chart&#39;s <code>init</code> takes when it takes several, each' +
        ' read from one standard domain and marked required or not. The chart is handed an' +
        ' object of those tables built from the loaded files, and an optional table with no' +
        ' file is left out of it.'
    ) +
    field(
      'unmappedSettings',
      'says what the chart is handed for a setting with nothing mapped: <code>"null"</code>,' +
        ' no column, as when it is left out; or <code>"omit"</code>, nothing at all, for a' +
        ' chart that refuses a null column setting.'
    ) +
    `</ul>` +
    `</section>`
  );
}

/**
 * Serve the portfolio manifest from the site root, byte for byte, so a URL can
 * quote exactly the file the bundle exports and the Domains page is built from.
 * @param {string} manifestFile Path of the manifest (src/data/portfolio.json).
 * @param {string} siteDir The site output directory.
 * @returns {string} Path of the served copy, `<siteDir>/portfolio.json`.
 */
export function publishManifest(manifestFile, siteDir) {
  const served = path.join(siteDir, 'portfolio.json');
  copyFileSync(manifestFile, served);
  return served;
}

// Gallery nav dropdown (#71): the top-level "Gallery" link keeps navigating to
// the gallery index, and an adjacent disclosure button reveals one link per
// available renderer straight to its demo page. The list is data-driven from
// the same config.renderers the gallery cards use, so a newly-migrated renderer
// appears automatically. Links carry the {{root}} mount-depth prefix (baked in
// here, not deferred to a token) so the menu resolves at site root and under
// /<module>/ sub-pages alike. Interaction/ARIA state is progressively enhanced
// by the shell's inline script; with no JavaScript the Gallery link and the
// hover/focus-revealed chart links stay reachable.
export function renderGalleryNav(renderers, root = '') {
  const items = renderers
    .filter((renderer) => renderer.status === 'available')
    .map(
      (renderer) =>
        `<li><a href="${root}${renderer.module}/index.html">` +
        `${escapeHtml(renderer.title)}</a></li>`
    )
    .join('');
  return (
    `<div class="nav-group">` +
    `<a href="${root}index.html">Gallery</a>` +
    `<button type="button" class="nav-disclosure" aria-expanded="false" ` +
    `aria-controls="gallery-menu" aria-label="Show charts">` +
    `<span class="nav-caret" aria-hidden="true"></span></button>` +
    `<ul id="gallery-menu" class="nav-menu">${items}</ul>` +
    `</div>`
  );
}

// Shared shell: replaces {{title}}, {{description}}, {{version}}, {{root}},
// {{galleryNav}}, and {{content}} tokens. {{root}} prefixes shell-level links so
// one shell serves pages at any depth; {{galleryNav}} is built from the passed
// renderer list (see renderGalleryNav) — empty when none are supplied.
export function renderShell({
  shell,
  title,
  content,
  root = '',
  version = '',
  description = '',
  renderers = []
}) {
  return shell
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{description}}', escapeHtml(description))
    .replaceAll('{{version}}', escapeHtml(version))
    .replaceAll('{{galleryNav}}', renderGalleryNav(renderers, root))
    .replaceAll('{{root}}', root)
    .replace('{{content}}', content);
}

function walkHtmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) return walkHtmlFiles(file);
    return entry.endsWith('.html') ? [file] : [];
  });
}

// Build validation (#7): every internal href/src in the emitted site must
// resolve to an emitted file. External, mailto, data, and fragment-only
// targets are ignored.
export function validateSiteLinks(siteDir) {
  const errors = [];
  for (const file of walkHtmlFiles(siteDir)) {
    const html = readFileSync(file, 'utf8');
    for (const [, target] of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
      if (/^(https?:|mailto:|data:|#|\/\/)/.test(target)) continue;
      const cleaned = decodeURI(target.split(/[?#]/)[0]);
      if (!cleaned) continue;
      const resolved = path.resolve(path.dirname(file), cleaned);
      if (!existsSync(resolved)) {
        errors.push(`${path.relative(siteDir, file)}: broken internal link "${target}"`);
      }
    }
  }
  return errors;
}

// Build validation (#7): every screenshot evidence.json references must exist
// in the committed evidence set before it is copied into the site.
export function validateEvidenceScreenshots(evidence, evidenceDir) {
  const missing = new Set();
  for (const record of evidence.records) {
    for (const screenshot of record.screenshots) {
      if (!existsSync(path.join(evidenceDir, screenshot))) missing.add(screenshot);
    }
  }
  return [...missing].map(
    (file) => `evidence.json references a screenshot missing from ${evidenceDir}: ${file}`
  );
}
