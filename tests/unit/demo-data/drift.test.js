import { describe, it, expect } from 'vitest';
import { demoDataDrift, firstDifferingRow } from '../../../scripts/demo-data-lib.mjs';

// Demo-data drift check (#140). scripts/check-demo-data.mjs reruns the generators
// into a temporary directory and hands both sides — the committed site/data/ files
// and the fresh ones — to these two pure functions, which decide whether anything
// drifted and name where. Tested here on hand-made text so the comparison is
// covered without the ~200 MB source download the real check needs.

const HEADER = 'USUBJID,ARM,EOSDY,EOSSTT';
const csv = (...rows) => [HEADER, ...rows].join('\n') + '\n';

describe('firstDifferingRow', () => {
  it('returns null when the committed and generated text are byte-identical (#140)', () => {
    const text = csv('01,Placebo,183,COMPLETED', '02,Placebo,27,DISCONTINUED');
    expect(firstDifferingRow(text, text)).toBeNull();
  });

  it('counts the header as row 1, so the row is the line an editor shows (#140)', () => {
    const committed = csv('01,Placebo,183,COMPLETED', '02,Placebo,28,DISCONTINUED');
    const generated = csv('01,Placebo,183,COMPLETED', '02,Placebo,27,DISCONTINUED');
    expect(firstDifferingRow(committed, generated)).toEqual({
      row: 3,
      committed: '02,Placebo,28,DISCONTINUED',
      generated: '02,Placebo,27,DISCONTINUED'
    });
    expect(firstDifferingRow('USUBJID,ARM\n', 'USUBJID,TRT\n').row).toBe(1);
  });

  it('reports a row only one side has as missing from the other (#140)', () => {
    const short = csv('01,Placebo,183,COMPLETED');
    const long = csv('01,Placebo,183,COMPLETED', '02,Placebo,27,DISCONTINUED');
    expect(firstDifferingRow(short, long)).toEqual({
      row: 3,
      committed: null,
      generated: '02,Placebo,27,DISCONTINUED'
    });
    expect(firstDifferingRow(long, short)).toEqual({
      row: 3,
      committed: '02,Placebo,27,DISCONTINUED',
      generated: null
    });
  });

  it('catches a difference that is only the closing newline, keeping it visible (#140)', () => {
    const generated = csv('01,Placebo,183,COMPLETED');
    expect(firstDifferingRow(generated.trimEnd(), generated)).toEqual({
      row: 2,
      committed: '01,Placebo,183,COMPLETED',
      generated: '01,Placebo,183,COMPLETED\n'
    });
  });
});

describe('demoDataDrift', () => {
  const generated = {
    'adae.csv': 'USUBJID,AETERM\n01,HEADACHE\n',
    'adbds.csv': 'USUBJID,TEST,STRESN\n01,Albumin,40\n01,Albumin,41\n',
    'adsl.csv': csv('01,Placebo,183,COMPLETED')
  };

  it('reports no drift when every committed file matches its generated twin (#140)', () => {
    expect(demoDataDrift({ ...generated }, generated)).toEqual([]);
  });

  it('names the first differing file and row (#140)', () => {
    const committed = {
      ...generated,
      'adbds.csv': 'USUBJID,TEST,STRESN\n01,Albumin,40\n01,Albumin,44\n',
      'adsl.csv': csv('01,Placebo,184,COMPLETED')
    };
    const drift = demoDataDrift(committed, generated);
    // Files are compared in name order, so "first" is stable from run to run.
    expect(drift.map((d) => d.file)).toEqual(['adbds.csv', 'adsl.csv']);
    expect(drift[0]).toEqual({
      file: 'adbds.csv',
      reason: 'differs',
      row: 3,
      committed: '01,Albumin,44',
      generated: '01,Albumin,41'
    });
  });

  it('flags a committed file no generator produces and a generated file that is not committed (#140)', () => {
    const committed = { 'adae.csv': generated['adae.csv'], 'notes.csv': 'A,B\n1,2\n' };
    expect(demoDataDrift(committed, generated)).toEqual([
      { file: 'adbds.csv', reason: 'not-committed' },
      { file: 'adsl.csv', reason: 'not-committed' },
      { file: 'notes.csv', reason: 'not-generated' }
    ]);
  });
});
