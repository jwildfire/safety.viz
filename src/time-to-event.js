// Public entrypoint for the time-to-event module (#128): Kaplan–Meier curves by
// treatment group with censoring tick marks, a pointwise 95% confidence band, and
// the at-risk / cumulative-events strip table beneath the time axis — the
// interactive half of the KM family requirement (obot.roadmap#161, design
// requirements/design/161_design.html, as revised by the sv#131 review).
//
// The module consumes two datasets — event-level records (an ADAE-shaped
// projection: one row per event with onset day and descriptor columns) and
// population records (an ADSL-shaped projection: one row per participant with
// treatment group and follow-up-end day) — and composes the endpoint live from
// flexible multiselect filters over the events (TTE-FILT-001): time to first
// event passing the active filters, censored at end of follow-up. The important
// events vary from study to study, so no endpoint list is hard-coded; a later
// release may add configured filter presets on top of this state (see
// configure.js). The derivation rule is fixed and stated in the clinical guide;
// the Kaplan–Meier estimation itself lives in src/time-to-event/km.js —
// cross-validated against R survival::survfit. One estimator pass feeds the
// curves, the band, the censor marks and every number in the risk table, so the
// table cannot disagree with the picture (TTE-STAT-001). Default orientation is
// cumulative incidence, 1 − KM, with the estimator named on the axis (D2) and
// the competing-risks limitation stated in the notes (TTE-GUIDE-001).
//
// Follows the nep/hep orchestrator shape: a class + default-export factory, the
// shared shell, and the fixed checkInputs → configure → structureData →
// getScales/getPlugins → new Chart pipeline. Marked Experimental pending
// @jwildfire's review of the design decisions.

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';

import { controlBuilders, createElement, multiSelect, option, renderShell } from './shell.js';
import { syncSettings } from './time-to-event/configure.js';
import { checkInputs } from './time-to-event/checkInputs.js';
import {
  applyEventFilters,
  applyFilters,
  DROP_REASON_COLUMN,
  structureData,
  unique
} from './time-to-event/structureData.js';
import { axisTicks, buildScales, formatPercent1, displayValue } from './time-to-event/getScales.js';
import {
  bandRects,
  censorTooltip,
  ciBandPlugin,
  curveVertices,
  groupStyle,
  pointTooltip,
  riskTableHeight,
  riskTablePlugin
} from './time-to-event/getPlugins.js';
import { csvDownloadLink, toCsv } from './hep-explorer/dropped.js';
import { initFilterState, renderFilterControl } from './filters.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

/**
 * Interactive Kaplan–Meier time-to-event explorer: step curves per group with
 * censor marks, a pointwise 95% band (Greenwood, log-log), an in-canvas at-risk /
 * cumulative-events table aligned under the time axis, multiselect event filters
 * composing the endpoint live, population filters, orientation and band toggles,
 * and event-step click dispatching the shared participantsSelected event.
 * Construct via the timeToEvent() factory; the shell renders immediately and
 * waits for data.
 */
class SafetyTimeToEvent {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Time-to-Event target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawEvents = [];
    this.rawPopulation = [];
    this.structured = null;
    this.chart = null;
    this.participantsSelected = [];
    this.state = {
      eventFilters: {},
      filters: initFilterState(this.settings.filters),
      direction: this.settings.direction,
      ci: this.settings.ci,
      selected: null
    };
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-time-to-event',
        onToggle: () => this.resize()
      })
    );
    this.chartWrap.style.height = `${this.settings.height}px`;
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working.
   * @param {{events: Object[], population: Object[]}} data Event-level and population records matching the time-to-event data contract.
   * @returns {SafetyTimeToEvent} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. Both datasets are validated against
   * the settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing) and the filter controls are
   * rebuilt from the data.
   * @param {{events: Object[], population: Object[]}} data Event-level and population records matching the time-to-event data contract.
   * @returns {SafetyTimeToEvent} The instance, for chaining.
   */
  setData(data) {
    try {
      checkInputs(data, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    this.rawEvents = data.events;
    this.rawPopulation = data.population;
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize, rebuild
   * the controls, and re-render.
   * @param {TimeToEventSettings} settings Setting overrides to merge.
   * @returns {SafetyTimeToEvent} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    if ('direction' in settings) this.state.direction = this.settings.direction;
    if ('ci' in settings) this.state.ci = this.settings.ci;
    if ('event_filters' in settings) this.state.eventFilters = {};
    this.chartWrap.style.height = `${this.settings.height}px`;
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * The configured event-filter specs whose column exists in the event data;
   * missing columns are dropped with a console warning.
   * @private
   */
  eventFilterSpecs() {
    return this.settings.event_filters.filter((filter) => {
      const exists = this.rawEvents.some((row) => row[filter.value_col] !== undefined);
      if (!exists)
        console.warn(
          `The [ ${filter.label} ] event filter has been removed because the variable does not exist.`
        );
      return exists;
    });
  }

  /**
   * Rebuild the endpoint-composing event filters, the population filters and
   * the display controls from data + state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);

    // The endpoint composer (TTE-FILT-001): one multiselect per configured
    // event-descriptor column. The controls persist across renders — only the
    // chart and notes redraw on change — so an open list stays open under the
    // user's pointer.
    const specs = this.eventFilterSpecs();
    if (specs.length) {
      const eventParent = addSection('Event definition');
      specs.forEach((filter) => {
        const values = unique(
          this.rawEvents.map((row) => row[filter.value_col]).filter((v) => v !== undefined)
        )
          .map(String)
          .sort();
        const control = multiSelect({
          values,
          selected: this.state.eventFilters[filter.value_col] ?? null,
          onChange: (selected) => {
            this.state.eventFilters[filter.value_col] = selected;
            this.render();
          }
        });
        addControl(filter.label, control, eventParent);
      });
    }

    const filterSpecs = this.settings.filters.filter((filter) => {
      const exists = this.rawPopulation.some((row) => row[filter.value_col] !== undefined);
      if (!exists)
        console.warn(
          `The [ ${filter.label} ] filter has been removed because the variable does not exist.`
        );
      return exists;
    });
    if (filterSpecs.length) {
      const filterParent = addSection('Filters');
      filterSpecs.forEach((filter) => {
        const values = unique(
          this.rawPopulation.map((row) => row[filter.value_col]).filter((v) => v !== undefined)
        )
          .map(String)
          .sort();
        addControl(
          filter.label,
          renderFilterControl({
            spec: filter,
            values: values,
            selected: this.state.filters[filter.value_col],
            onChange: (next) => {
              this.state.filters[filter.value_col] = next;
              this.render();
            }
          }),
          filterParent
        );
      });
    }

    const displayParent = addSection('Display');
    const direction = addControl('Orientation', document.createElement('select'), displayParent);
    option(
      direction,
      'incidence',
      'Cumulative incidence (1 − KM)',
      this.state.direction === 'incidence'
    );
    option(
      direction,
      'survival',
      'Event-free probability (KM)',
      this.state.direction === 'survival'
    );
    direction.onchange = () => {
      this.state.direction = direction.value === 'survival' ? 'survival' : 'incidence';
      this.render();
    };

    const ci = document.createElement('input');
    ci.type = 'checkbox';
    ci.checked = this.state.ci;
    ci.onchange = () => {
      this.state.ci = ci.checked;
      this.render();
    };
    const inline = createElement('div', 'sv-control-inline');
    inline.append(ci, document.createTextNode('Show'));
    addControl('Pointwise 95% CI band', inline, displayParent);
  }

  /**
   * Redraw everything from the current data, settings and control state.
   * @returns {void}
   */
  render() {
    this.destroyChart();
    this.footnote.textContent = '';
    this.state.selected = null;
    this.participantsSelected = [];
    this.mainAnnotation.textContent = '';

    const qualifying = applyEventFilters(this.rawEvents, this.state.eventFilters);
    const population = applyFilters(this.rawPopulation, this.state.filters);
    this.structured = structureData(qualifying, population, this.settings);
    this.updateNotes();

    if (!this.structured.total) {
      this.mainAnnotation.textContent =
        'No usable time-to-event observations for the current selection.';
      return;
    }
    this.mainAnnotation.textContent = 'Click an event step to select its participants.';
    this.drawChart();
  }

  /**
   * The composed endpoint's filter summary: what qualifies an event right now.
   * @private
   */
  filterSummary() {
    const active = this.eventFilterSpecs()
      .map((filter) => {
        const selected = this.state.eventFilters[filter.value_col];
        if (selected == null) return null;
        const total = unique(
          this.rawEvents.map((row) => row[filter.value_col]).filter((v) => v !== undefined)
        ).length;
        return `${filter.label}: ${selected.length} of ${total} values`;
      })
      .filter(Boolean);
    return active.length
      ? `Qualifying events — ${active.join('; ')}.`
      : 'All recorded events qualify.';
  }

  /**
   * The status line above the chart: the composed endpoint and its filter
   * state, the population, the event accounting, the estimator honesty note
   * (TTE-GUIDE-001), and the counted + exportable drops for both datasets
   * (TTE-DATA-002).
   * @private
   */
  updateNotes() {
    this.notes.innerHTML = '';
    const { groups, total, droppedEvents, droppedPopulation } = this.structured;
    const events = groups.reduce(
      (sum, group) => sum + group.estimate.points.reduce((s, p) => s + p.events, 0),
      0
    );
    this.notes.append(
      createElement(
        'span',
        null,
        `${this.settings.endpoint_label}: ${total} participant${total === 1 ? '' : 's'} in ` +
          `${groups.length} group${groups.length === 1 ? '' : 's'}; ${events} event${
            events === 1 ? '' : 's'
          }, ${total - events} censored.`
      )
    );

    this.notes.append(createElement('span', null, this.filterSummary()));

    this.notes.append(
      createElement(
        'span',
        null,
        'Time to first qualifying event, censored at end of follow-up. Bands are pointwise ' +
          '95% CIs (Greenwood, log-log) — not simultaneous. 1 − KM can overestimate absolute ' +
          'risk when competing events (death, discontinuation) are present; see the clinical guide.'
      )
    );

    this.appendDropNote(droppedEvents, 'unusable event row', 'time-to-event-dropped-events');
    this.appendDropNote(
      droppedPopulation,
      'excluded participant row',
      'time-to-event-excluded-participants'
    );
  }

  /**
   * Append one dataset's counted-drop note with its CSV export link.
   * @private
   */
  appendDropNote(droppedRows, noun, filename) {
    if (!droppedRows.length) return;
    const note = createElement('span', 'sv-warning');
    note.append(
      document.createTextNode(
        `${droppedRows.length} ${noun}${droppedRows.length === 1 ? '' : 's'}. `
      ),
      csvDownloadLink(
        () => toCsv(droppedRows, this.droppedRowColumns(droppedRows)),
        filename,
        'Download records'
      )
    );
    this.notes.append(note);
  }

  /**
   * A dropped-row export's columns: the reason first, then the source columns.
   * @private
   */
  droppedRowColumns(droppedRows) {
    if (!droppedRows.length) return [];
    const source = Object.keys(droppedRows[0]).filter((column) => column !== DROP_REASON_COLUMN);
    return [DROP_REASON_COLUMN, ...source];
  }

  /**
   * Draw the Chart.js step curves, censor marks, CI band and risk table.
   * @private
   */
  drawChart() {
    const { groups, maxTime } = this.structured;
    const direction = this.state.direction;
    const ticks = axisTicks(maxTime);

    const datasets = [];
    const tteGroups = [];
    groups.forEach((group, index) => {
      const style = groupStyle(index);
      const vertices = curveVertices(group.estimate, direction);
      const curveIndex = datasets.length;
      datasets.push({
        label: group.name,
        data: vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })),
        borderColor: style.color,
        backgroundColor: style.color,
        borderDash: style.dash,
        borderWidth: 2,
        stepped: 'after',
        fill: false,
        pointRadius: vertices.map((vertex) => (vertex.kind === 'event' ? 2.5 : 0)),
        pointHoverRadius: vertices.map((vertex) => (vertex.kind === 'event' ? 5 : 0)),
        pointHitRadius: vertices.map((vertex) => (vertex.kind === 'event' ? 8 : 0)),
        pointBackgroundColor: style.color,
        pointBorderColor: style.color,
        $tteKind: 'curve',
        $tteVertices: vertices,
        $tteGroupName: group.name
      });
      const censorIndex = datasets.length;
      datasets.push({
        label: `${group.name} — censored`,
        data: group.estimate.censorTimes.map((mark) => ({
          x: mark.time,
          y: displayValue(mark.surv, direction)
        })),
        showLine: false,
        pointStyle: 'line',
        rotation: 90,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointHitRadius: 6,
        pointBorderWidth: 1.5,
        pointBorderColor: style.color,
        pointBackgroundColor: style.color,
        borderColor: style.color,
        $tteKind: 'censor',
        $tteMarks: group.estimate.censorTimes,
        $tteGroupName: group.name,
        $tteObservations: group.observations
      });
      tteGroups.push({
        name: group.name,
        color: style.color,
        estimate: group.estimate,
        bandRects: bandRects(group.estimate, direction),
        ci: this.state.ci,
        curveIndex,
        censorIndex
      });
    });

    const module = this;
    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        // No intro animation: the transition frames would pair an interpolated
        // step line with a confidence band and risk table already drawn at
        // their final geometry — transient states that are not estimates of
        // anything (the sv#131 review's "line moves, but CI is pre-rendered").
        // Every re-render — and the live filters re-render constantly — shows
        // one truthful frame instead.
        animation: false,
        layout: { padding: { top: 6, right: 12, bottom: riskTableHeight(groups.length) } },
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            // Left-aligned so the legend never collides with the shell's
            // top-right annotation overlay.
            align: 'start',
            labels: {
              usePointStyle: false,
              // One legend entry per group: the censor datasets follow their
              // group's visibility rather than appearing as separate items.
              filter: (item, data) => data.datasets[item.datasetIndex].$tteKind === 'curve'
            },
            onClick: (event, item, legend) => {
              const chartRef = legend.chart;
              const group = (chartRef.$tteGroups || []).find(
                (entry) => entry.curveIndex === item.datasetIndex
              );
              const visible = chartRef.isDatasetVisible(item.datasetIndex);
              chartRef.setDatasetVisibility(item.datasetIndex, !visible);
              if (group) chartRef.setDatasetVisibility(group.censorIndex, !visible);
              chartRef.update();
            }
          },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => {
                const dataset = ctx.dataset;
                if (dataset.$tteKind === 'curve') {
                  const vertex = dataset.$tteVertices[ctx.dataIndex];
                  if (vertex.kind === 'event')
                    return pointTooltip(vertex.point, {
                      groupName: dataset.$tteGroupName,
                      direction,
                      timeUnit: this.settings.time_unit
                    });
                  return `${dataset.$tteGroupName}: ${formatPercent1(vertex.y)} at ${
                    this.settings.time_unit
                  } ${vertex.x}`;
                }
                const mark = dataset.$tteMarks[ctx.dataIndex];
                const censorDescs = dataset.$tteObservations
                  .filter((observation) => !observation.event && observation.time === mark.time)
                  .map((observation) => observation.censorDesc);
                return censorTooltip(mark, {
                  groupName: dataset.$tteGroupName,
                  timeUnit: this.settings.time_unit,
                  censorDescs
                });
              }
            }
          }
        },
        scales: buildScales({ maxTime, direction, timeUnit: this.settings.time_unit }),
        onHover: (event, active) => {
          const target = event?.native?.target;
          if (target) target.style.cursor = active.length ? 'pointer' : 'default';
        },
        onClick: (event, active) => {
          if (active.length) module.selectElement(active[0]);
          else if (module.state.selected) module.clearSelection();
        }
      },
      plugins: [ciBandPlugin(), riskTablePlugin({ ticks: () => ticks.ticks })]
    });
    chart.$tteGroups = tteGroups;
    this.chart = chart;
  }

  /**
   * Select a clicked chart element: an event step dispatches the ids whose
   * event occurred at that time (D6) — the profile drill-down seam every
   * explorer keeps open.
   * @private
   */
  selectElement(element) {
    const dataset = this.chart.data.datasets[element.datasetIndex];
    if (dataset.$tteKind !== 'curve') return;
    const vertex = dataset.$tteVertices[element.index];
    if (!vertex || vertex.kind !== 'event') return;
    this.state.selected = { group: dataset.$tteGroupName, time: vertex.point.time };
    const ids = vertex.point.ids;
    this.footnote.textContent =
      `${dataset.$tteGroupName}, ${this.settings.time_unit} ${vertex.point.time}: ` +
      `${ids.length} participant${ids.length === 1 ? '' : 's'} with an event — ${ids.join(', ')}`;
    this.dispatchSelection(ids);
  }

  /**
   * Clear the event-step selection and dispatch the empty selection so external
   * listeners follow.
   * @returns {void}
   */
  clearSelection() {
    this.state.selected = null;
    this.footnote.textContent = '';
    this.dispatchSelection([]);
  }

  /**
   * Dispatch the custom participantsSelected event on the shell root with the
   * selected IDs — the house selection payload.
   * @private
   */
  dispatchSelection(ids) {
    this.participantsSelected = ids;
    if (this.root) {
      this.root.dispatchEvent(
        new CustomEvent('participantsSelected', { detail: { data: ids }, bubbles: true })
      );
    }
  }

  /**
   * Resize the live chart to its container. For host layouts that change the
   * container size without a window resize — e.g. the R htmlwidget bindings.
   * @returns {void}
   */
  resize() {
    if (this.chart) this.chart.resize();
  }

  /**
   * Destroy the live Chart.js instance without touching the shell.
   * @private
   */
  destroyChart() {
    if (this.chart) this.chart.destroy();
    this.chart = null;
  }

  /**
   * Tear the explorer down: destroy the Chart.js instance and empty the target
   * element. The instance cannot be reused afterwards — create a new one via
   * the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyChart();
    this.element.innerHTML = '';
  }
}

/**
 * Create a Kaplan–Meier time-to-event explorer inside a container element. The
 * control shell renders immediately; pass `{ events, population }` records to
 * setData (or init) on the returned instance to validate the data and draw the
 * curves.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {TimeToEventSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyTimeToEvent} The live time-to-event instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function timeToEvent(element = 'body', settings = {}) {
  return new SafetyTimeToEvent(element, settings);
}
