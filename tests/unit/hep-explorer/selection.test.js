// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  HIGHLIGHT,
  TRACE_HEADER_HINT,
  createSelection
} from '../../../src/hep-explorer/selection.js';

// The participant-selection layer extracted from src/hep-explorer.js
// (obot.roadmap#43, safety.viz#91): the sidebar's Participants multi-select and
// its Clear selection button, the shared participant-trace header, the
// HEP-SELECT-006 carrier, and the participantsSelected dispatcher. These tests
// exercise it against a stand-in host and a stand-in view, which is the whole
// point of the extraction — the layer works for ANY view, including the
// migration Sankey (safety.viz#92) that does not exist yet.

// jsdom replaces the global URL, so resolve from the test file's own path
// rather than constructing a file: URL here.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELECTION_SRC = readFileSync(
  path.resolve(HERE, '../../../src/hep-explorer/selection.js'),
  'utf8'
);

// Strip comments before scanning source, so the file may explain the rule it
// enforces without tripping it.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// A minimal stand-in for the hep-explorer instance: only the shell members the
// selection layer touches.
function makeHost() {
  const root = document.createElement('div');
  const section = document.createElement('div');
  const header = document.createElement('div');
  root.append(section, header);
  document.body.append(root);
  const host = {
    root,
    compositeSelectSection: section,
    compositeHeaderEl: header,
    compositeSelectEl: null,
    compositeClearBtn: null,
    participantsSelected: []
  };
  host.selection = createSelection(host);
  return host;
}

// A stand-in view: the three things a view injects, and nothing else.
function makeView(selected = []) {
  return {
    selectedIds: vi.fn(() => selected),
    changed: vi.fn(),
    cleared: vi.fn()
  };
}

const SHOWN = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

describe('hep-explorer selection layer', () => {
  it('HEP-CORE-011: mount fills the Participants section with one option per shown participant and hides it when none are shown (#91)', () => {
    const host = makeHost();
    host.selection.bind(makeView());

    host.selection.mount(host.compositeSelectSection, SHOWN);
    const control = host.compositeSelectSection.querySelector('.sv-control');
    expect(control).not.toBeNull();
    expect(host.compositeSelectSection.style.display).toBe('');
    expect([...host.compositeSelectEl.options].map((opt) => opt.value)).toEqual(['A', 'B', 'C']);
    expect(host.compositeSelectEl.multiple).toBe(true);
    expect(host.compositeClearBtn.textContent).toBe('Clear selection');

    // Re-mounting with nothing shown removes the control and hides the section.
    host.selection.mount(host.compositeSelectSection, []);
    expect(host.compositeSelectSection.querySelector('.sv-control')).toBeNull();
    expect(host.compositeSelectSection.style.display).toBe('none');
  });

  it('HEP-CORE-012: sync mirrors a selection into the dropdown and the Clear button (#91)', () => {
    const host = makeHost();
    host.selection.bind(makeView());
    host.selection.mount(host.compositeSelectSection, SHOWN);
    expect(host.compositeClearBtn.disabled).toBe(true);

    host.selection.sync(['B', 'C']);
    expect([...host.compositeSelectEl.selectedOptions].map((opt) => opt.value)).toEqual(['B', 'C']);
    expect(host.compositeClearBtn.disabled).toBe(false);

    // Numeric ids mirror as strings, and an empty selection disables Clear again.
    host.selection.sync([]);
    expect([...host.compositeSelectEl.selectedOptions]).toEqual([]);
    expect(host.compositeClearBtn.disabled).toBe(true);
  });

  it('HEP-CORE-013: the control routes changes and clears to whichever view is bound, with no view-conditional logic of its own (#91)', () => {
    const host = makeHost();
    const first = makeView(['A']);
    host.selection.bind(first);
    host.selection.mount(host.compositeSelectSection, SHOWN);

    // The Clear button's enabled state comes from the bound view's selection,
    // not from a state.view test (HEP-SELECT-001).
    expect(first.selectedIds).toHaveBeenCalled();
    expect(host.compositeClearBtn.disabled).toBe(false);

    // Editing the dropdown hands the ids to the bound view.
    [...host.compositeSelectEl.options].forEach((opt, index) => {
      opt.selected = index < 2;
    });
    host.compositeSelectEl.dispatchEvent(new Event('change'));
    expect(first.changed).toHaveBeenCalledWith(['A', 'B']);

    // So does the Clear button.
    host.compositeClearBtn.click();
    expect(first.cleared).toHaveBeenCalledTimes(1);

    // Programmatic selection (a Sankey ribbon or a cross-table cell,
    // safety.viz#92) takes the same path, normalizing ids to strings.
    host.selection.set([3, 'A']);
    expect(first.changed).toHaveBeenLastCalledWith(['3', 'A']);

    // Binding a THIRD view the layer has never heard of re-points the same
    // widgets at it — the replacement for the old state.view branches.
    const next = makeView([]);
    host.selection.bind(next);
    host.compositeSelectEl.dispatchEvent(new Event('change'));
    host.compositeClearBtn.click();
    host.selection.clear();
    expect(next.changed).toHaveBeenCalledWith(['A', 'B']);
    expect(next.cleared).toHaveBeenCalledTimes(2);
    expect(first.changed).toHaveBeenCalledTimes(2);
    expect(first.cleared).toHaveBeenCalledTimes(1);
  });

  it('HEP-CORE-014: dispatch fires participantsSelected on the shell root and carried() replays it across a redraw (#91)', () => {
    const host = makeHost();
    host.selection.bind(makeView());
    const seen = [];
    host.root.addEventListener('participantsSelected', (event) => seen.push(event.detail.data));

    host.selection.dispatch(['A', 7]);
    expect(seen).toEqual([['A', 7]]);
    expect(host.participantsSelected).toEqual(['A', 7]);
    // The carrier stringifies, which is what a view compares its shown ids to
    // (HEP-SELECT-006).
    expect(host.selection.carried()).toEqual(['A', '7']);

    host.selection.dispatch([]);
    expect(seen).toEqual([['A', 7], []]);
    expect(host.selection.carried()).toEqual([]);
  });

  it('HEP-CORE-015: the trace header names a hover, one selection, several selections, and the idle hint (#91)', () => {
    const host = makeHost();
    host.selection.bind(makeView());

    host.selection.updateTraceHeader(null, []);
    expect(host.compositeHeaderEl.textContent).toBe(TRACE_HEADER_HINT);
    expect(host.compositeHeaderEl.classList.contains('is-active')).toBe(false);

    // A hover names that participant; it reads "selected" only when it is also
    // in the sticky selection.
    host.selection.updateTraceHeader('A', []);
    expect(host.compositeHeaderEl.textContent).toBe('Participant A');
    expect(host.compositeHeaderEl.classList.contains('is-active')).toBe(true);
    host.selection.updateTraceHeader('A', ['A']);
    expect(host.compositeHeaderEl.textContent).toBe('Participant A selected.');

    // Hover beats selection; a lone selection names itself; several are counted.
    host.selection.updateTraceHeader('B', ['A']);
    expect(host.compositeHeaderEl.textContent).toBe('Participant B');
    host.selection.updateTraceHeader(null, ['A']);
    expect(host.compositeHeaderEl.textContent).toBe('Participant A selected.');
    host.selection.updateTraceHeader(null, ['A', 'B']);
    expect(host.compositeHeaderEl.textContent).toBe('2 participants selected.');

    // The annotation text the views stamp on the plot is the same string.
    expect(host.selection.annotationText('A', true)).toBe('Participant A selected.');
    expect(host.selection.annotationText('A', false)).toBe('Participant A');
  });

  it('HEP-CORE-016: the selection layer carries no view-conditional logic and no view import (#91)', () => {
    const code = stripComments(SELECTION_SRC);

    // The three state.view branches this extraction removed (the select's
    // onchange, the Clear handler, and the active-selection accessor) may not
    // come back in any form.
    expect(code).not.toMatch(/state\s*\.\s*view/);
    // No view id may appear as a literal to compare against.
    expect(code).not.toMatch(/['"](scatter|composite|migration)['"]/);
    // And the layer may not reach into the views it serves.
    expect(code).not.toMatch(/from\s*['"][^'"]*views\//);

    // The shared highlight constants live here so the views cannot drift apart.
    expect(Object.keys(HIGHLIGHT).sort()).toEqual([
      'BORDER_WIDTH',
      'DIM_BORDER',
      'DIM_FILL',
      'RADIUS_BOOST'
    ]);
  });
});
