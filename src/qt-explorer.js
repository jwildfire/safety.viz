// QT Safety Explorer entrypoint (#68): a single-canvas renderer that switches
// between three views of heart-rate-corrected QT data — a per-arm central-tendency
// change-over-time chart (Δ / placebo-corrected ΔΔ) with a CI band and the
// ICH-E14 metric, the flagship outlier scatter of change vs baseline with the
// absolute-QTc diagonals and change-from-baseline lines, and a by-arm categorical
// exceedance table — porting SafetyGraphics/qtexplorer into safety.viz. Follows
// the hep-explorer orchestrator shape (a class + default-export factory, a fixed
// checkInputs → structureData → getScales/getPlugins → new Chart pipeline) and
// the shared shell. The three chart views share one canvas, so render() destroys
// prior charts first; the categorical view hides the canvas and draws a table
// into a module-owned wrap (the hep quadrant-summary idiom). Requirement IDs use
// the condensed QT-* scheme (QT-CTRL-*, QT-CT-*, QT-OUT-*, QT-CAT-*, QT-DATA-*).

import {
  Chart,
  ScatterController,
  PointElement,
  LineElement,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';
import {
  controlBuilders,
  createElement,
  option,
  renderShell,
  renderViewSelector
} from './shell.js';
import { checkInputs } from './qt-explorer/checkInputs.js';
import {
  DISPLAY_MODES,
  STATISTICS,
  TIMEPOINT_MAX,
  VIEWS,
  syncSettings
} from './qt-explorer/configure.js';
import {
  applyFilters,
  armsPresent,
  centralTendencySeries,
  classifyThresholds,
  cleanData,
  forMeasure,
  ichE14Metric,
  measuresPresent,
  orderVisits,
  peakVisits,
  placeboArmFor,
  subjectPoints,
  unique
} from './qt-explorer/structureData.js';
import {
  armPointStyles,
  centralAxisTitle,
  formatNumber,
  formatSigned,
  isQtcMeasure,
  paddedDomain,
  scatterAxisTitles
} from './qt-explorer/getScales.js';
import {
  ARM_COLORS,
  armColorScale,
  centralTendencyPlugin,
  hexToRgba,
  scatterTooltip,
  thresholdScatterPlugin
} from './qt-explorer/getPlugins.js';
import {
  buildProfileRows,
  mountProfileDock,
  resetProfileDock,
  syncProfileDock,
  unmountProfileDock
} from './profile-host.js';

Chart.register(ScatterController, PointElement, LineElement, LinearScale, Tooltip, Legend);

const QT_STYLE_ID = 'safety-viz-qt-explorer-styles';
const QT_STYLES = `
.safety-qt-explorer .qt-legend{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .9rem;font-size:.8rem;color:#52616f;margin:0 0 .5rem}
.safety-qt-explorer .qt-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.safety-qt-explorer .qt-note{color:#9a3412;font-size:.85rem;margin:0 0 .5rem}
.safety-qt-explorer .qt-ich{margin:.6rem 0 0;font-size:.85rem;color:#1f2933}
.safety-qt-explorer .qt-ich table,.safety-qt-explorer .qt-table table{border-collapse:collapse;font-size:.85rem;background:#fff}
.safety-qt-explorer .qt-ich th,.safety-qt-explorer .qt-ich td,.safety-qt-explorer .qt-table th,.safety-qt-explorer .qt-table td{border-bottom:1px solid #e3e8ee;padding:.35rem .6rem;text-align:left}
.safety-qt-explorer .qt-table th.qt-num,.safety-qt-explorer .qt-table td.qt-num,.safety-qt-explorer .qt-ich td.qt-num{text-align:right;font-variant-numeric:tabular-nums}
.safety-qt-explorer .qt-table th{border-bottom:2px solid #d8dee4;font-size:.75rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f;white-space:nowrap}
.safety-qt-explorer .qt-table caption,.safety-qt-explorer .qt-ich caption{caption-side:top;text-align:left;font-weight:600;margin-bottom:.35rem}
.safety-qt-explorer .qt-flag{color:#9a3412;font-weight:600}
.safety-qt-explorer .qt-empty{display:none}
`;

function applyQtStyles() {
  if (typeof document === 'undefined' || document.getElementById(QT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = QT_STYLE_ID;
  style.textContent = QT_STYLES;
  document.head.append(style);
}

/**
 * Interactive QT Safety Explorer. Construct via the qtExplorer() factory; the
 * constructor renders the control shell immediately and waits for data.
 */
class SafetyQtExplorer {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety QT Explorer target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanRows = [];
    this.filteredRows = [];
    this.charts = [];
    this.arms = [];
    this.availableMeasures = [];
    this.participantsSelected = [];
    // The docked participant-profile module (#99, PPRF-QT-001): the shared
    // drill-down rendered into the shell's profile slot and fed by the
    // outlier-scatter point click through dispatchSelection's
    // participantsSelected event on the shell root. profileRows is the ONE
    // per-setData profile ingest (hep-core cleaned rows over a synthesized
    // unit-ULN column, so the spaghetti plots observed milliseconds);
    // profileKey is the idempotency guard.
    this.profile = null;
    this.profileFeed = null;
    this.profileKey = null;
    this.profileRows = [];
    this.state = {
      view: 'central',
      measure: this.settings.start_measure,
      statistic: 'mean',
      mode: 'delta',
      timepoint: TIMEPOINT_MAX,
      filters: {},
      selectedId: null
    };
    this.renderShellDom();
    mountProfileDock(this, () => this.profileSettings());
  }

  /**
   * The settings handed to the docked participant-profile module (#99,
   * PPRF-QT-002) — the interval-measure (ECG) mapping onto the profile's
   * long-lab contract:
   *
   * - `normal_col_high` points at the synthesized `__qt_profile_uln` (= 1)
   *   column, so the ×ULN standardization is a no-op and the spaghetti plots
   *   OBSERVED milliseconds (nothing drops on the ULN>0 guard). KNOWN
   *   module-surface side effects (routed to #98, documented in
   *   docs/qt-explorer-coverage.md): the measure table's sparkline/inset treat
   *   the unit ULN as a real normal-range limit, and the spaghetti's axis
   *   label/accessible name stay "Standardized Result [xULN]".
   * - `measure_values` is the identity map over the host's `measures`, making
   *   the ECG parameters the profile's KEY measures.
   * - `cuts` carry the FIRST absolute threshold (450 ms by default) per QTc
   *   measure on the observed-ms scale; the NaN `defaults` entry leaves Heart
   *   Rate (and any other non-QTc parameter) cut-free. The 30/60 ms
   *   change-from-baseline thresholds are not representable in the dock — see
   *   docs/qt-explorer-coverage.md.
   * - the host's `baseline_col` ('BASE') is a VALUE column, not the profile's
   *   baseline FLAG contract, so the profile's `baseline_col` stays null and
   *   deriveBaseline's earliest-visit rule lands on the baseline visit.
   * - `studyday_col` maps from `visitn_col` (ADEG-style data carries no DY).
   * @private
   */
  profileSettings() {
    const settings = this.settings;
    const measureValues = {};
    (settings.measures || []).forEach((measure) => {
      measureValues[measure] = measure;
    });
    const qtcCut = settings.absolute_thresholds.length ? settings.absolute_thresholds[0] : NaN;
    const cuts = { defaults: { relative_uln: NaN, relative_baseline: NaN } };
    (settings.qtc_measures || []).forEach((measure) => {
      cuts[measure] = { relative_uln: qtcCut, relative_baseline: NaN };
    });
    return {
      id_col: settings.id_col,
      measure_col: settings.measure_col,
      value_col: settings.value_col,
      unit_col: settings.unit_col,
      normal_col_high: '__qt_profile_uln',
      normal_col_low: null,
      studyday_col: settings.visitn_col,
      visit_col: settings.visit_col,
      visitn_col: settings.visitn_col,
      baseline_col: null,
      measure_values: measureValues,
      cuts,
      display_options: [
        { value: 'relative_uln', label: 'Observed (ms)' },
        { value: 'relative_baseline', label: '×Baseline' }
      ],
      details:
        settings.profile_details && settings.profile_details.length ? settings.profile_details : [],
      participantProfileURL: settings.participantProfileURL ?? null,
      on_clear: () => {
        if (this.state.selectedId != null) {
          this.clearSelection();
        } else {
          // Externally-fed cohort (e.g. a root-level dispatch the host did not
          // originate): nothing host-side to clear, but the dock still must —
          // reset any transient point emphasis and dispatch the empty
          // selection (PPRF-11 clear contract).
          this.emphasizeParticipant(null);
          this.dispatchSelection([]);
        }
      },
      on_step: (id) => this.emphasizeParticipant(id)
    };
  }

  /** Build the shell + module-owned slots (legend, note, table, ICH callout). @private */
  renderShellDom() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-qt-explorer',
        onToggle: () => this.resize()
      })
    );
    applyQtStyles();
    this.legendEl = createElement('div', 'qt-legend');
    this.noteEl = createElement('div', 'qt-note qt-empty');
    this.main.insertBefore(this.noteEl, this.chartWrap);
    this.main.insertBefore(this.legendEl, this.chartWrap);
    this.tableWrap = createElement('div', 'qt-table qt-empty');
    this.ichWrap = createElement('div', 'qt-ich qt-empty');
    this.chartWrap.after(this.ichWrap);
    this.ichWrap.after(this.tableWrap);
  }

  /**
   * Load data and render — an alias for setData keeping the two-step
   * create-then-init call shape (QT-API-001).
   * @param {Object[]} data Long-format ECG records matching the qt-explorer data contract.
   * @returns {SafetyQtExplorer} The instance, for chaining.
   */
  init(data) {
    return this.setData(data);
  }

  /**
   * Replace the bound data and re-render: validate (throwing and rendering the
   * message into the target when required columns are missing), clean, rebuild
   * controls, and render the active view.
   * @param {Object[]} data Long-format ECG records matching the qt-explorer data contract.
   * @returns {SafetyQtExplorer} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.buildProfileRows();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Derive the docked profile's pre-cleaned rows ONCE per data/settings change
   * (#99, PPRF-QT-002) — never per gesture. Each raw record is shallow-copied
   * with a synthesized `__qt_profile_uln = 1` column before the shared
   * hep-core ingest, so `__hep_relative_uln` carries the observed value in
   * milliseconds and the ULN>0 guard drops nothing numeric; the host's
   * retained rawData is never mutated.
   * @private
   */
  buildProfileRows() {
    this.profileRows = this.settings.profile
      ? buildProfileRows(
          this.rawData.map((row) => ({ ...row, __qt_profile_uln: 1 })),
          this.profileSettings()
        )
      : [];
  }

  /**
   * Merge setting overrides, re-normalize (same rules as the factory), rebuild
   * controls, and re-render.
   * @param {QtExplorerSettings} settings Setting overrides to merge.
   * @returns {SafetyQtExplorer} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    // Only reset the selected correction when the override touched it (or the
    // measure list, which may drop the current one) — otherwise a filter- or
    // reference-only override would silently reset the user's chosen correction.
    if ('start_measure' in settings || 'measures' in settings) {
      this.state.measure = this.settings.start_measure;
    }
    if (this.rawData.length) this.validateAndCleanData();
    this.buildProfileRows();
    syncProfileDock(this, () => this.profileSettings());
    this.buildControls();
    this.render();
    return this;
  }

  /** Validate + clean; resolve measures, arms, placebo, visits, and prune stale state. @private */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      // Destroy live charts before wiping the shell so Chart.js instances do not
      // leak when a later setData/setSettings re-renders.
      this.destroyCharts();
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    const { rows, removed } = cleanData(this.rawData, this.settings);
    this.cleanRows = rows;
    this.removedRecords = removed;
    if (removed) console.warn(`${removed} missing or non-numeric results have been removed.`);
    this.placeboArm = placeboArmFor(rows, this.settings.placebo_arm);
    this.arms = armsPresent(rows, this.placeboArm);
    this.colorScale = armColorScale(this.arms);
    this.pointStyles = armPointStyles(this.arms);
    const measures = measuresPresent(rows);
    const available = this.settings.measures.filter((m) => measures.includes(m));
    this.availableMeasures = available.length ? available : measures;
    if (!this.availableMeasures.includes(this.state.measure)) {
      this.state.measure = this.availableMeasures[0];
    }
    // Prune stale filter selections: drop filters no longer configured, or whose
    // value is absent from the new data, so an invisible filter can never keep
    // constraining the views to nothing (QT-CTRL-003).
    const configured = new Set(this.settings.filters.map((f) => f.value_col));
    for (const col of Object.keys(this.state.filters)) {
      const present = rows.some((row) => String(row[col]) === String(this.state.filters[col]));
      if (!configured.has(col) || !present) delete this.state.filters[col];
    }
  }

  /**
   * Render the View selector into its own section as a visible list of options
   * (QT-CTRL-001): one styled, clickable row per view with the active view
   * highlighted, so all three views are always shown rather than hidden inside
   * a dropdown. Delegates to the shared shell builder (#76 / VIEW-2) so the
   * option list + CSS live in one place (matching the hep-explorer selector).
   * @param {Function} addSection The shell's section builder.
   * @private
   */
  buildViewControl(addSection) {
    renderViewSelector(addSection, {
      options: VIEWS,
      active: this.state.view,
      onChange: (value) => {
        this.state.view = value;
        this.buildControls();
        this.render();
      }
    });
  }

  /** Build the sidebar controls for the active view. @private */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);
    this.buildViewControl(addSection);
    const section = addSection('Display');

    const measureSelect = addControl('Correction', document.createElement('select'), section);
    this.availableMeasures.forEach((m) => option(measureSelect, m, m, m === this.state.measure));
    measureSelect.onchange = () => {
      this.state.measure = measureSelect.value;
      // Rebuild controls so the timepoint selector reconciles to the new
      // measure's visits (a visit absent for the new correction would otherwise
      // strand the scatter on an empty timepoint).
      this.buildControls();
      this.render();
    };

    if (this.state.view === 'central') {
      const statSelect = addControl('Statistic', document.createElement('select'), section);
      STATISTICS.forEach((s) =>
        option(statSelect, s.value, s.label, s.value === this.state.statistic)
      );
      statSelect.onchange = () => {
        this.state.statistic = statSelect.value;
        this.render();
      };
      const modeSelect = addControl('Display type', document.createElement('select'), section);
      DISPLAY_MODES.forEach((m) =>
        option(modeSelect, m.value, m.label, m.value === this.state.mode)
      );
      modeSelect.onchange = () => {
        this.state.mode = modeSelect.value;
        this.render();
      };
    }

    if (this.state.view === 'outlier') {
      const visits = this.postBaselineVisits();
      // Self-heal a stale timepoint (a visit that no longer exists for the
      // current measure) back to the maximum-post-baseline default.
      if (this.state.timepoint !== TIMEPOINT_MAX && !visits.includes(this.state.timepoint)) {
        this.state.timepoint = TIMEPOINT_MAX;
      }
      const tpSelect = addControl('Timepoint', document.createElement('select'), section);
      option(
        tpSelect,
        TIMEPOINT_MAX,
        'Maximum post-baseline',
        this.state.timepoint === TIMEPOINT_MAX
      );
      visits.forEach((v) => option(tpSelect, v, v, this.state.timepoint === v));
      tpSelect.onchange = () => {
        this.state.timepoint = tpSelect.value;
        this.render();
      };
    }

    if (this.settings.filters.length) {
      const filterSection = addSection('Filters');
      this.settings.filters.forEach((filter) => {
        const select = addControl(filter.label, document.createElement('select'), filterSection);
        option(select, '', 'All', !this.state.filters[filter.value_col]);
        unique(this.cleanRows.map((row) => row[filter.value_col]))
          .map(String)
          .sort()
          .forEach((value) =>
            option(select, value, value, this.state.filters[filter.value_col] === value)
          );
        select.onchange = () => {
          if (select.value) this.state.filters[filter.value_col] = select.value;
          else delete this.state.filters[filter.value_col];
          this.render();
        };
      });
    }
  }

  /** Post-baseline visit labels for the current measure. @private */
  postBaselineVisits() {
    const rows = forMeasure(this.cleanRows, this.state.measure).filter((r) => r.__qt_postBaseline);
    return orderVisits(rows, this.settings);
  }

  /** Destroy live charts before re-rendering into the shared canvas. @private */
  destroyCharts() {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    this.chart = null;
  }

  /**
   * Render the active view into the shared canvas: destroy prior charts, apply
   * the filters, and dispatch to the central-tendency, outlier, or categorical
   * renderer.
   * @returns {void}
   */
  render() {
    // Tear down and reset the slots first, so an empty-data render leaves no
    // stale chart, table, or note behind (a setData whose rows all clean away).
    this.destroyCharts();
    // Any render — a view switch, a control change, new data — silently drops
    // the outlier-scatter selection, so the dock must empty in the same
    // preamble (#99, PPRF-QT-003); on the non-scatter views it then idles,
    // still mounted.
    this.state.selectedId = null;
    this.participantsSelected = [];
    resetProfileDock(this);
    this.legendEl.classList.add('qt-empty');
    this.noteEl.classList.add('qt-empty');
    this.tableWrap.classList.add('qt-empty');
    this.ichWrap.classList.add('qt-empty');
    this.footnote.textContent = '';
    this.chartWrap.style.display = '';
    if (!this.cleanRows.length) {
      // Silent before any data is bound; an explicit note once data arrived but
      // every row was cleaned away (e.g. all non-numeric values).
      if (this.rawData.length) {
        this.chartWrap.style.display = 'none';
        this.noteEl.classList.remove('qt-empty');
        this.noteEl.textContent = 'No usable ECG results after cleaning the data.';
      }
      return;
    }
    this.filteredRows = applyFilters(this.cleanRows, this.state.filters);
    if (this.state.view === 'central') this.renderCentral();
    else if (this.state.view === 'outlier') this.renderOutlier();
    else this.renderCategorical();
  }

  /** Show a "select a QTc correction" note and hide chart/table (HR, QTc-only views). @private */
  showQtcOnlyNote() {
    this.chartWrap.style.display = 'none';
    this.tableWrap.classList.add('qt-empty');
    this.legendEl.classList.add('qt-empty');
    this.noteEl.classList.remove('qt-empty');
    this.noteEl.textContent =
      `${this.state.measure} is a heart-rate parameter — the outlier scatter and categorical ` +
      `exceedance apply to the QTc corrections (${this.settings.qtc_measures.join(', ')}). ` +
      `Select a QTc correction, or use the Central tendency view for heart rate.`;
  }

  /** Draw the "Treatments" arm legend (color swatch per arm). @private */
  drawLegend(arms) {
    this.legendEl.classList.remove('qt-empty');
    this.legendEl.innerHTML = '';
    this.legendEl.append(createElement('strong', null, 'Treatments:'));
    arms.forEach((arm) => {
      const chip = createElement('span', 'qt-legend-item');
      const swatch = createElement('span');
      swatch.style.cssText = `display:inline-block;width:.75rem;height:.75rem;border-radius:2px;background:${this.colorScale.get(
        String(arm)
      )}`;
      chip.append(swatch, document.createTextNode(String(arm)));
      this.legendEl.append(chip);
    });
  }

  // ---- Central tendency (QT-CT-*) -----------------------------------------
  /**
   * Render the central-tendency view. @private
   */
  /**
   * Render the central-tendency view. @private
   */
  /**
   * Render the central-tendency view. @private
   */
  renderCentral() {
    const measure = this.state.measure;
    const isQtc = isQtcMeasure(measure, this.settings.qtc_measures);
    const measureRows = forMeasure(this.filteredRows, measure);
    const visitOrder = orderVisits(measureRows, this.settings);
    const tendency = centralTendencySeries(measureRows, {
      statistic: this.state.statistic,
      mode: this.state.mode,
      arms: this.arms,
      visitOrder,
      placeboArm: this.placeboArm,
      ciLevel: this.settings.ci_level
    });

    if (this.state.mode === 'deltadelta' && !this.placeboArm) {
      this.chartWrap.style.display = 'none';
      this.noteEl.classList.remove('qt-empty');
      this.noteEl.textContent =
        'ΔΔ (placebo-corrected) needs a placebo arm; none was found. Switch to Δ, or set placebo_arm.';
      return;
    }

    const visitIndex = new Map(visitOrder.map((visit, index) => [visit, index]));
    const seriesArms = tendency.series.map((s) => s.arm);
    const datasets = tendency.series.map((band) => {
      const color = this.colorScale.get(String(band.arm)) || ARM_COLORS[0];
      const points = band.points
        .filter((p) => visitIndex.has(p.visit) && Number.isFinite(p.value))
        .map((p) => ({ x: visitIndex.get(p.visit), y: p.value, __point: p, __arm: band.arm }));
      return {
        label: band.arm,
        data: points,
        showLine: true,
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointStyle: this.pointStyles.get(String(band.arm)) || 'circle',
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0
      };
    });

    const peaks = peakVisits(tendency);
    let peak = null;
    for (const [arm, p] of peaks) {
      if (!peak || p.value > peak.value) peak = { arm, visit: p.visit, value: p.value };
    }
    const showReference = isQtc;
    this.centralSpec = {
      visitIndex,
      series: tendency.series,
      colorScale: this.colorScale,
      showReference,
      referenceThreshold: this.settings.reference_threshold,
      referenceLabel:
        this.state.mode === 'deltadelta'
          ? `ICH-E14 reference (${this.settings.reference_threshold} ms)`
          : `Step 1a screening (${this.settings.reference_threshold} ms)`,
      peak
    };

    const values = tendency.series.flatMap((s) =>
      s.points.flatMap((p) => [p.value, p.lo, p.hi].filter(Number.isFinite))
    );
    const yDomain = paddedDomain(
      values,
      showReference ? [0, this.settings.reference_threshold] : [0]
    );

    this.chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `${this.state.mode === 'deltadelta' ? 'ΔΔ' : 'Δ'} ${measure} — ${
              this.state.statistic === 'mean' ? 'Mean' : 'Median'
            } over time by arm`
          },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => {
                const p = ctx.raw && ctx.raw.__point;
                if (!p) return '';
                const lines = [
                  `${ctx.raw.__arm} @ ${p.visit}`,
                  `${formatSigned(p.value)} (n=${p.n})`
                ];
                if (Number.isFinite(p.lo) && Number.isFinite(p.hi)) {
                  lines.push(
                    `${Math.round(this.settings.ci_level * 100)}% CI ${formatSigned(p.lo)}, ${formatSigned(p.hi)}`
                  );
                }
                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: -0.5,
            max: Math.max(visitOrder.length - 0.5, 0.5),
            offset: false,
            grid: { display: false },
            title: { display: true, text: 'Visit' },
            ticks: {
              stepSize: 1,
              autoSkip: false,
              maxRotation: 45,
              callback: (value) => (Number.isInteger(value) ? (visitOrder[value] ?? '') : '')
            },
            afterBuildTicks: (axis) => {
              axis.ticks = visitOrder.map((_, index) => ({ value: index }));
            }
          },
          y: {
            type: 'linear',
            min: yDomain[0],
            max: yDomain[1],
            title: {
              display: true,
              text: centralAxisTitle(measure, this.state.mode, this.settings.qtc_measures)
            }
          }
        }
      },
      plugins: [centralTendencyPlugin(this)]
    });
    this.charts.push(this.chart);

    this.drawLegend(seriesArms);
    this.drawIchCallout(tendency, isQtc);
    this.setCentralFootnote(measure, isQtc);
  }

  /** ICH-E14 metric callout (mean + ΔΔ + QTc only). @private */
  drawIchCallout(tendency, isQtc) {
    if (!isQtc || this.state.mode !== 'deltadelta' || this.state.statistic !== 'mean') return;
    const metric = ichE14Metric(tendency, this.settings.reference_threshold);
    if (!metric.length) return;
    this.ichWrap.classList.remove('qt-empty');
    this.ichWrap.innerHTML = '';
    const table = createElement('table');
    const caption = createElement(
      'caption',
      null,
      `ICH-E14 metric — largest upper bound of the two-sided ${Math.round(
        this.settings.ci_level * 100
      )}% CI for ΔΔ ${this.state.measure} vs ${this.settings.reference_threshold} ms`
    );
    table.append(caption);
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Arm', 'Max upper CI (ms)', 'Peak visit', ''].forEach((h) =>
      hr.append(createElement('th', h.startsWith('Max') ? 'qt-num' : null, h))
    );
    thead.append(hr);
    table.append(thead);
    const tbody = document.createElement('tbody');
    metric.forEach((m) => {
      const tr = document.createElement('tr');
      tr.append(createElement('td', null, m.arm));
      tr.append(createElement('td', 'qt-num', formatNumber(m.maxUpper)));
      tr.append(createElement('td', null, m.visit || '—'));
      tr.append(
        createElement('td', m.exceeds ? 'qt-flag' : null, m.exceeds ? '≥ threshold' : 'below')
      );
      tbody.append(tr);
    });
    table.append(tbody);
    this.ichWrap.append(table);
  }

  /** Central-tendency footnote: method + mode caveats. @private */
  setCentralFootnote(measure, isQtc) {
    const parts = [];
    if (this.state.mode === 'deltadelta') {
      parts.push(
        'ΔΔ is the exploratory difference of mean changes (arm − placebo); the CI is a large-sample normal approximation, not the regulatory ANCOVA/MMRM bound.'
      );
    }
    if (measure === 'QTcB') {
      parts.push(
        'QTcB (Bazett) overcorrects at high heart rate; QTcF/QTcI are the workflow’s preferred corrections.'
      );
    }
    if (!isQtc) {
      parts.push('Heart rate has no ICH-E14 QTc reference; read alongside the QTc corrections.');
    }
    parts.push('Exploratory tool — confirm signals with validated ICH-E14 analyses.');
    this.footnote.textContent = parts.join(' ');
  }

  // ---- Outlier scatter (QT-OUT-*) -----------------------------------------
  /**
   * Render the outlier-scatter view. @private
   */
  /**
   * Render the outlier-scatter view. @private
   */
  /**
   * Render the outlier-scatter view. @private
   */
  renderOutlier() {
    const measure = this.state.measure;
    if (!isQtcMeasure(measure, this.settings.qtc_measures)) {
      this.showQtcOnlyNote();
      this.footnote.textContent = '';
      return;
    }
    const measureRows = forMeasure(this.filteredRows, measure);
    const points = subjectPoints(measureRows, {
      timepoint: this.state.timepoint,
      idCol: this.settings.id_col
    });
    const isMax = this.state.timepoint === TIMEPOINT_MAX;
    this.scatterThresholds = {
      showAbsolute: true,
      absolute: this.settings.absolute_thresholds,
      showChange: !isMax,
      change: this.settings.change_thresholds
    };

    const armsWithPoints = this.arms.filter((arm) => points.some((p) => p.arm === arm));
    const datasets = armsWithPoints.map((arm) => {
      const color = this.colorScale.get(String(arm)) || ARM_COLORS[0];
      return {
        label: arm,
        data: points
          .filter((p) => p.arm === arm)
          .map((p) => ({ x: p.baseline, y: p.change, __point: p })),
        pointStyle: this.pointStyles.get(String(arm)) || 'circle',
        backgroundColor: hexToRgba(color, 0.75),
        borderColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        showLine: false
      };
    });

    const titles = scatterAxisTitles(measure, this.settings.qtc_measures);
    const xDomain = paddedDomain(points.map((p) => p.baseline));
    const yDomain = paddedDomain(
      points.map((p) => p.change),
      [0, ...(isMax ? [] : this.settings.change_thresholds)]
    );
    const tpLabel = isMax ? 'Maximum post-baseline' : `Visit: ${this.state.timepoint}`;

    this.chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: `${measure} outlier scatter — ${tpLabel}` },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) =>
                ctx.raw && ctx.raw.__point ? scatterTooltip(ctx.raw.__point, measure) : ''
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: xDomain[0],
            max: xDomain[1],
            title: { display: true, text: titles.x }
          },
          y: {
            type: 'linear',
            min: yDomain[0],
            max: yDomain[1],
            title: { display: true, text: titles.y }
          }
        },
        onHover: (event, elements) => {
          if (event && event.native && event.native.target) {
            event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
          }
        },
        // Point click → participant selection feeding the docked profile
        // (#99, PPRF-QT-001); an empty click clears (PPRF-11).
        onClick: (event, elements) => {
          if (!elements.length) {
            this.clearSelection();
            return;
          }
          const el = elements[0];
          const raw = datasets[el.datasetIndex] && datasets[el.datasetIndex].data[el.index];
          if (raw && raw.__point) this.selectParticipant(raw.__point.id);
        }
      },
      plugins: [thresholdScatterPlugin(this)]
    });
    this.charts.push(this.chart);

    this.drawLegend(armsWithPoints);
    const footParts = [
      `${points.length} participants.`,
      isMax
        ? 'Each point is a participant’s maximum post-baseline value; change-from-baseline lines are shown only in per-visit mode — see the categorical table for change-threshold counts.'
        : 'Each point is the selected visit’s reading; diagonals are absolute-QTc thresholds, horizontals are change-from-baseline thresholds.',
      'Exploratory tool — confirm signals with validated ICH-E14 analyses.'
    ];
    this.footnote.textContent = footParts.join(' ');
  }

  // ---- Categorical exceedance (QT-CAT-*) ----------------------------------
  /**
   * Render the categorical-exceedance view. @private
   */
  /**
   * Render the categorical-exceedance view. @private
   */
  /**
   * Render the categorical-exceedance view. @private
   */
  renderCategorical() {
    const measure = this.state.measure;
    if (!isQtcMeasure(measure, this.settings.qtc_measures)) {
      this.showQtcOnlyNote();
      this.footnote.textContent = '';
      return;
    }
    const measureRows = forMeasure(this.filteredRows, measure);
    const classification = classifyThresholds(measureRows, {
      idCol: this.settings.id_col,
      arms: this.arms,
      absoluteThresholds: this.settings.absolute_thresholds,
      changeThresholds: this.settings.change_thresholds
    });
    this.classification = classification;

    this.chartWrap.style.display = 'none';
    this.tableWrap.classList.remove('qt-empty');
    this.tableWrap.innerHTML = '';
    const table = createElement('table');
    table.append(
      createElement(
        'caption',
        null,
        `${measure} — participants exceeding thresholds by arm (maximum post-baseline)`
      )
    );
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.append(createElement('th', null, 'Threshold'));
    const columns = [...classification.arms, 'All'];
    columns.forEach((arm) => {
      const denom = arm === 'All' ? classification.allDenom : classification.denominators[arm] || 0;
      hr.append(createElement('th', 'qt-num', `${arm} (n=${denom})`));
    });
    thead.append(hr);
    table.append(thead);
    const tbody = document.createElement('tbody');
    classification.rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.append(createElement('td', null, row.label));
      columns.forEach((arm) => {
        const cell = row.cells[arm] || { count: 0, percent: 0 };
        tr.append(createElement('td', 'qt-num', `${cell.count} (${formatNumber(cell.percent)}%)`));
      });
      tbody.append(tr);
    });
    table.append(tbody);
    this.tableWrap.append(table);

    this.drawLegend(classification.arms);
    this.footnote.textContent =
      'Absolute rows use each participant’s maximum post-baseline value; change rows use the maximum post-baseline change (they may fall at different visits). Exploratory tool — confirm signals with validated ICH-E14 analyses.';
  }

  /**
   * Select one participant from the outlier scatter (#99, PPRF-QT-001): set
   * the minimal host selection state, emphasize the participant's point, and
   * dispatch the house participantsSelected event on the shell root — which
   * feeds the docked profile. Single-select only (PPRF-QT-004).
   * @param {string} id Participant identifier.
   * @returns {void}
   */
  selectParticipant(id) {
    this.state.selectedId = id == null ? null : String(id);
    this.emphasizeParticipant(this.state.selectedId);
    this.dispatchSelection(this.state.selectedId == null ? [] : [this.state.selectedId]);
  }

  /**
   * Clear the point selection (#99, PPRF-QT-003): restore the uniform point
   * emphasis and dispatch the empty selection so the dock empties.
   * @returns {void}
   */
  clearSelection() {
    if (this.state.selectedId == null) return;
    this.state.selectedId = null;
    this.emphasizeParticipant(null);
    this.dispatchSelection([]);
  }

  /**
   * Emphasize (or restore, for a null id) one participant's scatter point
   * WITHOUT touching the host selection state — also the transient emphasis
   * the profile stepper drives (PPRF-11). Per-point radius/border arrays are
   * matched on each datum's __point.id; a no-op outside the outlier view.
   * @param {?string} id Participant identifier, or null to restore.
   * @private
   */
  emphasizeParticipant(id) {
    if (!this.chart || this.state.view !== 'outlier') return;
    this.chart.data.datasets.forEach((dataset) => {
      if (id == null) {
        dataset.pointRadius = 4;
        dataset.pointHoverRadius = 6;
        dataset.pointBorderWidth = 1;
      } else {
        const match = (raw) => raw.__point && String(raw.__point.id) === String(id);
        dataset.pointRadius = dataset.data.map((raw) => (match(raw) ? 7 : 3));
        dataset.pointHoverRadius = dataset.data.map((raw) => (match(raw) ? 8 : 5));
        dataset.pointBorderWidth = dataset.data.map((raw) => (match(raw) ? 3 : 1));
      }
    });
    this.chart.update();
  }

  /**
   * Dispatch the custom participantsSelected event on the shell root with the
   * selected IDs (the house selection contract, #99 PPRF-QT-001).
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
   * Resize the live charts (e.g. after the sidebar collapses).
   * @returns {void}
   */
  resize() {
    this.charts.forEach((chart) => chart.resize());
  }

  /**
   * Destroy the charts and empty the target element.
   * @returns {void}
   */
  destroy() {
    unmountProfileDock(this);
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a QT Safety Explorer bound to a target element.
 * @param {string|HTMLElement} [element='body'] Target selector or element.
 * @param {QtExplorerSettings} [settings={}] Setting overrides.
 * @returns {SafetyQtExplorer} The instance.
 */
export default function qtExplorer(element = 'body', settings = {}) {
  return new SafetyQtExplorer(element, settings);
}
