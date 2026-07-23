// Public entrypoint for the hep-waterfall module (safety.viz#93,
// obot.roadmap#43): the modified ALT waterfall of Amirzadegan et al.,
// "Emerging Tools to Support DILI Assessment in Clinical Trials with Abnormal
// Baseline Serum Liver Tests or Pre-existing Liver Diseases", Drug Safety
// 2025;48(5):443-453, Figure 5.
//
// One floating bar per participant spans their baseline value to their maximum
// on-treatment value in the data's ABSOLUTE units, so a bar points up on a rise
// and down on a fall. Participants are ranked by baseline — placebo ascending
// left to right, active descending right to centre — so the two arms' highest
// baselines meet at the seam and the black baseline trace forms a single
// mountain. Bars are blue for placebo and bronze for active, overridden by
// green for anyone who developed new-onset jaundice, and a box-and-whisker
// panel flanks each arm.
//
// WHY THIS IS A MODULE AND NOT ANOTHER hep-explorer VIEW. The paper's own
// Table 1 assigns this figure to a DIFFERENT population — trials with elevated
// baseline ALT but NORMAL baseline bilirubin — and it EXCLUDES exactly the
// baseline-jaundiced participants the migration Sankey and the composite plot
// require. It also plots absolute U/L rather than a ratio, because ×ULN
// quadrants lose their meaning once the baseline is abnormal. Different
// population, different units, different question.
//
// Same lifecycle API and module flow as the rest of the library (checkInputs →
// configure → structureData → getScales/getPlugins → new Chart), rendering into
// the shared sv-* shell. Requirement groups: HWF-CFG-*, HWF-DATA-*, HWF-ORDER-*,
// HWF-BAR-*, HWF-AXIS-*, HWF-COLOR-*, HWF-BOX-*, HWF-CTRL-*, HWF-SELECT-*,
// HWF-API-*.
//
// PUBLIC METHODS MAY NOT LEAVE THIS FILE. scripts/api/extract.mjs derives a
// module's documented surface as ['src/<module>.js', 'src/<module>/configure.js'],
// so anything public that moved out would vanish from the API reference and
// break the site build. Only @private internals live in src/hep-waterfall/.

import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';

import { controlBuilders, createElement, option, prototypeBanner, renderShell } from './shell.js';
import { boxWhiskerPlugin } from './box-whisker.js';
import { ARM_SIDE_COLORS } from './hep-core/arms.js';
import { checkInputs } from './hep-waterfall/checkInputs.js';
import {
  MEASURE_KEYS,
  SUMMARY_MODES,
  ULN_DISPLAYS,
  syncSettings
} from './hep-waterfall/configure.js';
import {
  boxSpecs,
  buildWaterfall,
  prepareData,
  waterfallDatasets
} from './hep-waterfall/structureData.js';
import {
  axisTitle,
  categoryScale,
  flankScales,
  formatNumber,
  mirroredScales,
  resolveUnit,
  waterfallDomain
} from './hep-waterfall/getScales.js';
import {
  JAUNDICE_PRECEDENCE,
  TRACE_COLOR,
  armDividerPlugin,
  barColor,
  legendItems,
  ulnBandPlugin,
  ulnRange,
  waterfallTooltip
} from './hep-waterfall/getPlugins.js';
import { unique } from './hep-explorer/structureData.js';
import { renderListing } from './histogram/listing.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

const STYLE_ID = 'safety-viz-hep-waterfall-styles';
const STYLES = `
.safety-hep-waterfall .hwf-layout{display:grid;grid-template-columns:110px 1fr 110px;gap:.5rem;height:100%;align-items:stretch}
.safety-hep-waterfall .hwf-panel{position:relative;min-width:0}
.safety-hep-waterfall .hwf-legend{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .9rem;font-size:.8rem;color:#52616f;margin:0 0 .5rem}
.safety-hep-waterfall .hwf-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.safety-hep-waterfall .hwf-legend-swatch{display:inline-block;width:.75rem;height:.75rem;border-radius:2px}
.safety-hep-waterfall .hwf-legend-note{color:#52616f;font-style:italic}
.safety-hep-waterfall .hwf-reset{width:100%;margin-top:.75rem;padding:.35rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.82rem;cursor:pointer}
.safety-hep-waterfall .hwf-reset:hover{border-color:#8f9aa8;background:#f6f8fa}
@media (max-width:700px){.safety-hep-waterfall .hwf-layout{grid-template-columns:70px 1fr 70px}}
`;

/** Inject the module stylesheet once per document. @private */
function applyWaterfallStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.append(style);
}

/**
 * Interactive modified ALT waterfall for participants with abnormal baseline
 * liver tests and normal baseline bilirubin: one floating bar per participant
 * from their own baseline to their maximum on-treatment value in absolute
 * units, ranked by baseline so the two arms meet at the seam, with new-onset
 * jaundice highlighted and a box-and-whisker summary flanking each arm.
 * Construct via the hepWaterfall() factory rather than directly; the
 * constructor renders the control shell immediately and waits for data.
 */
class SafetyHepWaterfall {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Hep Waterfall target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanRows = [];
    this.removedRecords = 0;
    this.charts = [];
    this.flankCharts = [];
    this.chart = null;
    this.waterfall = null;
    this.boxSpecs = { left: [], right: [] };
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.state = this.seedState();
    this.renderShellDom();
  }

  /**
   * The control state derived from the settings — the single place the sidebar
   * controls, setSettings and the Reset button all read their starting values
   * from (HWF-CTRL-004).
   * @private
   */
  seedState() {
    const active = this.settings.active_arms;
    return {
      measure: this.settings.measure,
      jaundiceUln: this.settings.jaundice_uln,
      applyTbCohort: this.settings.apply_tb_cohort,
      ulnDisplay: this.settings.uln_display,
      summary: this.settings.summary,
      placeboArm: this.settings.placebo_arm,
      activeArm: active && active.length === 1 ? active[0] : '',
      filters: {},
      selectedIds: []
    };
  }

  /**
   * The settings the render actually runs on: the configured settings with the
   * live control values merged over them, so structureData and getScales never
   * have to know that a control exists.
   * @private
   */
  effectiveSettings() {
    return {
      ...this.settings,
      measure: this.state.measure,
      jaundice_uln: this.state.jaundiceUln,
      apply_tb_cohort: this.state.applyTbCohort,
      uln_display: this.state.ulnDisplay,
      summary: this.state.summary,
      placebo_arm: this.state.placeboArm,
      active_arms: this.state.activeArm ? [this.state.activeArm] : null
    };
  }

  /**
   * Build the shell and the three-canvas grid the paper's flanking panels need:
   * a placebo summary, the waterfall, an active summary (HWF-BOX-001).
   * @private
   */
  renderShellDom() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-hep-waterfall',
        onToggle: () => this.resize()
      })
    );
    applyWaterfallStyles();
    // Prototype marking: a notice at the top of the chart so the not-yet-stable
    // status travels with the widget wherever it renders, not only on the
    // gallery pages (which also carry the config's prototype badge).
    this.main.insertBefore(prototypeBanner(), this.main.firstChild);
    this.legendEl = createElement('div', 'hwf-legend');
    this.main.insertBefore(this.legendEl, this.chartWrap);

    const layout = createElement('div', 'hwf-layout');
    const leftPanel = createElement('div', 'hwf-panel');
    this.boxCanvasLeft = createElement('canvas', 'hwf-box-left');
    leftPanel.append(this.boxCanvasLeft);
    const mainPanel = createElement('div', 'hwf-panel hwf-main-panel');
    this.canvas.remove();
    mainPanel.append(this.canvas);
    const rightPanel = createElement('div', 'hwf-panel');
    this.boxCanvasRight = createElement('canvas', 'hwf-box-right');
    rightPanel.append(this.boxCanvasRight);
    layout.append(leftPanel, mainPanel, rightPanel);
    this.chartWrap.insertBefore(layout, this.mainAnnotation);
  }

  /**
   * Load data and render — an alias for setData keeping the two-step
   * create-then-init call shape (HWF-API-002).
   * @param {Object[]} data Long-format liver-chemistry records matching the hep-waterfall data contract.
   * @returns {SafetyHepWaterfall} The instance, for chaining.
   */
  init(data) {
    return this.setData(data);
  }

  /**
   * Replace the bound data and re-render: validate against the settings mapping
   * (throwing, and rendering the message into the target, when a required
   * column is missing), clean, rebuild the controls, and draw.
   * @param {Object[]} data Long-format liver-chemistry records matching the hep-waterfall data contract.
   * @returns {SafetyHepWaterfall} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides, re-normalize them (same rules as the factory),
   * re-seed every control from the merged settings, rebuild the controls, and
   * re-render.
   * @param {HepWaterfallSettings} settings Setting overrides to merge.
   * @returns {SafetyHepWaterfall} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.state = this.seedState();
    if (this.rawData.length) this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data, drop unusable records, derive the baseline columns,
   * and fill in the listing columns when none were supplied.
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      // Destroy live charts before wiping the shell so Chart.js instances do
      // not leak when a later setData/setSettings re-renders.
      this.destroyCharts();
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    const { rows, removed } = prepareData(this.rawData, this.settings);
    this.cleanRows = rows;
    this.removedRecords = removed;
    if (removed) {
      console.warn(
        `${removed} missing or non-numeric result${removed > 1 ? 's have' : ' has'} been removed.`
      );
    }
    if (!this.settings.details.length) {
      this.settings.details = [
        { value_col: this.settings.id_col, label: 'Participant' },
        { value_col: this.settings.measure_col, label: 'Measure' },
        { value_col: '__hwf_dayLabel', label: 'Study Day' },
        { value_col: this.settings.value_col, label: 'Result' },
        { value_col: this.settings.normal_col_high, label: 'ULN' }
      ];
    }
  }

  /**
   * The distinct arm values present in the cleaned data.
   * @private
   */
  armValues() {
    const armCol = (this.waterfall && this.waterfall.armCol) || this.settings.arm_col;
    return unique(this.cleanRows.map((row) => row[armCol]))
      .map(String)
      .sort();
  }

  /**
   * Rebuild the sidebar controls (HWF-CTRL-001..004): the display settings, the
   * arm mapping, the configured filters, and Reset.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);

    const display = addSection('Display');
    const measure = addControl('Measure', document.createElement('select'), display);
    const measureKeys = unique([...Object.keys(this.settings.measure_values), ...MEASURE_KEYS]);
    measureKeys.forEach((key) => option(measure, key, key, key === this.state.measure));
    measure.onchange = () => {
      this.state.measure = measure.value;
      this.render();
    };

    const jaundice = addControl(
      'Jaundice threshold (×ULN)',
      document.createElement('input'),
      display
    );
    jaundice.type = 'number';
    jaundice.min = '0';
    jaundice.step = '0.1';
    jaundice.value = String(this.state.jaundiceUln);
    jaundice.onchange = () => {
      const value = Number(jaundice.value);
      this.state.jaundiceUln = Number.isFinite(value) ? value : this.settings.jaundice_uln;
      jaundice.value = String(this.state.jaundiceUln);
      this.render();
    };

    const cohortWrap = createElement('div', 'sv-control sv-control-inline');
    const cohort = document.createElement('input');
    cohort.type = 'checkbox';
    cohort.id = 'hwf-cohort';
    cohort.checked = this.state.applyTbCohort;
    cohort.onchange = () => {
      this.state.applyTbCohort = cohort.checked;
      this.render();
    };
    const cohortLabel = createElement(
      'label',
      null,
      `Exclude baseline bilirubin > ${formatNumber(this.settings.baseline_tb_max, 2)}×ULN`
    );
    cohortLabel.htmlFor = cohort.id;
    cohortWrap.append(cohort, cohortLabel);
    display.append(cohortWrap);

    const uln = addControl('Reference range', document.createElement('select'), display);
    const ulnLabels = {
      band: 'Band (cohort range)',
      per_subject: 'Per participant',
      none: 'Hidden'
    };
    ULN_DISPLAYS.forEach((value) =>
      option(uln, value, ulnLabels[value], value === this.state.ulnDisplay)
    );
    uln.onchange = () => {
      this.state.ulnDisplay = uln.value;
      this.render();
    };

    const summary = addControl('Arm summary', document.createElement('select'), display);
    const summaryLabels = { baseline_peak: 'Baseline and peak', peak: 'Peak only' };
    SUMMARY_MODES.forEach((value) =>
      option(summary, value, summaryLabels[value], value === this.state.summary)
    );
    summary.onchange = () => {
      this.state.summary = summary.value;
      this.render();
    };

    // Arm mapping (HWF-CTRL-002): every arm value in the data is offerable as
    // either side, because auto-detection is a convenience and not a contract.
    const arms = this.armValues();
    const armSection = addSection('Arms');
    const placebo = addControl('Placebo arm', document.createElement('select'), armSection);
    option(placebo, '', 'Auto-detect', !this.state.placeboArm);
    arms.forEach((arm) => option(placebo, arm, arm, arm === this.state.placeboArm));
    placebo.onchange = () => {
      this.state.placeboArm = placebo.value || null;
      this.buildControls();
      this.render();
    };
    const active = addControl('Active arm', document.createElement('select'), armSection);
    option(active, '', 'All non-placebo arms', !this.state.activeArm);
    arms.forEach((arm) => option(active, arm, arm, arm === this.state.activeArm));
    active.onchange = () => {
      this.state.activeArm = active.value;
      this.buildControls();
      this.render();
    };

    const filterSpecs = this.settings.filters.filter((filter) =>
      this.cleanRows.some((row) => row[filter.value_col] !== undefined)
    );
    if (filterSpecs.length) {
      const filterSection = addSection('Filters');
      filterSpecs.forEach((filter) => {
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

    const reset = createElement('button', 'hwf-reset', 'Reset chart');
    reset.type = 'button';
    reset.onclick = () => {
      this.state = this.seedState();
      this.buildControls();
      this.render();
    };
    this.controls.append(reset);
  }

  /**
   * Render the notes line from the cohort's staged notes.
   * @private
   */
  renderNotes(notes) {
    this.notes.innerHTML = '';
    notes.forEach((note) =>
      this.notes.append(
        createElement('span', note.tone === 'warning' ? 'sv-warning' : null, note.text)
      )
    );
  }

  /**
   * Draw the colour legend, including the jaundice precedence rule.
   * @private
   */
  drawLegend() {
    this.legendEl.innerHTML = '';
    legendItems({
      placeboLabel: this.waterfall.placeboLabel,
      activeLabel: this.waterfall.activeLabel,
      jaundiceCount: this.waterfall.jaundiceCount
    }).forEach((item) => {
      const chip = createElement('span', 'hwf-legend-item');
      const swatch = createElement('span', 'hwf-legend-swatch');
      swatch.style.background = item.color;
      chip.append(swatch, document.createTextNode(item.label));
      this.legendEl.append(chip);
    });
    this.legendEl.append(createElement('span', 'hwf-legend-note', JAUNDICE_PRECEDENCE));
  }

  /**
   * Redraw everything from the current data, settings, and control state: the
   * cohort and its notes, the floating bars and baseline trace, the mirrored
   * axes, the arm divider and reference range, and the two flanking summary
   * panels. Called automatically by the controls and the data/settings setters.
   * @returns {void}
   */
  render() {
    this.destroyCharts();
    this.legendEl.innerHTML = '';
    this.listingWrap.innerHTML = '';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.state.selectedIds = [];
    this.mainAnnotation.textContent = '';
    this.chartWrap.style.display = '';
    this.footnote.textContent = '';

    if (!this.cleanRows.length) {
      this.waterfall = null;
      this.renderNotes([
        { tone: 'note', text: 'No data selected. Provide records to draw the chart.' }
      ]);
      this.chartWrap.style.display = 'none';
      return;
    }

    const settings = this.effectiveSettings();
    const waterfall = buildWaterfall(this.cleanRows, settings, {
      removed: this.removedRecords,
      filters: this.state.filters
    });
    const unit = resolveUnit(this.cleanRows, settings, settings.measure);
    waterfall.unit = unit.unit;
    waterfall.uln = ulnRange(waterfall.ordered);
    this.waterfall = waterfall;

    const notes = [...waterfall.notes];
    if (unit.mixed) {
      // An absolute axis needs one unit; two of them cannot be reconciled by
      // rendering harder (HWF-DATA-007).
      notes.push({
        tone: 'warning',
        text: `${settings.measure} carries more than one unit in this data (${unit.units.join(', ')}). The chart is suppressed: an absolute axis cannot mix units.`
      });
    }
    if (!unit.mixed && !waterfall.ordered.length) {
      notes.push({
        tone: 'warning',
        text: 'No participants meet the cohort rules for this chart.'
      });
    }
    this.renderNotes(notes);
    if (unit.mixed || !waterfall.ordered.length) {
      this.chartWrap.style.display = 'none';
      return;
    }

    const domain = waterfallDomain(
      waterfall.ordered.flatMap((subject) => [subject.baseline, subject.peak]),
      this.state.ulnDisplay === 'none' ? [] : waterfall.uln.values
    );
    this.domain = domain;
    this.drawMainChart(waterfall, domain, unit.unit);
    this.drawFlankCharts(waterfall, domain);
    this.drawLegend();
    this.footnote.textContent =
      `Each bar spans one participant's baseline ${settings.measure} to their maximum on-treatment ` +
      `${settings.measure} in ${unit.unit}; the black line traces the baselines. Click a bar for that ` +
      "participant's records. Exploratory tool — confirm signals with a full case review.";
  }

  /**
   * Build the waterfall chart itself.
   * @private
   */
  drawMainChart(waterfall, domain, unit) {
    const settings = this.effectiveSettings();
    const title = axisTitle(settings.measure, unit);
    const { y, y1 } = mirroredScales(domain, title);
    this.chart = new Chart(this.canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: waterfall.ordered.map((subject) => String(subject.id)),
        datasets: waterfallDatasets(waterfall.ordered, { measure: settings.measure })
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        onClick: (event, elements) => {
          if (!elements || !elements.length) return;
          const subject = waterfall.ordered[elements[0].index];
          if (subject) this.selectParticipant(subject.id);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) =>
                waterfallTooltip(waterfall.ordered[ctx.dataIndex], {
                  measure: settings.measure,
                  unit
                })
            }
          }
        },
        scales: {
          x: categoryScale(settings.measure, {
            placeboLabel: waterfall.placeboLabel,
            activeLabel: waterfall.activeLabel
          }),
          y,
          y1
        }
      },
      plugins: [ulnBandPlugin(this), armDividerPlugin(this)]
    });
    this.charts.push(this.chart);
  }

  /**
   * Build the two flanking summary panels (HWF-BOX-001/002): minimal charts
   * whose only marks come from the shared box-and-whisker plugin, with their
   * value axis pinned to the main chart's domain so all three panels are
   * vertically registered.
   * @private
   */
  drawFlankCharts(waterfall, domain) {
    const summary = this.state.summary;
    this.boxSpecs = {
      left: boxSpecs(waterfall.placebo, { summary, color: ARM_SIDE_COLORS.placebo }),
      right: boxSpecs(waterfall.active, { summary, color: ARM_SIDE_COLORS.active })
    };
    this.flankCharts = [
      ['left', this.boxCanvasLeft, waterfall.placeboLabel],
      ['right', this.boxCanvasRight, waterfall.activeLabel]
    ].map(([side, canvas, label]) => {
      const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { datasets: [{ data: [] }] },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            title: { display: true, text: label, font: { size: 11 } }
          },
          scales: flankScales(domain, this.boxSpecs[side].length)
        },
        plugins: [boxWhiskerPlugin(`hwf-${side}`, () => this.boxSpecs[side])]
      });
      this.charts.push(chart);
      return chart;
    });
  }

  /**
   * The selected participant's records, with the listing's derived columns.
   * @private
   */
  participantRecords(id) {
    return this.cleanRows
      .filter((row) => String(row[this.settings.id_col]) === String(id))
      .map((row) => ({
        ...row,
        __hwf_dayLabel: Number.isFinite(row.__hep_day) ? row.__hep_day : ''
      }));
  }

  /**
   * Select (or, when already selected, deselect) a participant: highlight their
   * bar, open the linked listing of their records, and dispatch the
   * participantsSelected event (HWF-SELECT-002, HWF-SELECT-003).
   * @param {string|number} id The participant identifier.
   * @returns {void}
   */
  selectParticipant(id) {
    const key = String(id);
    const selected = this.state.selectedIds.includes(key) ? [] : [key];
    this.state.selectedIds = selected;
    if (this.chart && this.waterfall) {
      const dataset = this.chart.data.datasets[0];
      dataset.borderColor = this.waterfall.ordered.map((subject) =>
        selected.includes(String(subject.id)) ? TRACE_COLOR : barColor(subject)
      );
      dataset.borderWidth = this.waterfall.ordered.map((subject) =>
        selected.includes(String(subject.id)) ? 2 : 0
      );
      this.chart.update();
    }
    if (selected.length) {
      this.currentTableData = this.participantRecords(key);
      this.listingSearch = '';
      this.listingSort = null;
      this.page = 1;
      renderListing(this);
      this.mainAnnotation.textContent = key;
    } else {
      this.currentTableData = [];
      this.listingWrap.innerHTML = '';
      this.mainAnnotation.textContent = '';
    }
    if (this.root) {
      this.root.dispatchEvent(
        new CustomEvent('participantsSelected', { detail: { data: selected }, bubbles: true })
      );
    }
  }

  /**
   * Resize every live chart — the waterfall and both flanking panels — to their
   * containers. For host layouts that change the container size without a
   * window resize, e.g. the R htmlwidget bindings.
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
    this.flankCharts = [];
    this.chart = null;
  }

  /**
   * Tear the waterfall down: destroy every chart and empty the target element.
   * The instance cannot be reused afterwards — create a new one via the factory.
   * @returns {void}
   */
  destroy() {
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a modified ALT waterfall inside a container element. The control shell
 * renders immediately; pass long-format liver-chemistry records to setData (or
 * init) on the returned instance to validate the data and draw the chart.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {HepWaterfallSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyHepWaterfall} The live hep-waterfall instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function hepWaterfall(element = 'body', settings = {}) {
  return new SafetyHepWaterfall(element, settings);
}
