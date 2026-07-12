import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { calculateBins } from '../../../src/histogram/structureData.js';

// Binning QC against the original RhoInc/safety-histogram renderer (#19).
// Expectations are hand-computed from the original's onPreprocess pipeline
// (calculateBinWidth + the per-algorithm modules) and cross-validated by
// running the original source against d3 v3:
//   nBins = clamp(algorithmBins, nUnique); Scott/FD floor at 5 bins;
//   zero-spread → NaN algorithmBins → nUnique; SS = cost minimization
//   over 2..99 candidate bin counts (not a square-root stub).

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// Quote-aware CSV parse of the frozen ADBDS Albumin reference
// (fixtures/adbds-albumin-reference.csv) — the 531 Albumin results from the
// original vendored demo data, on which the #19 staging-review discrepancy was
// observed and against which the original renderer's bin parameters below were
// cross-validated. Kept as a fixed fixture (not the live site/data/adbds.csv,
// now sourced from pharmaverseadam — see scripts/build-demo-data.mjs) so this
// original-renderer QC stays anchored to the values it was validated against.
function loadAlbuminValues() {
  const csvPath = new URL('./fixtures/adbds-albumin-reference.csv', import.meta.url);
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...records] = rows.filter((cells) => cells.length > 1);
  const test = header.indexOf('TEST');
  const value = header.indexOf('STRESN');
  return records
    .filter((cells) => cells[test] === 'Albumin' && cells[value] !== '')
    .map((cells) => Number(cells[value]))
    .filter((v) => Number.isFinite(v));
}

describe('histogram binning matches the original renderer (#19)', () => {
  it("SH-CTRL-006: Scott's rule and Freedman-Diaconis enforce the original's 5-bin floor (#19)", () => {
    // 1..10: Scott width = 3.5·sd/∛n = 3.5·3.0277/2.1544 = 4.9190 →
    // ceil(9/4.9190) = 2 raw bins; the original floors at 5 (10 unique values).
    expect(
      calculateBins(range(10), "Scott's normal reference rule", null, null, null).quantity
    ).toBe(5);
    // 1..10: FD width = 2·iqr/∛n = 2·4.5/2.1544 = 4.1775 → ceil(9/4.1775) = 3
    // raw bins; floored at 5.
    expect(calculateBins(range(10), "Freedman-Diaconis' choice", null, null, null).quantity).toBe(
      5
    );
  });

  it('SH-CTRL-006: bin quantity is clamped to the count of unique results (#19)', () => {
    // [5,5,5,7,7,7]: 2 unique results. Scott: sd = 1.0954, width = 2.1100 →
    // ceil(2/2.1100) = 1 → floored to 5 → clamped to nUnique = 2.
    const scott = calculateBins(
      [5, 5, 5, 7, 7, 7],
      "Scott's normal reference rule",
      null,
      null,
      null
    );
    expect(scott.quantity).toBe(2);
    expect(scott.width).toBe(1);
    // Square-root choice: ceil(√6) = 3 → clamped to 2.
    expect(calculateBins([5, 5, 5, 7, 7, 7], 'Square-root choice', null, null, null).quantity).toBe(
      2
    );
  });

  it('SH-CTRL-006: zero-spread results collapse to a single bin (#19)', () => {
    // All-equal values: Scott width = 0 → NaN bins in the original →
    // NaN < nUnique is false → nBins = nUnique = 1.
    expect(
      calculateBins([4, 4, 4, 4], "Scott's normal reference rule", null, null, null).quantity
    ).toBe(1);
  });

  it("SH-CTRL-006: Shimazaki-Shinomoto minimizes the original's cost function (#19)", () => {
    // Validated by executing the original calculateSSBinWidth against d3 v3:
    // uniform 1..100 → 2 bins (not the ceil(√n) = 10 stub).
    expect(
      calculateBins(range(100), "Shimazaki and Shinomoto's choice", null, null, null).quantity
    ).toBe(2);
    // Duplicated pairs 1..5 → 2 bins.
    expect(
      calculateBins(
        [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
        "Shimazaki and Shinomoto's choice",
        null,
        null,
        null
      ).quantity
    ).toBe(2);
  });

  it("SH-CTRL-006: ADBDS Albumin reproduces the original renderer's bin parameters (#19)", () => {
    const values = loadAlbuminValues();
    expect(values).toHaveLength(531);

    // Scott (the demo default): sd = 10.0021, width = 3.5·sd/∛531 = 4.3231 →
    // ceil(61.1893/4.3231) = 15 bins over the raw extent; final width =
    // range/15 = 4.0793.
    const scott = calculateBins(values, "Scott's normal reference rule", null, null, null);
    expect(scott.quantity).toBe(15);
    expect(scott.width).toBeCloseTo(4.079285617501793, 10);
    expect(scott.domain[0]).toBeCloseTo(18.6211696356937, 10);
    expect(scott.domain[1]).toBeCloseTo(79.8104538982206, 10);
    expect(scott.bins).toHaveLength(15);
    expect(scott.bins.reduce((sum, bin) => sum + bin.records.length, 0)).toBe(531);

    // Freedman-Diaconis: iqr = 13.3218, width = 2·iqr/∛531 = 3.2828 →
    // ceil(61.1893/3.2828) = 19 bins.
    expect(calculateBins(values, "Freedman-Diaconis' choice", null, null, null).quantity).toBe(19);

    // Shimazaki-Shinomoto cost minimization picks 6 bins (validated against
    // the original run under d3 v3; nearest competitor cost is well separated).
    expect(
      calculateBins(values, "Shimazaki and Shinomoto's choice", null, null, null).quantity
    ).toBe(6);
  });
});
