import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SORT_OPTIONS, syncSettings } from '../../../src/ae-timelines/configure.js';

// Settings defaults + merge for the ae-timelines module (#26), matching the
// original renderer's defaultSettings.js/syncSettings behavior. Requirement
// keys reference the safety.agent matrix via docs/ae-timelines-coverage.md.

describe('ae-timelines configure', () => {
  it('AET-DATA-001/AET-DATA-004: default settings map the standard ADaM adverse-event columns (#26)', () => {
    const settings = syncSettings({});
    expect(settings.id_col).toBe('USUBJID');
    expect(settings.seq_col).toBe('AESEQ');
    expect(settings.stdy_col).toBe('ASTDY');
    expect(settings.endy_col).toBe('AENDY');
    expect(settings.term_col).toBe('AETERM');
    expect(settings.page_size).toBe(10);
    expect(DEFAULT_SETTINGS.sort_participants).toBe('earliest');
    expect(SORT_OPTIONS).toEqual(['earliest', 'alphabetical-descending']);
  });

  it('AET-CFG-005/AET-CFG-006/AET-DATA-003: the color object defaults to severity levels and merges overrides (#26)', () => {
    const defaults = syncSettings({});
    expect(defaults.color.value_col).toBe('AESEV');
    expect(defaults.color.label).toBe('Severity/Intensity');
    expect(defaults.color.values).toEqual(['MILD', 'MODERATE', 'SEVERE']);
    expect(defaults.color.colors[0]).toBe('#66bd63');

    // A coloring variable is required but does not have to be AESEV.
    const custom = syncSettings({ color: { value_col: 'AEREL', label: 'Relationship' } });
    expect(custom.color.value_col).toBe('AEREL');
    expect(custom.color.label).toBe('Relationship');
    expect(custom.color.values).toEqual(['MILD', 'MODERATE', 'SEVERE']);
  });

  it('AET-CFG-007/AET-CFG-008/AET-CFG-009/AET-CFG-010: the highlight object defaults to serious events and merges overrides (#26)', () => {
    const defaults = syncSettings({});
    expect(defaults.highlight.value_col).toBe('AESER');
    expect(defaults.highlight.label).toBe('Serious Event');
    expect(defaults.highlight.value).toBe('Y');
    expect(defaults.highlight.detail_col).toBeNull();
    expect(defaults.highlight.attributes.stroke).toBe('black');

    const custom = syncSettings({
      highlight: { value: 'YES', detail_col: 'AESERDTL', attributes: { 'stroke-width': 3 } }
    });
    expect(custom.highlight.value_col).toBe('AESER');
    expect(custom.highlight.value).toBe('YES');
    expect(custom.highlight.detail_col).toBe('AESERDTL');
    expect(custom.highlight.attributes['stroke-width']).toBe(3);
    expect(custom.highlight.attributes.stroke).toBe('black');

    // highlight: null disables serious-event marking entirely.
    expect(syncSettings({ highlight: null }).highlight).toBeNull();
  });

  it('AET-FUNC-002/AET-FUNC-003/AET-FUNC-004: default filters are serious event, severity, and participant ID (#26)', () => {
    const settings = syncSettings({});
    expect(settings.filters).toEqual([
      { value_col: 'AESER', label: 'Serious Event' },
      { value_col: 'AESEV', label: 'Severity/Intensity' },
      { value_col: 'USUBJID', label: 'Participant Identifier' }
    ]);
    // Without a highlight, the serious-event filter is not offered.
    expect(syncSettings({ highlight: null }).filters.map((filter) => filter.value_col)).toEqual([
      'AESEV',
      'USUBJID'
    ]);
  });

  it('AET-FUNC-005/AET-CFG-011: custom filters replace the defaults and normalize strings to specs (#26)', () => {
    const settings = syncSettings({ filters: [{ value_col: 'SEX', label: 'Sex' }, 'RACE'] });
    expect(settings.filters).toEqual([
      { value_col: 'SEX', label: 'Sex' },
      { value_col: 'RACE', label: 'RACE' }
    ]);
  });

  it('AET-CFG-012/AET-FUNC-009: details default to sequence, days, term, severity, and seriousness without duplicates (#26)', () => {
    const settings = syncSettings({});
    expect(settings.details).toEqual([
      { value_col: 'AESEQ', label: 'Sequence Number' },
      { value_col: 'ASTDY', label: 'Start Day' },
      { value_col: 'AENDY', label: 'Stop Day' },
      { value_col: 'AETERM', label: 'Reported Term' },
      { value_col: 'AESEV', label: 'Severity/Intensity' },
      { value_col: 'AESER', label: 'Serious Event' }
    ]);

    // A highlight detail column joins the defaults.
    const detail = syncSettings({ highlight: { detail_col: 'AESERDTL' } });
    expect(detail.details.some((column) => column.value_col === 'AESERDTL')).toBe(true);

    // Custom details append after the defaults, deduplicated by column.
    const custom = syncSettings({ details: ['AEDECOD', 'AETERM'] });
    expect(custom.details.filter((column) => column.value_col === 'AETERM')).toHaveLength(1);
    expect(custom.details.at(-1)).toEqual({ value_col: 'AEDECOD', label: 'AEDECOD' });
  });

  it('AET-FUNC-006: the participant sort defaults to earliest and rejects unknown orders (#26)', () => {
    expect(syncSettings({}).sort_participants).toBe('earliest');
    expect(syncSettings({ sort_participants: 'alphabetical-descending' }).sort_participants).toBe(
      'alphabetical-descending'
    );
    expect(syncSettings({ sort_participants: 'bogus' }).sort_participants).toBe('earliest');
  });
});
