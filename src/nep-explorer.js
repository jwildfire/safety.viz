// Public entrypoint for the nep-explorer module (#120): the KDIGO
// acute-kidney-injury creatinine scatter, one point per participant at their
// maximum fold change in serum creatinine against their maximum absolute
// change, over coloured stage zones, with a stage summary table beside it.
//
// A Chart.js reimplementation of SafetyGraphics/nepExplorer (R Shiny, v1.0.0)
// per design obot.roadmap#35 — the kidney sibling of hep-explorer's eDISH, and
// built on the same lifecycle (init, setData, setSettings, render, resize,
// destroy), the same shared shell, and the same module flow
// (checkInputs → configure → structureData → getScales/getPlugins → new Chart).
//
// The port deliberately diverges from the R source in three places, each
// recorded in the requirement matrix with design §3 as its citation: the
// staging ladder (D4), the below-zero change domain (D6), and the >= 4.0 mg/dL
// rule as a mark property rather than a region (D5). The source's chart and its
// own summary table stage the same participant differently — porting either one
// alone would have carried that disagreement forward.

import { Chart, ScatterController, PointElement, LinearScale, Tooltip } from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { syncSettings } from './nep-explorer/configure.js';
import { checkInputs, hasCreatinine } from './nep-explorer/checkInputs.js';
import {
  applyFilters,
  DROP_REASON_COLUMN,
  stageSummary,
  structureData,
  unique
} from './nep-explorer/structureData.js';
import { buildScales, deltaDomain, foldDomain, formatNumber } from './nep-explorer/getScales.js';
import {
  markStyles,
  pointTooltip,
  stageLabel,
  stageZonesPlugin
} from './nep-explorer/getPlugins.js';
import { csvDownloadLink, toCsv } from './hep-explorer/dropped.js';

Chart.register(ScatterController, PointElement, LinearScale, Tooltip);

/** The columns of the dropped-participant export, in order. @private */
const DROPPED_PARTICIPANT_COLUMNS = ['id', 'reason'];

const STYLE_ID = 'safety-viz-nep-explorer-styles';

// The module's own rules, injected once per document. The shared shell
// stylesheet stays module-agnostic, and the docs site's CSS is not present when
// the chart renders as an htmlwidget — so anything the summary table needs to
// be readable has to travel with the chart.
const MODULE_CSS = `
.safety-nep-explorer .nep-summary-title{font-size:.95rem;margin:0 0 .5rem}
.safety-nep-explorer .nep-table-scroll{overflow-x:auto}
.safety-nep-explorer .nep-summary{border-collapse:collapse;font-size:.85rem;background:#fff;min-width:32rem}
.safety-nep-explorer .nep-summary th,.safety-nep-explorer .nep-summary td{border-bottom:1px solid #e3e8ee;padding:.4rem .6rem;text-align:right;font-variant-numeric:tabular-nums}
.safety-nep-explorer .nep-summary thead th{border-bottom:2px solid #d8dee4;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f;text-align:center;white-space:nowrap}
.safety-nep-explorer .nep-summary tbody th{text-align:left;font-weight:600}
.safety-nep-explorer .nep-summary td.nep-na{color:#9aa5b1}
.safety-nep-explorer .nep-summary-note{margin:.5rem 0 0;font-size:.78rem;line-height:1.4;color:#52616f;max-width:52rem}
.safety-nep-explorer .hep-csv-link{color:#1f5fa8;text-decoration:underline;cursor:pointer}
`;

/**
 * Inject the module stylesheet once per document.
 * @private
 */
function applyStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MODULE_CSS;
  document.head.append(style);
}

/**
 * Interactive KDIGO nephrotoxicity explorer: a Chart.js scatter of each
 * participant's maximum post-baseline fold change in serum creatinine against
 * their maximum absolute change, painted over the KDIGO stage zones, with
 * configurable filters, a stage summary table, and click-to-select dispatching
 * the shared participantsSelected event. Construct via the nepExplorer()
 * factory rather than directly; the constructor renders the control shell
 * immediately and waits for data.
 */
class SafetyNepExplorer {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Nep Explorer target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.allPoints = [];
    this.points = [];
    this.droppedRows = [];
    this.droppedParticipants = [];
    this.baselineFallbacks = 0;
    this.unitsResolved = true;
    this.nativeUnit = this.settings.units.target;
    this.hasMeasure = true;
    this.summary = null;
    this.charts = [];
    this.chart = null;
    this.participantsSelected = [];
    this.state = { filters: {}, zoneLabels: this.settings.zone_labels, selectedId: null };
    this.renderShell();
  }

  /**
   * Build the static DOM shell the chart and summary table render into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-nep-explorer',
        onToggle: () => this.resize()
      })
    );
    applyStyles();
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working.
   * @param {Object[]} data Long-format lab records matching the nep-explorer data contract.
   * @returns {SafetyNepExplorer} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing), reduced to one staged point
   * per participant, and the controls are rebuilt from the new data.
   * @param {Object[]} data Long-format lab records matching the nep-explorer data contract.
   * @returns {SafetyNepExplorer} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize, rebuild
   * the controls, and re-render.
   * @param {NepExplorerSettings} settings Setting overrides to merge.
   * @returns {SafetyNepExplorer} The instance, for chaining.
   */
  setSettings(settings) {
    if ('zone_labels' in settings) this.state.zoneLabels = settings.zone_labels;
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.settings.zone_labels = this.state.zoneLabels;
    if (this.rawData.length) this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping and run the whole
   * per-setData reduction once: creatinine records → one staged participant per
   * point, plus the drop accounting and the unit mode.
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    this.hasMeasure = hasCreatinine(this.rawData, this.settings);
    const structured = structureData(this.rawData, this.settings);
    this.allPoints = structured.points;
    this.droppedRows = structured.droppedRows;
    this.droppedParticipants = structured.droppedParticipants;
    this.baselineFallbacks = structured.baselineFallbacks;
    this.unitsResolved = structured.unitsResolved;
    this.nativeUnit = structured.nativeUnit;
  }

  /** The creatinine measure's display name. @private */
  measureLabel() {
    return this.settings.measure_values.CREAT;
  }

  /**
   * Rebuild the filter and display controls from data + state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);

    const filterSpecs = this.settings.filters.filter((filter) => {
      const exists = this.allPoints.some((point) => point.meta[filter.value_col] !== undefined);
      if (!exists)
        console.warn(
          `The [ ${filter.label} ] filter has been removed because the variable does not exist.`
        );
      return exists;
    });
    if (filterSpecs.length) {
      const filterParent = addSection('Filters');
      filterSpecs.forEach((filter) => {
        const select = addControl(filter.label, document.createElement('select'), filterParent);
        option(select, '__all__', 'All', !this.state.filters[filter.value_col]);
        unique(this.allPoints.map((point) => point.meta[filter.value_col]))
          .sort()
          .forEach((value) =>
            option(select, value, value, this.state.filters[filter.value_col] === value)
          );
        select.onchange = () => {
          this.state.filters[filter.value_col] = select.value === '__all__' ? null : select.value;
          this.render();
        };
      });
    }

    const displayParent = addSection('Display');
    const zoneLabels = document.createElement('input');
    zoneLabels.type = 'checkbox';
    zoneLabels.checked = this.state.zoneLabels !== 'hidden';
    zoneLabels.onchange = () => {
      this.state.zoneLabels = zoneLabels.checked ? 'shown' : 'hidden';
      this.settings.zone_labels = this.state.zoneLabels;
      this.render();
    };
    const inline = createElement('div', 'sv-control-inline');
    inline.append(zoneLabels, document.createTextNode('Show'));
    addControl('Stage zone labels', inline, displayParent);
  }

  /**
   * Redraw everything from the current data, settings and control state.
   * @returns {void}
   */
  render() {
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.footnote.textContent = '';
    this.state.selectedId = null;
    this.participantsSelected = [];
    this.mainAnnotation.textContent = 'Click a point to see details.';

    this.points = applyFilters(this.allPoints, this.state.filters);
    this.summary = stageSummary(this.points);
    this.updateNotes();

    if (!this.points.length) {
      this.mainAnnotation.textContent = this.hasMeasure
        ? 'No participants to plot for the current selection.'
        : `No ${this.measureLabel()} records in this dataset.`;
      return;
    }

    this.drawScatter();
    this.renderSummary();
  }

  /**
   * The status line above the chart: how many participants are plotted, the
   * unit-suppression notice, the baseline-fallback count, and the counted +
   * exportable drops (NEP-DATA-005).
   *
   * Every one of these is a count with a link behind it where a link is
   * possible. "23 results removed" is exactly the sort of line that gets read
   * past; the export turns it into something checkable against the source.
   * @private
   */
  updateNotes() {
    this.notes.innerHTML = '';
    const total = this.allPoints.length;
    const shown = this.points.length;
    const percent = total ? ((shown / total) * 100).toFixed(1) : '0.0';
    this.notes.append(
      createElement(
        'span',
        null,
        `${shown} of ${total} participant${total === 1 ? '' : 's'} shown (${percent}%).`
      )
    );

    if (!this.unitsResolved) {
      // Design §4: a wrong staging is worse than an incomplete one, so say
      // plainly what has been withheld and why.
      this.notes.append(
        createElement(
          'span',
          'sv-warning',
          `Unit "${this.nativeUnit}" not recognized — fold change is still exact, but the ` +
            `absolute-change staging and the ${formatNumber(this.settings.stages.absolute)} ` +
            `${this.settings.units.target} rule are suppressed.`
        )
      );
    }

    if (this.baselineFallbacks) {
      this.notes.append(
        createElement(
          'span',
          null,
          `${this.baselineFallbacks} participant${this.baselineFallbacks === 1 ? '' : 's'} ` +
            'used the earliest record as baseline (no baseline flag configured).'
        )
      );
    }

    if (this.droppedRows.length) {
      const note = createElement('span', 'sv-warning');
      note.append(
        document.createTextNode(
          `${this.droppedRows.length} missing or non-numeric result${
            this.droppedRows.length === 1 ? '' : 's'
          } removed. `
        ),
        csvDownloadLink(
          () => toCsv(this.droppedRows, this.droppedRowColumns()),
          'nep-explorer-dropped-records',
          'Download records'
        )
      );
      this.notes.append(note);
    }

    if (this.droppedParticipants.length) {
      const note = createElement('span', 'sv-warning');
      note.append(
        document.createTextNode(
          `${this.droppedParticipants.length} participant${
            this.droppedParticipants.length === 1 ? '' : 's'
          } could not be plotted. `
        ),
        csvDownloadLink(
          () => toCsv(this.droppedParticipants, DROPPED_PARTICIPANT_COLUMNS),
          'nep-explorer-dropped-participants',
          'Download participants'
        )
      );
      this.notes.append(note);
    }
  }

  /**
   * The dropped-row export's columns: the reason first, because it is why the
   * reviewer opened the file, then the source columns as they arrived. The
   * module's own derived `__nep_*` working is left out.
   * @private
   */
  droppedRowColumns() {
    if (!this.droppedRows.length) return [];
    const source = Object.keys(this.droppedRows[0]).filter(
      (column) => !column.startsWith('__nep_')
    );
    return [DROP_REASON_COLUMN, ...source];
  }

  /**
   * Draw the Chart.js scatter with the stage zones, tooltips and point
   * selection.
   * @private
   */
  drawScatter() {
    const points = this.points;
    const measure = this.measureLabel();
    const unit = this.unitsResolved ? this.settings.units.target : this.nativeUnit;
    const data = points.map((point) => ({ x: point.fold, y: point.delta }));
    const styles = markStyles(points, -1);
    const xDomain = foldDomain(
      points.map((point) => point.fold),
      this.settings.stages.fold
    );
    const yDomain = deltaDomain(
      points.map((point) => point.delta),
      this.unitsResolved ? this.settings.stages.delta : 0
    );

    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Participants',
            data,
            pointBackgroundColor: styles.background,
            pointBorderColor: styles.border,
            pointBorderWidth: styles.borderWidth,
            pointRadius: styles.radius,
            pointHoverRadius: styles.hoverRadius,
            pointStyle: styles.pointStyle
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        layout: { padding: 6 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => pointTooltip(points[ctx.dataIndex], this.settings, measure)
            }
          }
        },
        scales: buildScales({
          foldDomain: xDomain,
          deltaDomain: yDomain,
          cuts: this.settings.stages.fold,
          deltaTrigger: this.unitsResolved ? this.settings.stages.delta : NaN,
          measure,
          unit
        }),
        onHover: (event, active) => {
          const target = event?.native?.target;
          if (target) target.style.cursor = active.length ? 'pointer' : 'default';
        },
        onClick: (event, active) => {
          // An empty-canvas click is a clear gesture — but only when something
          // is selected, so background clicks don't spam empty
          // participantsSelected dispatches at external listeners.
          if (active.length) this.selectPoint(active[0].index);
          else if (this.state.selectedId != null) this.clearSelection();
        }
      },
      plugins: [stageZonesPlugin(this)]
    });
    chart.$nepPoints = points;
    this.chart = chart;
    this.charts.push(chart);
  }

  /**
   * The stage summary table (NEP-TBL-001): Stage 0-3 down the side, then N and
   * % for the fold staging, the absolute-change staging, and the combined stage
   * the zones show.
   * @private
   */
  renderSummary() {
    const summary = this.summary;
    const unit = this.unitsResolved ? this.settings.units.target : this.nativeUnit;
    const cell = (value) =>
      value.n === null
        ? '<td class="nep-na">—</td><td class="nep-na">—</td>'
        : `<td>${value.n}</td><td>${value.percent.toFixed(1)}%</td>`;
    const rows = summary.rows
      .map(
        (row) =>
          `<tr><th scope="row">${stageLabel(row.stage)}</th>` +
          cell(row.fold) +
          cell(row.delta) +
          cell(row.combined) +
          '</tr>'
      )
      .join('');
    // Stage 2 and Stage 3 do not exist on the absolute-change axis — KDIGO
    // defines exactly one cut-point there. Those cells are dashes rather than
    // zeroes, and the footnote says why, because a zero would read as "nobody
    // qualified" (which is what the R source's unreachable case_when arms
    // invite a reader to conclude).
    const suppressed = this.unitsResolved
      ? ''
      : `<p class="nep-summary-note sv-warning">Absolute-change staging is suppressed: the unit ` +
        `"${this.nativeUnit}" is not recognized.</p>`;
    this.listingWrap.innerHTML =
      `<h3 class="nep-summary-title">KDIGO stage summary (n = ${summary.total})</h3>` +
      '<div class="nep-table-scroll"><table class="nep-summary"><thead>' +
      '<tr><th rowspan="2" scope="col">Stage</th>' +
      '<th colspan="2" scope="colgroup">Fold change</th>' +
      `<th colspan="2" scope="colgroup">Absolute change (${unit})</th>` +
      '<th colspan="2" scope="colgroup">KDIGO stage</th></tr>' +
      '<tr><th scope="col">N</th><th scope="col">%</th>' +
      '<th scope="col">N</th><th scope="col">%</th>' +
      '<th scope="col">N</th><th scope="col">%</th></tr>' +
      `</thead><tbody>${rows}</tbody></table></div>` +
      '<p class="nep-summary-note">The first two column pairs are separate marginal ' +
      'distributions, not a cross-tabulation; the third is the combined stage the zones show — ' +
      'the worse of the two axes, raised to Stage 3 for any participant whose maximum reached ' +
      `${formatNumber(this.settings.stages.absolute)} ${this.settings.units.target}. ` +
      'KDIGO defines no Stage 2 or Stage 3 on absolute change, so those cells are marked —.</p>' +
      suppressed;
  }

  /**
   * Select a scatter point: highlight it, note the participant, and dispatch
   * the selection on the shell root — the seam the Phase-2 patient profile
   * mounts onto (NEP-SCAT-004).
   * @private
   */
  selectPoint(index) {
    const point = this.points[index];
    if (!point) return;
    this.state.selectedId = point.id;
    this.restyle(index);
    const details = this.settings.details
      .filter((detail) => detail.value_col !== this.settings.id_col)
      .map((detail) => `${detail.label}: ${point.meta[detail.value_col]}`)
      .filter((text) => !/: $/.test(text));
    this.mainAnnotation.textContent = `${point.id} — ${stageLabel(point.stage)}`;
    this.footnote.textContent = [
      `${point.id}: baseline ${formatNumber(point.baseline)} ${point.unit} (${point.baselineVisit}), ` +
        `maximum ${formatNumber(point.max)} ${point.unit} (${point.maxVisit}), ` +
        `${formatNumber(point.fold)}× baseline.`,
      ...details
    ].join(' ');
    this.dispatchSelection([point.id]);
  }

  /**
   * Clear the point selection: restore the marks, reset the annotation, and
   * dispatch the empty selection so external listeners follow.
   * @returns {void}
   */
  clearSelection() {
    this.state.selectedId = null;
    this.restyle(-1);
    this.mainAnnotation.textContent = 'Click a point to see details.';
    this.footnote.textContent = '';
    this.dispatchSelection([]);
  }

  /**
   * Reapply the per-point mark styling for a selection index.
   * @private
   */
  restyle(index) {
    if (!this.chart) return;
    const styles = markStyles(this.points, index);
    const dataset = this.chart.data.datasets[0];
    dataset.pointBorderColor = styles.border;
    dataset.pointBorderWidth = styles.borderWidth;
    this.chart.$nepSelectedIndex = index >= 0 ? index : null;
    this.chart.update();
  }

  /**
   * Dispatch the custom participantsSelected event on the shell root with the
   * selected IDs — the house selection payload (NEP-SCAT-004). Phase 1 wires
   * this even though the patient profile is not built yet, because it is the
   * seam Phase 2 mounts onto.
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
    this.charts.forEach((chart) => chart.resize());
  }

  /**
   * Destroy the live Chart.js instance without touching the shell.
   * @private
   */
  destroyCharts() {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    this.chart = null;
  }

  /**
   * Tear the explorer down: destroy the Chart.js instance and empty the target
   * element. The instance cannot be reused afterwards — create a new one via
   * the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a KDIGO nephrotoxicity explorer inside a container element. The
 * control shell renders immediately; pass long-format lab records to setData
 * (or init) on the returned instance to validate the data and draw the scatter.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {NepExplorerSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyNepExplorer} The live nep-explorer instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function nepExplorer(element = 'body', settings = {}) {
  return new SafetyNepExplorer(element, settings);
}
