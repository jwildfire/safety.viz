// Docs-site generators (#7): pure functions scripts/site.mjs assembles into
// _site/. Plain Node, no framework, per design #21 — and every internal URL
// relative, so one build serves the site root, /dev/, and /pr/{N}/ unchanged.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Minimal inline-markdown renderer for the subset the coverage docs use:
// `code`, [links](url), and **bold**. Escapes HTML first.
export function mdInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// Block renderer for the coverage doc's routing-status tail: ## headings,
// - bullet lists (with wrapped continuation lines), and paragraphs.
export function mdBlock(markdown) {
  const html = [];
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
      html.push(`<ul>${list.map((item) => `<li>${mdInline(item)}</li>`).join('')}</ul>`);
      list = null;
    }
  };

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${mdInline(heading[2])}</h${level}>`);
    } else if (/^-\s+/.test(line)) {
      flushParagraph();
      if (!list) list = [];
      list.push(line.replace(/^-\s+/, ''));
    } else if (/^\s+\S/.test(line) && list) {
      list[list.length - 1] += ` ${line.trim()}`;
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
// shorthands: full IDs (SH-CFG-004, suffixed SH-FUNC-004A), slash lists
// continuing the last prefix (SH-LIST-002/003), and double-dot ranges
// (SH-CFG-004..009). Prose like "(defaults)" or "—" contributes nothing.
// The module prefix is structural (SH-, AET-, SSP-, …) per the safety.agent
// matrices, matching the evidence pipeline's requirement-ID pattern (#26).
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

function statusChip(status) {
  const label = { pass: 'pass', fail: 'fail', none: 'no record' }[status];
  return `<span class="chip status-${status}">${label}</span>`;
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

function renderEvidenceCell(row, records, kind) {
  const parts = [];
  if (kind === 'unit') {
    parts.push(`<p class="test-file">${mdInline(row.test)}</p>`);
  }
  if (!records.length) {
    parts.push(`<ul class="tests"><li>${statusChip('none')} ${mdInline(row.test)}</li></ul>`);
    return parts.join('\n');
  }
  const tests = records
    .map((record) => `<li>${statusChip(record.status)} ${escapeHtml(record.test)}</li>`)
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

// Evidence page (#21 pillar 2): coverage rows joined to evidence.json —
// requirement → matrix rows (linked to the safety.agent matrix) → test →
// status chip → screenshot(s) — plus the routing-status tail verbatim.
export function renderEvidencePage({ module, config, coverage, evidence }) {
  const renderer = config.renderers.find((entry) => entry.module === module);
  const matrixUrl = `${config.matrixBaseUrl}/${renderer.matrix}`;
  const html = [];

  html.push(`<h1>${escapeHtml(renderer.title)}: test evidence</h1>`);
  html.push(
    `<p class="page-links"><a href="index.html">Live demo</a> · <a href="api.html">API reference</a>` +
      ` · <a href="${matrixUrl}">Requirement matrix</a></p>`
  );
  if (coverage.intro) html.push(mdBlock(rewriteRelativeLinks(coverage.intro, config.repoUrl)));

  for (const section of coverage.sections) {
    html.push(`<h2>${mdInline(section.heading)}</h2>`);
    const rows = section.rows
      .map((row) => {
        const records = matchRecords(row, section.kind, evidence.records);
        return (
          `<tr><td>${escapeHtml(row.requirementCell)}</td>` +
          `<td>${renderMatrixCell(row, matrixUrl)}</td>` +
          `<td><a href="${config.repoUrl}/issues/${row.issue}">#${row.issue}</a></td>` +
          `<td>${renderEvidenceCell(row, records, section.kind)}</td></tr>`
        );
      })
      .join('\n');
    html.push(
      `<table class="evidence"><thead><tr><th>Requirement</th><th>Source matrix rows</th>` +
        `<th>Issue</th><th>Tests &amp; evidence</th></tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  if (coverage.tail) {
    html.push(
      `<section class="routing">${mdBlock(rewriteRelativeLinks(coverage.tail, config.repoUrl))}</section>`
    );
  }
  return html.join('\n');
}

// Gallery (#21 pillar 1): one card per renderer, status badge from config;
// available renderers link to their pages with the hero evidence screenshot.
export function renderGallery(config) {
  const cards = config.renderers
    .map((renderer) => {
      const badge = `<span class="badge badge-${renderer.status}">${renderer.status}</span>`;
      const matrixUrl = `${config.matrixBaseUrl}/${renderer.matrix}`;
      if (renderer.status !== 'available') {
        return (
          `<li class="card status-${renderer.status}"><div class="card-body">` +
          `<h2>${escapeHtml(renderer.title)}</h2>${badge}` +
          `<p>${escapeHtml(renderer.blurb)}</p>` +
          `<p class="card-links"><a href="${matrixUrl}">Requirement matrix</a></p>` +
          `</div></li>`
        );
      }
      const base = renderer.module;
      return (
        `<li class="card status-available">` +
        `<a class="card-thumb" href="${base}/index.html">` +
        `<img src="${base}/evidence/${renderer.hero}" alt="${escapeHtml(renderer.title)} preview" loading="lazy">` +
        `</a><div class="card-body">` +
        `<h2><a href="${base}/index.html">${escapeHtml(renderer.title)}</a></h2>${badge}` +
        `<p>${escapeHtml(renderer.blurb)}</p>` +
        `<p class="card-links"><a href="${base}/index.html">Demo</a> · ` +
        `<a href="${base}/evidence.html">Evidence</a> · ` +
        `<a href="${base}/api.html">API</a> · ` +
        `<a href="${matrixUrl}">Matrix</a></p>` +
        `</div></li>`
      );
    })
    .join('\n');
  return (
    `<h1>safety.viz</h1>` +
    `<p class="site-intro">Consolidated Chart.js charting library for clinical safety graphics —` +
    ` interactive renderers migrated from the safetyGraphics ecosystem. Each renderer ships with a` +
    ` live demo, a requirement-keyed test-evidence page, and a generated API reference.</p>` +
    `<ul class="gallery">${cards}</ul>`
  );
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

// API page (#21 pillar 3): rendered straight from the _api/<module>.json
// artifact (scripts/api/build-api-data.mjs, #6) — factory, methods, settings,
// and the schema-derived data contract.
export function renderApiPage(model) {
  const html = [];
  html.push(`<h1><code>${escapeHtml(model.module)}</code> API reference</h1>`);
  html.push(
    `<p class="page-links"><a href="index.html">Live demo</a> · <a href="evidence.html">Test evidence</a></p>`
  );
  html.push('<h2>Factory</h2>', methodSection(model.factory));
  html.push('<h2>Methods</h2>', ...model.methods.map(methodSection));

  const settingsRows = model.settings
    .map(
      (setting) =>
        `<tr><td><code>${escapeHtml(setting.name)}</code></td>` +
        `<td><code>${escapeHtml(setting.type)}${setting.nullable ? ' | null' : ''}</code></td>` +
        `<td>${setting.default === null ? '—' : `<code>${escapeHtml(setting.default)}</code>`}</td>` +
        `<td>${escapeHtml(setting.description)}</td></tr>`
    )
    .join('');
  html.push(
    '<h2>Settings</h2>',
    `<table class="api"><thead><tr><th>Setting</th><th>Type</th><th>Default</th>` +
      `<th>Description</th></tr></thead><tbody>${settingsRows}</tbody></table>`
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
  html.push(
    '<h2>Data contract</h2>',
    `<h3>${escapeHtml(contract.title)}</h3>`,
    `<p>${escapeHtml(contract.description)}</p>`,
    `<table class="api"><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Default</th>` +
      `<th>Description</th></tr></thead><tbody>${fieldRows}</tbody></table>`
  );
  return html.join('\n');
}

// Demo page (#21 pillar 1, reworked under #15): the site shell around the
// recreated original renderer example — committed IIFE bundle + the vendored
// real example data (the renderer's `data` config key, defaulting to the
// shared ADBDS extract, #26). The .demo-page wrapper widens the layout
// (site.css) so the control sidebar and chart get full room.
export function renderDemoPage({ renderer, version, config }) {
  return (
    `<div class="demo-page">` +
    `<h1>${escapeHtml(renderer.title)}</h1>` +
    `<p class="page-links"><a href="evidence.html">Test evidence</a> · <a href="api.html">API reference</a>` +
    ` · <a href="${config.matrixBaseUrl}/${renderer.matrix}">Requirement matrix</a></p>` +
    `<p>${escapeHtml(renderer.blurb)} This live demo mounts the committed` +
    ` <code>dist/safety.viz-${version}</code> IIFE bundle — the same asset gsm.safety vendors —` +
    ` against the renderer's original example data (<code>${escapeHtml(renderer.data || 'adbds.csv')}</code> from the` +
    ` <a href="https://github.com/RhoInc/data-library">RhoInc data library</a>), with the full control panel active.</p>` +
    `<div id="container"></div>` +
    `<script src="../dist/safety.viz-${version}/safety.viz.js"></script>` +
    `<script src="./demo.js"></script>` +
    `</div>`
  );
}

// Shared shell: replaces {{title}}, {{root}}, and {{content}} tokens. {{root}}
// prefixes shell-level links so one shell serves pages at any depth.
export function renderShell({ shell, title, content, root = '' }) {
  return shell
    .replaceAll('{{title}}', escapeHtml(title))
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
