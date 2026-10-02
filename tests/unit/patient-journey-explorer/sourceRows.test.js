import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSourceUrl, sourceColumns } from '../../../src/patient-journey-explorer/sourceRows.js';

// The pure half of the source-row drawer (#142, design §6.7): the external
// link-out built from source_url_template, and the column set of the raw-row
// table. The DOM drawer itself is covered in the browser suite. PJE-SRC-002.

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('buildSourceUrl', () => {
  it('PJE-SRC-002: {domain} and each {COLUMN} token are replaced with the URI-encoded row values (#142)', () => {
    const row = { USUBJID: '01-716/1447', AESEQ: 7, AETERM: 'RASH & ITCH' };
    expect(buildSourceUrl(row, 'AE', 'https://edc.example/{domain}/{USUBJID}/{AESEQ}')).toBe(
      'https://edc.example/AE/01-716%2F1447/7'
    );
    expect(buildSourceUrl(row, 'AE', 'https://edc.example/?term={AETERM}')).toBe(
      'https://edc.example/?term=RASH%20%26%20ITCH'
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('PJE-SRC-002: a template naming a column the row lacks returns null with one warning (#142)', () => {
    const row = { USUBJID: 'P1' };
    expect(buildSourceUrl(row, 'AE', 'https://edc.example/{domain}/{USUBJID}/{AESEQ}')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('AESEQ');
    // The caller that batches per render can silence the per-call warning.
    expect(buildSourceUrl(row, 'AE', 'https://edc.example/{AESEQ}', { warn: false })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('PJE-SRC-002: no template means no link and no warning (#142)', () => {
    expect(buildSourceUrl({ USUBJID: 'P1' }, 'AE', null)).toBeNull();
    expect(buildSourceUrl({ USUBJID: 'P1' }, 'AE', undefined)).toBeNull();
    expect(buildSourceUrl({ USUBJID: 'P1' }, 'AE', '')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('PJE-SRC-002: a template with no tokens is returned as-is and a null cell is an empty value, not "null" (#142)', () => {
    expect(buildSourceUrl({ USUBJID: 'P1' }, 'AE', 'https://edc.example/')).toBe(
      'https://edc.example/'
    );
    expect(buildSourceUrl({ USUBJID: 'P1', AESEQ: null }, 'AE', 'https://x/{AESEQ}')).toBe(
      'https://x/'
    );
  });
});

describe('sourceColumns', () => {
  it('returns the union of keys in first-seen order with __pje_* columns filtered out (#142)', () => {
    const rows = [
      { USUBJID: 'P1', AETERM: 'RASH', __pje_dropReason: 'x' },
      { AESEQ: 2, USUBJID: 'P1', __pje_domain: 'AE' },
      { USUBJID: 'P2', AESEV: 'MILD', AETERM: 'ITCH' }
    ];
    expect(sourceColumns(rows)).toEqual(['USUBJID', 'AETERM', 'AESEQ', 'AESEV']);
  });

  it('is empty for no rows and ignores non-object rows (#142)', () => {
    expect(sourceColumns([])).toEqual([]);
    expect(sourceColumns(null)).toEqual([]);
    expect(sourceColumns([null, { A: 1 }, 'x'])).toEqual(['A']);
  });
});
