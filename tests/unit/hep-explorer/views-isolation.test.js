import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import scatterView from '../../../src/hep-explorer/views/scatter.js';
import migrationView from '../../../src/hep-explorer/views/migration.js';
import compositeView from '../../../src/hep-explorer/views/composite.js';

// Source-reading guards for the view split (obot.roadmap#43, safety.viz#91).
// The split only pays for itself if the views stay SIBLINGS — each one knowing
// the orchestrator and the shared layers, and nothing about the others — and if
// the choice of view stays in exactly one place. Both are properties of the
// source text, so they are asserted against the source text: a future view (the
// migration Sankey, safety.viz#92) cannot quietly reintroduce the coupling this
// refactor removed.

const SRC_DIR = path.resolve(fileURLToPath(new URL('../../../src/', import.meta.url)));
const VIEWS_DIR = path.join(SRC_DIR, 'hep-explorer', 'views');
const ENTRY_FILE = path.join(SRC_DIR, 'hep-explorer.js');

// The view contract every file in views/ implements; documented at the top of
// views/scatter.js.
const CONTRACT = [
  'id',
  'label',
  'slots',
  'usesRRatioFilter',
  'contributeControls',
  'contributeFilters',
  'teardown',
  'render',
  'selectedIds',
  'onParticipantsChanged',
  'clearSelection',
  'highlight'
];

const CONTRACT_METHODS = CONTRACT.filter(
  (member) => !['id', 'label', 'slots', 'usesRRatioFilter'].includes(member)
);

// Strip comments before scanning source, so a file may explain the rule it
// enforces without tripping it.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Every module specifier an ES file imports or re-exports.
function specifiersIn(code) {
  return [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function jsFilesUnder(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return jsFilesUnder(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

const viewFiles = readdirSync(VIEWS_DIR).filter((entry) => entry.endsWith('.js'));

describe('hep-explorer view isolation', () => {
  it('HEP-CORE-017: no file under views/ imports another file in views/ (#91)', () => {
    expect(viewFiles.length).toBeGreaterThan(1);
    for (const file of viewFiles) {
      const code = stripComments(readFileSync(path.join(VIEWS_DIR, file), 'utf8'));
      const siblings = specifiersIn(code)
        .filter((spec) => spec.startsWith('.'))
        .filter((spec) => path.dirname(path.resolve(VIEWS_DIR, spec)) === VIEWS_DIR);
      expect(siblings, `views/${file} imports a sibling view: ${siblings.join(', ')}`).toEqual([]);
    }
  });

  it('HEP-CORE-018: only the orchestrator branches on state.view (#91)', () => {
    // Positive control: the module's one view dispatch really does live in the
    // entry file, so the absence assertions below mean something.
    expect(stripComments(readFileSync(ENTRY_FILE, 'utf8'))).toMatch(/state\s*\.\s*view/);

    const scanned = [
      ...jsFilesUnder(path.join(SRC_DIR, 'hep-explorer')),
      ...jsFilesUnder(path.join(SRC_DIR, 'hep-core'))
    ];
    expect(scanned.length).toBeGreaterThan(5);
    for (const file of scanned) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code, `${path.relative(SRC_DIR, file)} branches on state.view`).not.toMatch(
        /state\s*\.\s*view/
      );
    }
  });

  it('HEP-CORE-019: every view implements the same contract against the same shell (#91)', () => {
    const views = { scatter: scatterView, migration: migrationView, composite: compositeView };
    expect(Object.keys(views).sort()).toEqual(
      viewFiles.map((file) => file.replace(/\.js$/, '')).sort()
    );

    for (const [name, view] of Object.entries(views)) {
      expect(Object.keys(view).sort(), `views/${name}.js`).toEqual([...CONTRACT].sort());
      expect(view.id, `views/${name}.js id`).toBe(name);
      expect(typeof view.label).toBe('string');
      expect(Array.isArray(view.slots) && view.slots.length > 0).toBe(true);
      expect(typeof view.usesRRatioFilter).toBe('boolean');
      for (const method of CONTRACT_METHODS) {
        expect(typeof view[method], `views/${name}.js ${method}`).toBe('function');
      }
    }
  });
});
