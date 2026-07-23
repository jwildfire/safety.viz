// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Chart.js is replaced with a recording stub — measureTable pulls in the inset
// (Chart.js) for its expand lifecycle, but this suite pins the table DOM.
const built = [];

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.config = config;
      this.destroyed = false;
      built.push(this);
    }
    update() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { formatSummary, listingColumns, renderMeasureTable, renderRecordListing } =
  await import('../../../src/participant-profile/measureTable.js');
const { syncSettings } = await import('../../../src/participant-profile/configure.js');

function makeMeasure(overrides) {
  return {
    key: 'ALT',
    label: 'Aminotransferase, alanine (ALT)',
    isKey: true,
    color: '#e41a1c',
    n: 3,
    min: 35,
    median: 80,
    max: 160,
    populationExtent: [20, 200],
    spark: [
      { day: 0, value: 35, lln: 5, uln: 40, outlier: false },
      { day: 30, value: 160, lln: 5, uln: 40, outlier: true },
      { day: 60, value: 80, lln: 5, uln: 40, outlier: true }
    ],
    ...overrides
  };
}

const alt = makeMeasure({});
const tb = makeMeasure({
  key: 'TB',
  label: 'Total Bilirubin',
  color: '#377eb8',
  n: 2,
  min: 0.8,
  median: 1.7,
  max: 2.6,
  populationExtent: [0.4, 3],
  spark: [
    { day: 0, value: 0.8, lln: 0.2, uln: 1, outlier: false },
    { day: 30, value: 2.6, lln: 0.2, uln: 1, outlier: true }
  ]
});
const creat = makeMeasure({
  key: 'Creatinine',
  label: 'Creatinine',
  isKey: false,
  color: '#4daf4a',
  n: 3,
  min: 0.7,
  median: 0.9,
  max: 1.5,
  populationExtent: [0.7, 1.5],
  spark: [
    { day: 0, value: 0.9, lln: 0.8, uln: 1.2, outlier: false },
    { day: 30, value: 1.5, lln: 0.8, uln: 1.2, outlier: true },
    { day: 60, value: 0.7, lln: 0.8, uln: 1.2, outlier: true }
  ]
});

const settings = { measure_col: 'TEST' };

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '<div id="host"></div>';
});

function host() {
  return document.querySelector('#host');
}

describe('formatSummary (PPRF-4)', () => {
  it('formats to two decimals (parity 0.2f), blank when not finite', () => {
    expect(formatSummary(1.234)).toBe('1.23');
    expect(formatSummary(35)).toBe('35.00');
    expect(formatSummary(NaN)).toBe('');
    expect(formatSummary(undefined)).toBe('');
  });
});

describe('renderMeasureTable (PPRF-4)', () => {
  it('renders one row per measure in model (key-first) order with summary columns', () => {
    renderMeasureTable(host(), [alt, tb, creat], settings, {});
    const headers = [...host().querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Measure', 'N', 'Min', 'Median', 'Max', 'Spark']);
    const rows = [...host().querySelectorAll('tbody tr.sv-profile-measure-row')];
    expect(rows.map((row) => row.dataset.key)).toEqual(['ALT', 'TB', 'Creatinine']);
    const cells = [...rows[0].querySelectorAll('td')].map((td) => td.textContent);
    expect(cells.slice(0, 5)).toEqual([
      'Aminotransferase, alanine (ALT)',
      '3',
      '35.00',
      '80.00',
      '160.00'
    ]);
  });

  it('puts a keyboard-operable toggle and a sparkline in every spark cell', () => {
    renderMeasureTable(host(), [alt, tb], settings, {});
    const cells = [...host().querySelectorAll('td.sv-profile-spark')];
    expect(cells).toHaveLength(2);
    cells.forEach((cell) => {
      const button = cell.querySelector('button.sv-profile-spark-toggle');
      expect(button).not.toBeNull();
      expect(button.type).toBe('button');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(button.textContent).toBe('▽');
      expect(cell.querySelector('svg.sv-spark')).not.toBeNull();
    });
  });

  it('hides extra measures by default behind the parity toggle copy', () => {
    renderMeasureTable(host(), [alt, tb, creat], settings, {});
    const extraRow = host().querySelector('tr[data-key="Creatinine"]');
    expect(extraRow.style.display).toBe('none');
    expect(host().textContent).toContain('Show 1 additional measure:');
  });

  it('reveals and re-hides extra rows through the toggle, reporting the change', () => {
    const onToggleExtras = vi.fn();
    renderMeasureTable(host(), [alt, tb, creat], settings, {}, { onToggleExtras });
    const checkbox = host().querySelector('.sv-profile-extras input');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    const extraRow = host().querySelector('tr[data-key="Creatinine"]');
    expect(extraRow.style.display).not.toBe('none');
    expect(onToggleExtras).toHaveBeenCalledWith(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(extraRow.style.display).toBe('none');
    expect(onToggleExtras).toHaveBeenCalledWith(false);
  });

  it('collapses an open extra-row inset when extras are hidden again', () => {
    renderMeasureTable(host(), [alt, creat], settings, { showExtras: true });
    host().querySelector('tr[data-key="Creatinine"] .sv-profile-spark-toggle').click();
    expect(built).toHaveLength(1);
    const checkbox = host().querySelector('.sv-profile-extras input');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(built[0].destroyed).toBe(true);
    expect(host().querySelector('.sv-profile-inset-row')).toBeNull();
  });

  it('shows extras from the start when the state says so, and omits the toggle without extras', () => {
    renderMeasureTable(host(), [alt, tb, creat], settings, { showExtras: true });
    expect(host().querySelector('tr[data-key="Creatinine"]').style.display).not.toBe('none');
    document.body.innerHTML = '<div id="host"></div>';
    renderMeasureTable(host(), [alt, tb], settings, {});
    expect(host().querySelector('.sv-profile-extras')).toBeNull();
  });
});

describe('record listing (PPRF-4, optional)', () => {
  const rows = [
    { TEST: 'Total Bilirubin', VISIT: 'Baseline', DY: 0, STRESN: 0.8, STRESU: 'mg/dL' },
    { TEST: 'Total Bilirubin', VISIT: 'Day 30', DY: 30, STRESN: 2.6, STRESU: 'mg/dL' },
    { TEST: 'Aminotransferase, alanine (ALT)', VISIT: 'Baseline', DY: 0, STRESN: 35, STRESU: 'U/L' }
  ];

  it('derives default listing columns from the lab mapping, skipping absent columns', () => {
    const cols = listingColumns(syncSettings({}));
    expect(cols).toEqual([
      { value_col: 'TEST', label: 'Measure' },
      { value_col: 'VISIT', label: 'Visit' },
      { value_col: 'DY', label: 'Study Day' },
      { value_col: 'STRESN', label: 'Value' },
      { value_col: 'STRESU', label: 'Unit' }
    ]);
    const noVisit = listingColumns(syncSettings({ visit_col: null, unit_col: null }));
    expect(noVisit.map((col) => col.value_col)).toEqual(['TEST', 'DY', 'STRESN']);
  });

  it('renders the participant records through the shared listing renderer', () => {
    renderRecordListing(host(), rows, syncSettings({}));
    const listing = host().querySelector('.sv-profile-listing');
    expect(listing).not.toBeNull();
    expect(listing.textContent).toContain('3 of 3 records');
    const headers = [...listing.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Measure', 'Visit', 'Study Day', 'Value', 'Unit']);
    expect(listing.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('honors a listing_cols override', () => {
    renderRecordListing(host(), rows, syncSettings({ listing_cols: ['TEST', 'STRESN'] }));
    const headers = [...host().querySelectorAll('.sv-profile-listing thead th')].map(
      (th) => th.textContent
    );
    expect(headers).toEqual(['TEST', 'STRESN']);
  });
});

describe('listing settings (configure)', () => {
  it('defaults the listing off with derived columns and page size 10', () => {
    const synced = syncSettings({});
    expect(synced.listing).toBe(false);
    expect(synced.listing_cols).toBeNull();
    expect(synced.listing_page_size).toBe(10);
  });

  it('normalizes listing_cols to field specs', () => {
    const synced = syncSettings({
      listing: true,
      listing_cols: ['TEST', { value_col: 'STRESN', label: 'Result' }]
    });
    expect(synced.listing).toBe(true);
    expect(synced.listing_cols).toEqual([
      { value_col: 'TEST', label: 'TEST' },
      { value_col: 'STRESN', label: 'Result' }
    ]);
  });
});
