import { describe, it, expect } from 'vitest';
import { buildDatasets, tooltipLines, withAlpha } from '../../../src/ae-timelines/getPlugins.js';
import { syncSettings } from '../../../src/ae-timelines/configure.js';

// Mark and tooltip construction for the ae-timelines module (#26): one
// floating-bar dataset per severity level plus the serious-event legend
// entry, and the original renderer's term/start/stop tooltip text.

const settings = syncSettings({});

const events = [
  {
    subject: 'SUBJ-01',
    seq: '1',
    start: 5,
    end: 12,
    term: 'Headache',
    color: 'MILD',
    serious: false,
    record: { AETERM: 'Headache', ASTDY: '5', AENDY: '12', AESER: 'N' }
  },
  {
    subject: 'SUBJ-01',
    seq: '2',
    start: 20,
    end: 25,
    term: 'Nausea',
    color: 'MODERATE',
    serious: true,
    record: { AETERM: 'Nausea', ASTDY: '20', AENDY: '25', AESER: 'Y' }
  }
];

describe('ae-timelines getPlugins', () => {
  it('AET-FUNC-003: one dataset per color-domain level, colored in the configured order (#26)', () => {
    const domain = ['MILD', 'MODERATE', 'SEVERE', 'N/A'];
    const datasets = buildDatasets(events, domain, settings);
    // Every domain level gets a dataset (so the legend always shows the
    // configured levels) plus the serious-event legend entry.
    expect(datasets.map((dataset) => dataset.label)).toEqual([
      'MILD',
      'MODERATE',
      'SEVERE',
      'N/A',
      'Serious Event'
    ]);
    const mild = datasets[0];
    expect(mild.data).toEqual([{ x: [5, 12], y: 'SUBJ-01', __aet: events[0] }]);
    expect(mild.borderColor).toBe('#66bd63');
    expect(mild.backgroundColor).toBe(withAlpha('#66bd63', 0.5));
    expect(mild.grouped).toBe(false);
    const na = datasets[3];
    expect(na.borderColor).toBe('#999999');
    expect(na.data).toEqual([]);
  });

  it('AET-FUNC-002/AET-REG-006: the serious-event legend dataset draws nothing but carries the highlight style (#26)', () => {
    const datasets = buildDatasets(events, ['MILD', 'MODERATE'], settings);
    const serious = datasets.at(-1);
    expect(serious.label).toBe('Serious Event');
    expect(serious.data).toEqual([]);
    expect(serious.borderColor).toBe('black');
    expect(serious.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    // Without a highlight configuration the legend entry is omitted.
    const none = buildDatasets(events, ['MILD', 'MODERATE'], syncSettings({ highlight: null }));
    expect(none.map((dataset) => dataset.label)).toEqual(['MILD', 'MODERATE']);
  });

  it('AET-FUNC-008/AET-REG-004: tooltips report the term, start day, and stop day (#26)', () => {
    expect(tooltipLines(events[0], settings)).toEqual([
      'Reported Term: Headache',
      'Start Day: 5',
      'Stop Day: 12'
    ]);
  });

  it('AET-FUNC-002/AET-CFG-009: serious events append the highlight label and detail to the tooltip (#26)', () => {
    expect(tooltipLines(events[1], settings)).toEqual([
      'Reported Term: Nausea',
      'Start Day: 20',
      'Stop Day: 25',
      'Serious Event: Y'
    ]);
    const detailSettings = syncSettings({ highlight: { detail_col: 'AESERDTL' } });
    const detailEvent = {
      ...events[1],
      record: { ...events[1].record, AESERDTL: 'Hospitalization' }
    };
    expect(tooltipLines(detailEvent, detailSettings).at(-1)).toBe('Serious Event: Hospitalization');
  });

  it('AET-FUNC-003: withAlpha converts hex colors to rgba fills (#26)', () => {
    expect(withAlpha('#66bd63', 0.5)).toBe('rgba(102, 189, 99, 0.5)');
    expect(withAlpha('#999999', 1)).toBe('rgba(153, 153, 153, 1)');
  });
});
