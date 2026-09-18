#!/usr/bin/env node
// The CLI of the narrative eval harness (#146) — the CI gate and the local
// smoke test of the AI layer.
//
//   node tests/evals/patient-journey-narratives/run.mjs                      offline: stub adapter, rules judge
//   node tests/evals/patient-journey-narratives/run.mjs --skill lab-trajectory --limit 2
//   node tests/evals/patient-journey-narratives/run.mjs --adapter claude --judge claude
//
// Exit codes: 0 every skill clears its thresholds, 1 a skill is below one,
// 2 the run could not start (bad flag, missing credential, missing golden set).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { METRICS, SKILL_ORDER, runEvals, THRESHOLDS } from './lib.mjs';
import { rootDir } from './demo-data.mjs';

const DEFAULT_REPORT_DIR = path.join(rootDir, 'tests', 'evals', 'reports');
const KEY_ENV = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

const USAGE = `Usage: node tests/evals/patient-journey-narratives/run.mjs [options]

  --adapter <stub|claude|openai>  the narrative generator under test (default: stub)
  --judge <rules|claude|openai>   the grader (default: rules; the CI gate)
  --skill <slug>                  only this skill; repeat the flag for several
  --limit <n>                     at most n cases per skill
  --model <id>                    model id for a live adapter or judge
  --report-dir <path>             where the JSON and Markdown reports land
                                  (default: tests/evals/reports)
  --no-report                     print the table, write nothing
  --help                          this text
`;

/**
 * Parse argv into options.
 * @param {string[]} argv The arguments after the script name.
 * @returns {Object} The parsed options.
 */
export function parseArgs(argv) {
  const options = {
    adapter: 'stub',
    judge: 'rules',
    skills: [],
    limit: null,
    model: null,
    reportDir: DEFAULT_REPORT_DIR,
    report: true,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
      i += 1;
      return next;
    };
    switch (flag) {
      case '--adapter':
        options.adapter = value();
        break;
      case '--judge':
        options.judge = value();
        break;
      case '--skill':
        options.skills.push(value());
        break;
      case '--limit':
        options.limit = Number(value());
        break;
      case '--model':
        options.model = value();
        break;
      case '--report-dir':
        options.reportDir = path.resolve(value());
        break;
      case '--no-report':
        options.report = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`unknown flag "${flag}"`);
    }
  }
  for (const slug of options.skills) {
    if (!SKILL_ORDER.includes(slug)) {
      throw new Error(`unknown skill "${slug}" (known: ${SKILL_ORDER.join(', ')})`);
    }
  }
  for (const name of ['adapter', 'judge']) {
    const allowed =
      name === 'adapter' ? ['stub', 'claude', 'openai'] : ['rules', 'claude', 'openai'];
    if (!allowed.includes(options[name])) {
      throw new Error(`unknown ${name} "${options[name]}" (allowed: ${allowed.join(', ')})`);
    }
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit needs a positive integer');
  }
  return options;
}

/**
 * The credential a live adapter or judge needs, from the environment.
 * @param {Object} options The parsed options.
 * @param {Object} env The environment.
 * @returns {{apiKey: ?string, missing: string[]}} The key and what is absent.
 */
export function resolveCredentials(options, env = process.env) {
  const providers = new Set(
    [options.adapter, options.judge].filter((name) => name === 'claude' || name === 'openai')
  );
  const missing = [];
  let apiKey = null;
  for (const provider of providers) {
    const variable = KEY_ENV[provider];
    if (env[variable]) apiKey = apiKey || env[variable];
    else
      missing.push(
        `${variable} (for --${options.adapter === provider ? 'adapter' : 'judge'} ${provider})`
      );
  }
  return { apiKey, missing };
}

const pct = (value) => (Number.isFinite(value) ? value.toFixed(2) : '—');

/**
 * The summary table, as fixed-width text.
 * @param {Object} result The runEvals result.
 * @returns {string} The table.
 */
export function summaryTable(result) {
  const columns = ['skill', 'n', ...METRICS, 'gate'];
  const rows = SKILL_ORDER.filter((slug) => result.bySkill[slug]).map((slug) => {
    const entry = result.bySkill[slug];
    return [
      slug,
      String(entry.n),
      ...METRICS.map((metric) => pct(entry[metric])),
      entry.pass ? 'pass' : `FAIL: ${entry.failed_metrics.join(', ')}`
    ];
  });
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => row[index].length))
  );
  const line = (cells) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd();
  return [line(columns), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
    '\n'
  );
}

/**
 * The Markdown report: a table per skill, then every failing case with its
 * reasons, then the whole case list.
 * @param {Object} result The runEvals result.
 * @returns {string} The Markdown.
 */
export function markdownReport(result) {
  const header = METRICS.join(' | ');
  const table = [
    `| skill | n | ${header} | gate |`,
    `| --- | ---: | ${METRICS.map(() => '---:').join(' | ')} | --- |`,
    ...SKILL_ORDER.filter((slug) => result.bySkill[slug]).map((slug) => {
      const entry = result.bySkill[slug];
      const cells = METRICS.map((metric) => pct(entry[metric])).join(' | ');
      return `| ${slug} | ${entry.n} | ${cells} | ${entry.pass ? 'pass' : `**FAIL**: ${entry.failed_metrics.join(', ')}`} |`;
    })
  ].join('\n');

  const failing = result.cases.filter((entry) => !entry.pass);
  const failureBlock = failing.length
    ? failing
        .map((entry) =>
          [
            `### ${entry.id}`,
            '',
            `- inputs: \`${JSON.stringify(entry.inputs)}\``,
            `- below threshold: ${entry.failed_metrics.join(', ') || 'none'}`,
            `- scores: ${METRICS.map((metric) => `${metric} ${pct(entry.scores[metric])}`).join(', ')}`,
            ...entry.reasons.map((reason) => `- ${reason.replace(/\n/g, ' ')}`)
          ].join('\n')
        )
        .join('\n\n')
    : '_No case fell below a threshold._';

  const notes = result.cases
    .filter((entry) => entry.pass && entry.reasons.length)
    .map((entry) => `- ${entry.id}: ${entry.reasons.join('; ').replace(/\n/g, ' ')}`);

  return [
    `# Patient Journey narrative evals — ${result.passed ? 'PASS' : 'FAIL'}`,
    '',
    `- run: ${result.generatedAt}`,
    `- adapter: \`${result.adapter}\``,
    `- judge: \`${result.judge}\``,
    `- cases: ${result.cases.length}`,
    `- gate: \`tests/evals/patient-journey-narratives/thresholds.json\` (faithfulness, coverage, style and refusals_correct are floors; hallucination is a ceiling; citation_recall and flags_ok are reported, not gated)`,
    '',
    '## Skills',
    '',
    table,
    '',
    '## Cases below a threshold',
    '',
    failureBlock,
    '',
    '## Notes on passing cases',
    '',
    notes.length ? notes.join('\n') : '_None._',
    '',
    '## Every case',
    '',
    '| case | skill | ' + METRICS.join(' | ') + ' | ms |',
    `| --- | --- | ${METRICS.map(() => '---:').join(' | ')} | ---: |`,
    ...result.cases.map(
      (entry) =>
        `| ${entry.pass ? '' : '**'}${entry.id}${entry.pass ? '' : '**'} | ${entry.skill} | ${METRICS.map(
          (metric) => pct(entry.scores[metric])
        ).join(' | ')} | ${entry.ms} |`
    ),
    ''
  ].join('\n');
}

/**
 * Run the CLI.
 * @param {string[]} [argv] Arguments after the script name.
 * @returns {Promise<number>} The exit code.
 */
export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const { apiKey, missing } = resolveCredentials(options);
  if (missing.length) {
    process.stderr.write(
      `Missing credential(s): ${missing.join(', ')}.\n` +
        'Export the key, or run offline with --adapter stub --judge rules.\n'
    );
    return 2;
  }

  let result;
  try {
    result = await runEvals({
      adapter: options.adapter,
      judge: options.judge,
      skills: options.skills,
      limit: options.limit ?? undefined,
      model: options.model ?? undefined,
      apiKey: apiKey ?? undefined,
      log: (line) => process.stdout.write(`  ${line}\n`)
    });
  } catch (error) {
    process.stderr.write(`evals: ${error && error.message ? error.message : error}\n`);
    return 2;
  }

  process.stdout.write(`\n${summaryTable(result)}\n\n`);
  const failing = result.cases.filter((entry) => !entry.pass);
  for (const entry of failing) {
    process.stdout.write(`${entry.id} — ${entry.failed_metrics.join(', ')}\n`);
    for (const reason of entry.reasons) process.stdout.write(`    ${reason}\n`);
  }

  if (options.report) {
    mkdirSync(options.reportDir, { recursive: true });
    const stamp = result.generatedAt.replace(/[:.]/g, '-');
    const base = path.join(
      options.reportDir,
      `${stamp}-${options.adapter}-${options.judge === 'rules' ? 'rules' : options.judge}`
    );
    writeFileSync(`${base}.json`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    writeFileSync(`${base}.md`, markdownReport(result), 'utf8');
    process.stdout.write(
      `\nreport: ${path.relative(rootDir, `${base}.md`)} (+ .json)\nthresholds: ${Object.keys(THRESHOLDS).filter((key) => key !== '_comment').length} skills gated\n`
    );
  }
  process.stdout.write(`\n${result.passed ? 'PASS' : 'FAIL'}: ${result.cases.length} cases\n`);
  return result.passed ? 0 : 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().then((code) => {
    process.exitCode = code;
  });
}
