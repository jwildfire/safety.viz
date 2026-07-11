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
export function expandRequirementIds(cell) {
  const ids = [];
  const token = /SH-[A-Z]+-(\d+)([A-D])?|\.\.(\d+)([A-D])?|\/(\d+)([A-D])?/g;
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
export function moduleTabs(active, matrixUrl) {
  const tab = (id, href, label) =>
    id === active
      ? `<a class="current" aria-current="page" href="${href}">${label}</a>`
      : `<a href="${href}">${label}</a>`;
  return (
    `<nav class="page-tabs">` +
    tab('demo', 'index.html', 'Live demo') +
    tab('evidence', 'evidence.html', 'Test evidence') +
    tab('api', 'api.html', 'API reference') +
    `<a href="${matrixUrl}">Requirement matrix ↗</a>` +
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
export function renderEvidencePage({ module, config, coverage, evidence }) {
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

  html.push(`<h1>${escapeHtml(renderer.title)}: test evidence</h1>`);
  html.push(
    `<p class="tagline">Requirement-traced qualification evidence for the safety.viz` +
      ` <code>${escapeHtml(module)}</code> module.</p>`
  );
  html.push(moduleTabs('evidence', matrixUrl));

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
      ` the requirement ID and its source-matrix rows link back to the reviewed specification,` +
      ` the issue column links the implementing work, and the result column shows the recorded` +
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
          `<tr><td>${escapeHtml(row.requirementCell)}</td>` +
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
  const statusBadge = (renderer) =>
    `<span class="badge badge-${renderer.status}">${renderer.status}</span>`;

  const placeholderCard = (renderer) => {
    const matrixUrl = `${config.matrixBaseUrl}/${renderer.matrix}`;
    return (
      `<li class="card status-${renderer.status}"><div class="card-body">` +
      `<h3>${escapeHtml(renderer.title)}</h3>${statusBadge(renderer)}` +
      `<p>${escapeHtml(renderer.blurb)}</p>` +
      `<p class="card-links"><a href="${matrixUrl}">Requirement matrix</a></p>` +
      `</div></li>`
    );
  };

  const availableCard = (renderer) => {
    const base = renderer.module;
    const matrixUrl = `${config.matrixBaseUrl}/${renderer.matrix}`;
    const hero = renderer.heroAsset
      ? `assets/${renderer.heroAsset}`
      : `${base}/evidence/${renderer.hero}`;
    return (
      `<li class="card status-available">` +
      `<a class="card-thumb" href="${base}/index.html">` +
      `<img src="${hero}" alt="${escapeHtml(renderer.title)} preview" loading="lazy">` +
      `</a><div class="card-body">` +
      `<h3><a href="${base}/index.html">${escapeHtml(renderer.title)}</a></h3>${statusBadge(renderer)}` +
      `<p>${escapeHtml(renderer.blurb)}</p>` +
      `<p class="card-links"><a href="${base}/index.html">Demo</a> · ` +
      `<a href="${base}/evidence.html">Evidence</a> · ` +
      `<a href="${base}/api.html">API</a> · ` +
      `<a href="${matrixUrl}">Matrix</a></p>` +
      `</div></li>`
    );
  };

  const available = config.renderers.filter((renderer) => renderer.status === 'available');
  const queued = config.renderers.filter((renderer) => renderer.status !== 'available');
  const first = available[0];

  const html = [];
  html.push(
    `<h1>safety.viz</h1>`,
    `<p class="tagline">Nine classic clinical-safety graphics, rebuilt on one modern charting stack.</p>`,
    `<div class="lead">` +
      `<p>safety.viz consolidates the interactive safety displays of the` +
      ` <a href="https://github.com/SafetyGraphics">safetyGraphics</a> ecosystem — nine archived` +
      ` <a href="https://github.com/RhoInc">Rho,&nbsp;Inc.</a> renderers built on decade-old` +
      ` Webcharts — into a single maintained <a href="https://www.chartjs.org/">Chart.js</a>` +
      ` library: one bundle, a JSON-Schema data contract per chart, and requirement-traced test` +
      ` evidence behind every renderer.</p>` +
      `<p>It is built to be consumed from R: <a href="https://github.com/jwildfire/gsm.safety">gsm.safety</a>` +
      ` wraps this same bundle as <code>Widget_*</code> htmlwidgets, mirroring how` +
      ` <a href="https://github.com/Gilead-BioStats/gsm.kri">gsm.kri</a> consumes` +
      ` <a href="https://github.com/Gilead-BioStats/rbm-viz">gsm.viz</a> in the OpenRBQM ecosystem.` +
      ` If you review clinical-trial safety data — medical monitor, biostatistician, or data` +
      ` scientist — each migrated renderer ships with a live demo, an audit-style test-evidence` +
      ` report, and a generated API reference.</p>` +
      `</div>`
  );

  const ctas = [];
  if (first) {
    ctas.push(
      `<a class="primary" href="${first.module}/index.html">Live demo: ${escapeHtml(first.title)}</a>`
    );
  }
  ctas.push(`<a href="architecture.html">How it works</a>`);
  ctas.push(`<a href="about.html">About the project</a>`);
  html.push(`<div class="home-ctas">${ctas.join('')}</div>`);

  html.push(
    `<h2>Available renderers <span class="gallery-count">${available.length} of ` +
      `${config.renderers.length} migrated</span></h2>`,
    `<ul class="gallery">${available.map(availableCard).join('\n')}</ul>`,
    `<h2>Migration queue <span class="gallery-count">${queued.length} to go</span></h2>`,
    `<p class="site-intro">Each queued renderer already has a reviewed requirement matrix in` +
      ` <a href="https://github.com/jwildfire/safety.agent">safety.agent</a> — the specification` +
      ` its migration will be built and tested against.</p>`,
    `<ul class="gallery gallery-planned">${queued.map(placeholderCard).join('\n')}</ul>`
  );
  return html.join('\n');
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
// recreated original safety-histogram example — committed IIFE bundle + the
// vendored real ADBDS example data. The .demo-page wrapper widens the layout
// (site.css) so the control sidebar and chart get full room.
export function renderDemoPage({ renderer, version, config }) {
  return (
    `<div class="demo-page">` +
    `<h1>${escapeHtml(renderer.title)}</h1>` +
    `<p class="page-links"><a href="evidence.html">Test evidence</a> · <a href="api.html">API reference</a>` +
    ` · <a href="${config.matrixBaseUrl}/${renderer.matrix}">Requirement matrix</a></p>` +
    `<p>${escapeHtml(renderer.blurb)} This live demo mounts the committed` +
    ` <code>dist/safety.viz-${version}</code> IIFE bundle — the same asset gsm.safety vendors —` +
    ` against the original safety-histogram example data (<code>adbds.csv</code> from the` +
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
