// Settings defaults + merge, extracted verbatim from the safety-histogram pilot
// (dev @ a3ff9f7) under #2.

export const DEFAULT_SETTINGS = {
  measure_col: 'TEST',
  value_col: 'STRESN',
  id_col: 'USUBJID',
  unit_col: 'STRESU',
  normal_col_low: 'STNRLO',
  normal_col_high: 'STNRHI',
  filters: [],
  groups: [],
  details: null,
  start_value: null,
  bin_algorithm: "Scott's normal reference rule",
  normal_range: true,
  display_normal_range: false,
  annotate_bin_boundaries: false,
  test_normality: false,
  group_by: 'sh_none',
  compare_distributions: false,
  width: '100%',
  height: 460,
  page_size: 10
};

export const ALGORITHMS = [
  'Square-root choice',
  "Sturges' formula",
  'Rice Rule',
  "Scott's normal reference rule",
  "Freedman-Diaconis' choice",
  "Shimazaki and Shinomoto's choice",
  'Custom'
];

export function arrayify(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function fieldSpec(value, fallbackLabel) {
  if (typeof value === 'string') return { value_col: value, label: fallbackLabel || value };
  return { value_col: value.value_col, label: value.label || value.value_col };
}

export function syncSettings(settings) {
  const synced = { ...DEFAULT_SETTINGS, ...settings };
  synced.filters = arrayify(synced.filters)
    .map(fieldSpec)
    .filter((d) => d.value_col);
  const defaultGroup = { value_col: 'sh_none', label: 'None' };
  synced.groups = [
    defaultGroup,
    ...arrayify(synced.groups)
      .map(fieldSpec)
      .filter((d) => d.value_col)
  ];
  if (synced.group_by && !synced.groups.some((group) => group.value_col === synced.group_by)) {
    synced.groups.push({ value_col: synced.group_by, label: synced.group_by });
  }
  synced.group_by = synced.groups.some((group) => group.value_col === synced.group_by)
    ? synced.group_by
    : synced.groups[0].value_col;
  synced.details = arrayify(synced.details)
    .map(fieldSpec)
    .filter((d) => d.value_col);
  if (!synced.details.length) {
    synced.details = [
      { value_col: synced.id_col, label: 'Participant ID' },
      ...synced.filters,
      { value_col: synced.value_col, label: 'Result' },
      { value_col: synced.normal_col_low, label: 'Lower Limit of Normal' },
      { value_col: synced.normal_col_high, label: 'Upper Limit of Normal' },
      { value_col: synced.unit_col, label: 'Unit' }
    ].filter((d) => d.value_col);
  }
  if (settings.displayNormalRange !== undefined)
    synced.display_normal_range = settings.displayNormalRange;
  return synced;
}
