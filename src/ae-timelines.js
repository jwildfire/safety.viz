// Public entrypoint for the ae-timelines module (#26): a Chart.js
// reimplementation of RhoInc/ae-timelines matching the original renderer's
// behavior, with the lifecycle API proven by the histogram module (init,
// setData, setSettings, render, resize, destroy). Internals follow the
// module flow (checkInputs → configure → structureData → getScales/getPlugins
// → new Chart); the participant detail listing reuses the histogram listing.

import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { SORT_OPTIONS, syncSettings } from './ae-timelines/configure.js';
import { checkInputs } from './ae-timelines/checkInputs.js';
import {
  applyFilters,
  buildTimelineRows,
  cleanData,
  colorDomain,
  populationCount,
  sortSubjects,
  unique
} from './ae-timelines/structureData.js';
import { buildScales, dayDomain } from './ae-timelines/getScales.js';
import { buildDatasets, timelineMarksPlugin, tooltipLines } from './ae-timelines/getPlugins.js';
import { renderListing } from './histogram/listing.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const TIMELINE_FOOTNOTE =
  'Hover over an adverse event for details. Click a participant ID to view participant details.';

/**
 * Interactive adverse-event timelines: a Chart.js horizontal floating-bar
 * chart with one row per participant and one bar per adverse event from
 * start to stop study day, severity color coding, serious-event marks,
 * filter and sort controls, and a click-through participant detail view
 * (per-event timeline + listing). Construct via the aeTimelines() factory
 * rather than directly; the constructor renders the control shell
 * immediately and waits for data.
 */
class AETimelines {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`AE Timelines target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanRows = [];
    this.filteredData = [];
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.charts = [];
    this.chart = null;
    this.detailChart = null;
    this.selectedParticipant = null;
    this.participantsSelected = [];
    this.state = {
      filters: {},
      sort: this.settings.sort_participants
    };
    this.renderShell();
  }

  /**
   * Build the static DOM shell the charts and listing render into, plus the
   * hidden participant detail view (back button, title, detail chart).
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-ae-timelines',
        onToggle: () => this.resize()
      })
    );
    this.footnote.textContent = TIMELINE_FOOTNOTE;

    this.detailWrap = createElement('div', 'sv-detail sv-hidden');
    const header = createElement('div', 'sv-listing-actions');
    this.backButton = createElement('button', null, '← Back');
    this.backButton.type = 'button';
    this.backButton.onclick = () => this.backToTimelines();
    this.detailTitle = createElement('strong');
    header.append(this.backButton, this.detailTitle);
    this.detailChartWrap = createElement('div', 'sv-chart-wrap');
    this.detailCanvas = document.createElement('canvas');
    this.detailChartWrap.append(this.detailCanvas);
    this.detailWrap.append(header, this.detailChartWrap);
    this.main.insertBefore(this.detailWrap, this.footnote);

    this.canvas.addEventListener('click', (event) => this.handleAxisClick(event));
    this.canvas.addEventListener('mousemove', (event) => {
      this.canvas.style.cursor = this.participantAt(event) === null ? '' : 'pointer';
    });
  }

  /**
   * Load data and render: an alias for setData that keeps the original
   * renderer's create-then-init call shape working (AET-DATA-004).
   * @param {Object[]} data Adverse-event records matching the ae-timelines data contract.
   * @returns {AETimelines} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing); records with blank terms
   * or non-integer start days are removed with console warnings while
   * AE-free placeholder rows still count toward the population; and the
   * filter controls are rebuilt from the new data's values.
   * @param {Object[]} data Adverse-event records matching the ae-timelines data contract.
   * @returns {AETimelines} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize them
   * (same rules as the factory), rebuild the controls, and re-render.
   * @param {AETimelinesSettings} settings Setting overrides to merge.
   * @returns {AETimelines} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.state.sort = this.settings.sort_participants;
    this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping and drop unusable
   * records, reporting the removal counts the way the original does.
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    this.population = populationCount(this.rawData, this.settings);
    const { rows, removedTerm, removedDay } = cleanData(this.rawData, this.settings);
    this.cleanRows = rows;
    this.removedTerm = removedTerm;
    this.removedDay = removedDay;
    if (removedTerm)
      console.warn(`${removedTerm} records without [ ${this.settings.term_col} ] removed.`);
    if (removedDay)
      console.warn(`${removedDay} records without [ ${this.settings.stdy_col} ] removed.`);
  }

  /**
   * Rebuild the filter and sort controls from the data and control state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);

    const domain = colorDomain(this.cleanRows, this.settings.color);
    const filterSpecs = this.settings.filters.filter((filter) => {
      const values = unique(this.cleanRows.map((row) => row[filter.value_col]));
      if (!values.length) {
        console.warn(
          `The [ ${filter.value_col} ] filter was removed because the variable does not exist.`
        );
        return false;
      }
      if (values.length < 2) {
        console.warn(
          `The [ ${filter.value_col} ] filter was removed because the variable has only one level.`
        );
        return false;
      }
      return true;
    });
    const filterParent = filterSpecs.length ? addSection('Filters') : this.controls;
    filterSpecs.forEach((filter) => {
      const select = addControl(filter.label, document.createElement('select'), filterParent);
      option(select, '__all__', 'All', !this.state.filters[filter.value_col]);
      const values = unique(this.cleanRows.map((row) => row[filter.value_col]));
      // The color filter lists its options in legend order, like the
      // original's sortLegendFilter; other filters sort alphabetically.
      const ordered =
        filter.value_col === this.settings.color.value_col
          ? domain.filter((value) => values.includes(value))
          : values.sort();
      ordered.forEach((value) =>
        option(select, value, value, this.state.filters[filter.value_col] === value)
      );
      select.onchange = () => {
        this.state.filters[filter.value_col] = select.value === '__all__' ? null : select.value;
        this.render();
      };
    });

    const sortParent = addSection('Sorting');
    const sort = addControl('Sort Participant IDs', document.createElement('select'), sortParent);
    SORT_OPTIONS.forEach((value) => option(sort, value, value, value === this.state.sort));
    sort.onchange = () => {
      this.state.sort = sort.value;
      this.render();
    };
  }

  /**
   * Cleaned records after the active filters.
   * @private
   */
  currentFilteredData() {
    return applyFilters(this.cleanRows, this.state.filters);
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * closes any open participant detail view, destroys the live charts, and
   * draws the timeline chart and the participant-count note. Called
   * automatically by the controls and the data/settings setters; call it
   * directly only after mutating state by hand.
   * @returns {void}
   */
  render() {
    this.closeDetail(true);
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.footnote.textContent = TIMELINE_FOOTNOTE;
    this.filteredData = this.currentFilteredData();
    this.updateNotes();
    if (!this.filteredData.length) {
      this.footnote.textContent = 'No adverse events match the current filters.';
      return;
    }
    const events = buildTimelineRows(this.filteredData, this.settings);
    this.currentDomain = dayDomain(events);
    const subjects = sortSubjects(this.filteredData, this.settings, this.state.sort);
    this.chartWrap.style.height = `${Math.max(240, subjects.length * this.settings.row_height + 120)}px`;
    this.chart = this.drawTimeline(this.canvas, events, this.currentDomain, subjects);
  }

  /**
   * Refresh the italicized shown/total participant annotation
   * (AET-FUNC-007, AET-REG-013) and the removed-record warnings.
   * @private
   */
  updateNotes() {
    const shown = unique(this.filteredData.map((row) => row[this.settings.id_col])).length;
    const pct = this.population ? ((shown / this.population) * 100).toFixed(1) : '0.0';
    const warnings = [
      this.removedTerm
        ? `${this.removedTerm} records without [ ${this.settings.term_col} ] removed.`
        : '',
      this.removedDay
        ? `${this.removedDay} records without [ ${this.settings.stdy_col} ] removed.`
        : ''
    ]
      .filter(Boolean)
      .join(' ');
    this.notes.innerHTML =
      `<em>${shown} of ${this.population} participant ID(s) shown (${pct}%)</em>` +
      (warnings ? `<span class="sv-warning">${warnings}</span>` : '');
  }

  /**
   * Draw one timeline chart — the main participant chart or the detail
   * per-event chart — with the shared datasets, scales, marks, and tooltips.
   * @private
   */
  drawTimeline(canvas, events, domain, labels) {
    const datasets = buildDatasets(events, colorDomain(this.cleanRows, this.settings.color), {
      ...this.settings
    });
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              title: (items) => (items.length ? String(items[0].raw.y) : ''),
              label: (ctx) => tooltipLines(ctx.raw.__aet, this.settings)
            }
          }
        },
        scales: buildScales({ domain, subjects: labels })
      },
      plugins: [timelineMarksPlugin(this.settings)]
    });
    chart.$aetEvents = events;
    this.charts.push(chart);
    return chart;
  }

  /**
   * The participant label at a canvas mouse event, or null when the event
   * is outside the y-axis label region.
   * @private
   */
  participantAt(event) {
    const chart = this.chart;
    if (!chart || this.selectedParticipant) return null;
    const { left, top, bottom } = chart.chartArea;
    if (event.offsetX >= left || event.offsetY < top || event.offsetY > bottom) return null;
    const index = Math.round(chart.scales.y.getValueForPixel(event.offsetY));
    const labels = chart.scales.y.getLabels();
    return index >= 0 && index < labels.length ? labels[index] : null;
  }

  /**
   * Open the participant detail view when a y-axis label is clicked
   * (AET-FUNC-009).
   * @private
   */
  handleAxisClick(event) {
    const participant = this.participantAt(event);
    if (participant !== null) this.showParticipantDetail(participant);
  }

  /**
   * Open the detail view for one participant: their per-event timeline on
   * the main chart's study-day domain (one row per sequence number), the
   * raw-record listing with search/sort/CSV export, and the Back button —
   * hiding the timelines and controls, and dispatching the
   * participantsSelected event with the selected ID.
   * @param {string} participant Participant ID to detail.
   * @returns {void}
   */
  showParticipantDetail(participant) {
    this.selectedParticipant = participant;
    this.sidebar.classList.add('sv-hidden');
    this.chartWrap.classList.add('sv-hidden');
    this.notes.classList.add('sv-hidden');
    this.detailWrap.classList.remove('sv-hidden');
    this.detailTitle.textContent = `Participant: ${participant}`;

    // Like the original, the detail view shows every one of the
    // participant's records regardless of the active filters, sorted by
    // sequence number.
    const rows = this.cleanRows
      .filter((row) => row[this.settings.id_col] === participant)
      .sort((a, b) => Number(a[this.settings.seq_col]) - Number(b[this.settings.seq_col]));
    const events = buildTimelineRows(rows, this.settings).map((event) => ({
      ...event,
      subject: String(event.seq)
    }));
    const seqs = events.map((event) => event.subject);
    this.detailChartWrap.style.height = `${Math.max(200, seqs.length * this.settings.row_height * 2 + 120)}px`;
    if (this.detailChart) {
      this.charts = this.charts.filter((chart) => chart !== this.detailChart);
      this.detailChart.destroy();
    }
    this.detailChart = this.drawTimeline(this.detailCanvas, events, this.currentDomain, seqs);

    this.currentTableData = rows;
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    renderListing(this);
    this.footnote.textContent = 'Click Back to return to the adverse event timelines.';
    this.dispatchParticipantsSelected([participant]);
  }

  /**
   * Close the detail view without re-rendering.
   * @private
   */
  closeDetail(silent) {
    if (!this.selectedParticipant) return;
    this.selectedParticipant = null;
    if (this.detailChart) {
      this.charts = this.charts.filter((chart) => chart !== this.detailChart);
      this.detailChart.destroy();
      this.detailChart = null;
    }
    this.detailWrap.classList.add('sv-hidden');
    this.sidebar.classList.remove('sv-hidden');
    this.chartWrap.classList.remove('sv-hidden');
    this.notes.classList.remove('sv-hidden');
    this.listingWrap.innerHTML = '';
    this.currentTableData = [];
    this.footnote.textContent = TIMELINE_FOOTNOTE;
    if (!silent) this.dispatchParticipantsSelected([]);
  }

  /**
   * Return from the participant detail view to the timelines (AET-FUNC-010):
   * clears the selection, dispatches participantsSelected with an empty
   * array, and re-renders the timeline chart.
   * @returns {void}
   */
  backToTimelines() {
    this.closeDetail(false);
    this.render();
  }

  /**
   * Track and dispatch the participantsSelected DOM CustomEvent on the
   * container element (AET-API-003): detail.data holds the selected ID
   * (["SUBJ-01"]) or an empty array when the selection clears.
   * @private
   */
  dispatchParticipantsSelected(ids) {
    this.participantsSelected = ids;
    this.element.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ids }, bubbles: true })
    );
  }

  /**
   * Resize every live chart (the timeline and any open detail chart) to its
   * container. For host layouts that change the container size without a
   * window resize — e.g. the R htmlwidget bindings.
   * @returns {void}
   */
  resize() {
    this.charts.forEach((chart) => chart.resize());
  }

  /**
   * Destroy the live Chart.js instances without touching the shell.
   * @private
   */
  destroyCharts() {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    this.chart = null;
    this.detailChart = null;
  }

  /**
   * Tear the timelines down: destroy every Chart.js instance and empty the
   * target element. The instance cannot be reused afterwards — create a new
   * one via the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create an adverse-event timelines chart inside a container element. The
 * control shell renders immediately; pass one-record-per-adverse-event data
 * to setData (or init) on the returned instance to validate the data and
 * draw the timelines.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {AETimelinesSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {AETimelines} The live timelines instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function aeTimelines(element = 'body', settings = {}) {
  return new AETimelines(element, settings);
}
