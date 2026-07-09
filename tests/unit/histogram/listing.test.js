import { describe, it, expect } from 'vitest';
import { searchRows, sortRows, paginate, buildCsv } from '../../../src/histogram/listing.js';

const cols = [
  { value_col: 'USUBJID', label: 'Participant ID' },
  { value_col: 'STRESN', label: 'Result' }
];

describe('histogram listing', () => {
  it('SH-LIST-004: search filters rows case-insensitively across listing columns (#2)', () => {
    const rows = [
      { USUBJID: 'SUBJ-001', STRESN: '1' },
      { USUBJID: 'SUBJ-012', STRESN: '12' }
    ];
    expect(searchRows(rows, cols, 'subj-012')).toHaveLength(1);
    expect(searchRows(rows, cols, 'SUBJ')).toHaveLength(2);
    expect(searchRows(rows, cols, '')).toHaveLength(2);
  });

  it('SH-LIST-004: sorting is numeric when both values are numeric, string otherwise, and null-safe (#2)', () => {
    const rows = [{ STRESN: '10' }, { STRESN: '2' }, { STRESN: null }];
    const asc = sortRows(rows, { col: { value_col: 'STRESN' }, direction: 'asc' });
    expect(asc.map((row) => row.STRESN)).toEqual([null, '2', '10']);
    const desc = sortRows(rows, { col: { value_col: 'STRESN' }, direction: 'desc' });
    expect(desc.map((row) => row.STRESN)).toEqual(['10', '2', null]);

    const strings = sortRows([{ USUBJID: 'b' }, { USUBJID: 'a' }], {
      col: { value_col: 'USUBJID' },
      direction: 'asc'
    });
    expect(strings.map((row) => row.USUBJID)).toEqual(['a', 'b']);
  });

  it('SH-LIST-002: pagination slices pages and clamps out-of-range page numbers (#2)', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ i }));
    const page3 = paginate(rows, 3, 5);
    expect(page3.pages).toBe(3);
    expect(page3.visible).toHaveLength(2);
    expect(paginate(rows, 99, 5).page).toBe(3);
    expect(paginate([], 1, 5).pages).toBe(1);
  });

  it('SH-LIST-003: CSV export renders label headers and quoted, null-safe values (#2)', () => {
    const csv = buildCsv(
      [
        { USUBJID: 'SUBJ-001', STRESN: '1' },
        { USUBJID: 'SUBJ-002', STRESN: null }
      ],
      cols
    );
    expect(csv.split('\n')[0]).toBe('Participant ID,Result');
    expect(csv.split('\n')[1]).toBe('"SUBJ-001","1"');
    expect(csv.split('\n')[2]).toBe('"SUBJ-002",""');
  });
});
