// @vitest-environment jsdom
// histogram adopts the participant-profile dock (#99, PPRF-10/11): the
// histogram's natural participant surface is the SHARED linked listing a bin
// click opens, so the adoption adds an opt-in listing-row click — presence of
// the host's onListingRowClick callback makes rows focusable/clickable, keyed
// by the participant id — that feeds the docked module through a NEW host
// selection state (state.selectedId) and the house participantsSelected
// dispatch on the shell root. The listing itself stays (records vs story,
// PPRF-11); other consumers of the shared listing renderer (outlier-explorer,
// shift-plot) opt out simply by not setting the callback.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.destroyed = false;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.built = [];
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: histogram } = await import('../../../src/histogram.js');
const { makeRows, ALT_TEST } = await import('../participant-profile/fixture.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

function build(settings = {}) {
  const instance = histogram(document.querySelector('#host'), {
    start_value: ALT_TEST,
    ...settings
  });
  instance.init(makeRows());
  return instance;
}

/** Open the shared listing over the current filtered rows (the bin-click path). */
function openListing(instance) {
  const rows = instance.currentFilteredData();
  instance.showListing(rows, { records: rows, lower: 0, upper: 9999 }, 0);
  return rows;
}

describe('histogram participant-profile adoption (PPRF-SH-001)', () => {
  it('PPRF-SH-001: mounts the dock by default (config-on) into the shell profile slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    expect(instance.profileWrap.children).toHaveLength(0); // idle until a selection
  });

  it('PPRF-SH-001: profile: false leaves the slot empty and mounts no dock', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    instance.selectParticipant('P1');
    expect(instance.profileWrap.children).toHaveLength(0);
  });

  it('PPRF-SH-001: derives the dock feed rows ONCE per setData through the hep-core cleaners', () => {
    const rows = makeRows();
    // A row without a usable ULN never reaches the dock (the ×ULN denominator).
    rows.push({ USUBJID: 'P9', TEST: ALT_TEST, STRESN: 50, STNRHI: '' });
    const instance = histogram(document.querySelector('#host'), { start_value: ALT_TEST });
    instance.init(rows);
    expect(instance.profileRows.length).toBe(rows.length - 1);
    expect(instance.profileRows.every((row) => Number.isFinite(row.__hep_relative_uln))).toBe(true);
  });

  it('PPRF-SH-001: passes the host lab mappings and profile_details through to the dock', () => {
    const instance = build({
      studyday_col: 'DY',
      visit_col: 'VISIT',
      visitn_col: 'VISITNUM',
      profile_details: [{ value_col: 'SEX', label: 'Sex' }],
      participantProfileURL: 'https://x.test/{id}'
    });
    expect(instance.profile.settings.id_col).toBe('USUBJID');
    expect(instance.profile.settings.normal_col_high).toBe('STNRHI');
    expect(instance.profile.settings.studyday_col).toBe('DY');
    expect(instance.profile.settings.visit_col).toBe('VISIT');
    expect(instance.profile.settings.details).toEqual([{ value_col: 'SEX', label: 'Sex' }]);
    expect(instance.profile.settings.participantProfileURL).toBe('https://x.test/{id}');
  });

  it('PPRF-SH-001: host listing columns are NOT the dock header details (profile_details defaults empty)', () => {
    const instance = build();
    expect(instance.profile.settings.details).toEqual([]);
  });
});

describe('histogram listing-row focus gesture (PPRF-SH-002, PPRF-11)', () => {
  it('PPRF-SH-002: listing rows are interactive only when the host opts in via onListingRowClick', () => {
    const instance = build();
    openListing(instance);
    const row = instance.listingWrap.querySelector('tbody tr');
    expect(row.classList.contains('sv-listing-rowlink')).toBe(true);
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute('role')).toBe('button');
    // The shared-listing guard: without the callback (outlier-explorer /
    // shift-plot) rows render byte-identical to the pre-#99 listing.
    instance.onListingRowClick = null;
    openListing(instance);
    const plain = instance.listingWrap.querySelector('tbody tr');
    expect(plain.classList.contains('sv-listing-rowlink')).toBe(false);
    expect(plain.hasAttribute('tabindex')).toBe(false);
    expect(plain.getAttribute('role')).toBeNull();
  });

  it('PPRF-SH-002: clicking a listing row focuses the participant — dock full profile, row highlight, listing stays', () => {
    const instance = build({ studyday_col: 'DY' });
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    openListing(instance);
    instance.listingWrap.querySelector('tbody tr').click();
    // Full profile, no stepper (single-select gesture, N always 1).
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
    expect(instance.profileWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(instance.profileWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The dispatch travelled via the shell root with the house payload.
    expect(heard).toEqual([['P1']]);
    // The linked listing stays (PPRF-11: records vs story) with the row lit.
    const selected = instance.listingWrap.querySelectorAll('tr.sv-listing-row-selected');
    expect(selected.length).toBeGreaterThan(0);
    [...selected].forEach((tr) => {
      expect(tr.querySelector('td').textContent).toBe('P1');
    });
  });

  it('PPRF-SH-002: Enter on a focused listing row activates the same path (keyboard parity)', () => {
    const instance = build();
    openListing(instance);
    const row = instance.listingWrap.querySelector('tbody tr');
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(instance.state.selectedId).toBe('P1');
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('PPRF-SH-002: is idempotent under repeated identical dispatches', () => {
    const instance = build();
    openListing(instance);
    instance.selectParticipant('P1');
    const rootBefore = instance.profileWrap.querySelector('.sv-profile-root');
    instance.dispatchSelection(['P1']);
    expect(instance.profileWrap.querySelector('.sv-profile-root')).toBe(rootBefore);
  });

  it('PPRF-SH-002: stepping an externally-fed cohort moves the row highlight without touching the host selection or re-dispatching', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    openListing(instance);
    // A root-level dispatch the host did not originate (the shared-selector
    // shape, #87) — the dock collapses to the worst-first stepper.
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['P3', 'P1'] }, bubbles: true })
    );
    expect(instance.profileWrap.querySelector('.sv-profile-step-count').textContent).toContain(
      '1 of 2'
    );
    const heardBefore = heard.length;
    instance.profileWrap.querySelector('.sv-profile-step-next').click();
    const steppedId = instance.profileWrap
      .querySelector('.sv-profile-id')
      .textContent.replace('Participant ', '');
    // The row highlight tracked the stepped participant…
    expect(String(instance.listingSelectedId)).toBe(steppedId);
    // …without converting the cohort into a host single-selection…
    expect(instance.state.selectedId).toBeNull();
    // …and dispatched nothing (the selection still belongs to the feeder).
    expect(heard).toHaveLength(heardBefore);
  });
});

describe('histogram dock clear paths (PPRF-SH-003, PPRF-11)', () => {
  it('PPRF-SH-003: the dock Clear affordance routes through the host clear path — row un-highlights, listing stays', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    openListing(instance);
    instance.listingWrap.querySelector('tbody tr').click();
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(instance.listingWrap.querySelectorAll('tr.sv-listing-row-selected')).toHaveLength(0);
    // The listing itself is retained — Clear clears the focus, not the records.
    expect(instance.listingWrap.querySelector('table')).not.toBeNull();
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-SH-003: a new bin click replaces the listing and clears the focused participant', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    openListing(instance);
    instance.listingWrap.querySelector('tbody tr').click();
    expect(heard.at(-1)).toEqual(['P1']);
    openListing(instance); // the next bin click
    expect(instance.state.selectedId).toBeNull();
    expect(heard.at(-1)).toEqual([]);
    expect(instance.profileWrap.children).toHaveLength(0);
  });

  it('PPRF-SH-003: dock Clear empties an externally-fed cohort the host never selected (PPRF-11)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['P1', 'P2'] }, bubbles: true })
    );
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    expect(instance.state.selectedId).toBeNull();
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-SH-003: a control-driven render resets the selection AND the dock (render preamble)', () => {
    const instance = build();
    openListing(instance);
    instance.listingWrap.querySelector('tbody tr').click();
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    instance.render();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    // And the guard reset means the next identical selection re-feeds the dock.
    openListing(instance);
    instance.listingWrap.querySelector('tbody tr').click();
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe('Participant P1');
  });

  it('PPRF-SH-003: destroy tears the dock down with the instance', () => {
    const instance = build();
    openListing(instance);
    instance.selectParticipant('P1');
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
    expect(instance.profile).toBeNull();
  });

  it('PPRF-SH-001: setSettings({profile: false}) unmounts a live dock; re-enabling remounts it', () => {
    const instance = build();
    openListing(instance);
    instance.selectParticipant('P1');
    instance.setSettings({ profile: false, start_value: ALT_TEST });
    expect(instance.profile).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    instance.setSettings({ profile: true, start_value: ALT_TEST });
    expect(instance.profile).toBeTruthy();
  });
});
