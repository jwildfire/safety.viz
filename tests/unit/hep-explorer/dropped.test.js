// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DROPPED_PARTICIPANT_COLUMNS,
  csvDownloadLink,
  droppedRowColumns,
  toCsv
} from '../../../src/hep-explorer/dropped.js';

// The dropped-record and dropped-participant CSV downloads (#50), matching the
// original renderer's `downloadCSV` + `initDroppedRowsWarning` /
// `showMissingDataWarning` pair: the counts in the notes say how much data left
// the chart, and the download says exactly which rows and why.
// Requirement group HEP-DROP-*.

describe('hep-explorer dropped-record downloads (HEP-DROP-*)', () => {
  it('HEP-DROP-002: the CSV quotes every field and doubles embedded quotes (#50)', () => {
    const csv = toCsv(
      [
        { id: 'P1', reason: 'value not numeric', note: 'said "NA"' },
        { id: 'P2', reason: 'reference range missing', note: null }
      ],
      ['id', 'reason', 'note']
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"id","reason","note"');
    expect(lines[1]).toBe('"P1","value not numeric","said ""NA"""');
    // A missing field is an empty cell, not the string "null".
    expect(lines[2]).toBe('"P2","reference range missing",""');
    expect(toCsv([], ['id'])).toBe('"id"');
  });

  it('HEP-DROP-002: the row export leads with the reason and hides the internals (#50)', () => {
    const columns = droppedRowColumns([
      {
        USUBJID: 'P1',
        LBTEST: 'ALT',
        LBSTRESN: 'NA',
        __hep_index: 3,
        __hep_value: NaN,
        __hep_dropReason: 'x'
      }
    ]);
    expect(columns[0]).toBe('__hep_dropReason');
    expect(columns).toContain('USUBJID');
    expect(columns).toContain('LBSTRESN');
    // The module's own derived columns are not the reviewer's data.
    expect(columns.filter((column) => column.startsWith('__hep_'))).toEqual(['__hep_dropReason']);
    expect(droppedRowColumns([])).toEqual([]);
    expect(DROPPED_PARTICIPANT_COLUMNS).toEqual(['id', 'reason']);
  });

  it('HEP-DROP-003: the link names the file and builds the CSV only when clicked (#50)', () => {
    let built = 0;
    const link = csvDownloadLink(
      () => {
        built += 1;
        return '"a"\n"1"';
      },
      'hepExplorerDroppedRows',
      'download the rows'
    );
    expect(link.tagName).toBe('A');
    expect(link.textContent).toBe('download the rows');
    expect(link.getAttribute('download')).toMatch(/^hepExplorerDroppedRows.*\.csv$/);
    // Nothing is serialized until someone asks: a study-sized drop list would
    // otherwise put hundreds of kilobytes in the DOM on every redraw.
    expect(built).toBe(0);
    expect(link.getAttribute('href')).toBe('#');
    expect(link.__hepCsv()).toBe('"a"\n"1"');
    expect(built).toBe(1);
  });
});
