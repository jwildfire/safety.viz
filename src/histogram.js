// Public entrypoint for the histogram module: the lifecycle API proven by the
// safety-histogram pilot (init, setData, setSettings, render, resize, destroy),
// kept verbatim in shape (SH-API-001). Extracted from safety-histogram
// dev @ a3ff9f7 under #2; internals follow the gsm.viz-style module flow
// (checkInputs → configure → structureData → getPlugins/getScales → new Chart).

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
import { ALGORITHMS, syncSettings } from './histogram/configure.js';
import { checkInputs } from './histogram/checkInputs.js';
import {
  applyFilters,
  binIndex,
  calculateBins,
  cleanData,
  displayDigits,
  measureHasNormalRange,
  measureLabel,
  unique
} from './histogram/structureData.js';
import {
  buildScales,
  buildTickLabels,
  normalizeDomain,
  resolveDomain
} from './histogram/getScales.js';
import {
  approximateGroupP,
  approximateNormalityP,
  binDescription,
  normalRangePlugin,
  selectionColors,
  statisticalAnnotation
} from './histogram/getPlugins.js';
import { renderListing } from './histogram/listing.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/**
 * Interactive safety histogram: a Chart.js bar chart of result
 * distributions with measure/filter/bin/normal-range controls, optional
 * grouped small multiples, and a linked participant listing. Construct via
 * the histogram() factory rather than directly; the constructor renders the
 * control shell immediately and waits for data.
 */
class SafetyHistogram {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Histogram target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanData = [];
    this.filteredData = [];
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.charts = [];
    this.state = {
      measure: this.settings.start_value,
      filters: {},
      groupBy: this.settings.group_by,
      lower: null,
      upper: null,
      algorithm: this.settings.bin_algorithm,
      quantity: null,
      width: null,
      displayNormalRange: this.settings.display_normal_range,
      normalRange: null,
      annotateBoundaries: this.settings.annotate_bin_boundaries
    };
    this.renderShell();
  }

  /**
   * Build the static DOM shell the charts and listing render into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-histogram',
        onToggle: () => this.resize()
      })
    );
    this.footnote.textContent = 'Hover over or click a bar for details.';
  }

  /**
   * Load data and render: an alias for setData that keeps the pilot's
   * two-step create-then-init call shape working (SH-API-001).
   * @param {Object[]} data Long-format result records matching the histogram data contract.
   * @returns {SafetyHistogram} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing), rows with missing or
   * non-numeric results are removed with a console warning, and the
   * controls are rebuilt from the new data's measures and filter values.
   * @param {Object[]} data Long-format result records matching the histogram data contract.
   * @returns {SafetyHistogram} The instance, for chaining.
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
   * @param {HistogramSettings} settings Setting overrides to merge.
   * @returns {SafetyHistogram} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping and drop unusable rows.
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    const { rows, removed } = cleanData(this.rawData, this.settings);
    this.cleanData = rows;
    this.removedRecords = removed;
    if (removed) console.warn(`${removed} missing or non-numeric results have been removed.`);
    const measures = this.measures();
    if (this.state.measure && !measures.includes(this.state.measure)) {
      console.warn(
        `The initial measure [${this.state.measure}] does not exist. Defaulting to the first measure.`
      );
    }
    this.state.measure = measures.includes(this.state.measure) ? this.state.measure : measures[0];
  }

  /**
   * Sorted distinct measure labels present in the cleaned data.
   * @private
   */
  measures() {
    return unique(this.cleanData.map((row) => measureLabel(row, this.settings))).sort();
  }

  /**
   * Rebuild the measure/filter/bin/normal-range/group controls from data + state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';

    const { addSection, addRow, addControl } = controlBuilders(this.controls);

    const measure = addControl('Measure', document.createElement('select'));
    this.measures().forEach((value) => option(measure, value, value, value === this.state.measure));
    measure.onchange = () => {
      this.state.measure = measure.value;
      this.resetDomain();
      this.updateNormalRangeControl();
      this.render();
    };

    const filterSpecs = this.settings.filters.filter((filter) => {
      const exists = this.cleanData.some((row) => row[filter.value_col] !== undefined);
      if (!exists)
        console.warn(
          `The [ ${filter.label} ] filter has been removed because the variable does not exist.`
        );
      return exists;
    });
    const filterParent = filterSpecs.length ? addSection('Filters') : this.controls;
    filterSpecs.forEach((filter) => {
      const select = addControl(filter.label, document.createElement('select'), filterParent);
      option(select, '__all__', 'All', !this.state.filters[filter.value_col]);
      unique(this.cleanData.map((row) => row[filter.value_col]))
        .sort()
        .forEach((value) =>
          option(select, value, value, this.state.filters[filter.value_col] === value)
        );
      select.onchange = () => {
        this.state.filters[filter.value_col] = select.value === '__all__' ? null : select.value;
        this.render();
      };
    });

    const xAxisParent = addSection('X-axis Limits');
    const xAxisRow = addRow(xAxisParent);
    const lower = addControl('Lower', document.createElement('input'), xAxisRow);
    lower.type = 'number';
    lower.step = 'any';
    lower.value = this.state.lower == null ? '' : this.state.lower;
    lower.onchange = () => {
      this.state.lower = lower.value === '' ? null : Number(lower.value);
      normalizeDomain(this.state);
      this.render();
    };

    const upper = addControl('Upper', document.createElement('input'), xAxisRow);
    upper.type = 'number';
    upper.step = 'any';
    upper.value = this.state.upper == null ? '' : this.state.upper;
    upper.onchange = () => {
      this.state.upper = upper.value === '' ? null : Number(upper.value);
      normalizeDomain(this.state);
      this.render();
    };

    const binParent = addSection('Bins');
    const algorithm = addControl('Algorithm', document.createElement('select'), binParent);
    ALGORITHMS.forEach((value) => option(algorithm, value, value, value === this.state.algorithm));
    algorithm.onchange = () => {
      this.state.algorithm = algorithm.value;
      this.render();
    };

    const binRow = addRow(binParent);
    const quantity = addControl('Quantity', document.createElement('input'), binRow);
    quantity.type = 'number';
    quantity.min = '1';
    quantity.step = '1';
    quantity.value = this.state.quantity || '';
    quantity.onchange = () => {
      this.state.quantity = Math.max(1, Math.round(Number(quantity.value) || 1));
      this.state.algorithm = 'Custom';
      this.buildControls();
      this.render();
    };
    this.binQuantityInput = quantity;

    // Like the original renderer's Width control: a disabled display of the
    // resolved bin width — every render writes the resolved quantity and
    // width back into these inputs (SH-REG-024/025/026).
    const width = addControl('Width', document.createElement('input'), binRow);
    width.type = 'number';
    width.disabled = true;
    width.value = this.state.width || '';
    this.binWidthInput = width;

    const displayParent = addSection('Display');
    this.normalRangeControl = null;
    if (this.settings.normal_range) {
      const nr = document.createElement('input');
      nr.type = 'checkbox';
      nr.checked = this.state.displayNormalRange;
      nr.onchange = () => {
        this.state.displayNormalRange = nr.checked;
        this.render();
      };
      const inline = createElement('div', 'sv-control-inline');
      inline.append(nr, document.createTextNode('Show'));
      addControl('Normal Range', inline, displayParent);
      this.normalRangeControl = inline.closest('.sv-control');
    }

    const ticks = document.createElement('select');
    option(ticks, 'linear', 'linear', !this.state.annotateBoundaries);
    option(ticks, 'boundaries', 'bin boundaries', this.state.annotateBoundaries);
    ticks.onchange = () => {
      this.state.annotateBoundaries = ticks.value === 'boundaries';
      this.render();
    };
    addControl('X-axis Ticks', ticks, displayParent);

    this.groupControls = addSection('Grouping');
    const group = addControl(
      'Group charts by',
      document.createElement('select'),
      this.groupControls
    );
    this.settings.groups.forEach((spec) =>
      option(group, spec.value_col, spec.label, spec.value_col === this.state.groupBy)
    );
    this.groupControls.style.display = this.settings.groups.length <= 1 ? 'none' : '';
    group.onchange = () => {
      this.state.groupBy = group.value;
      this.render();
    };

    this.updateNormalRangeControl();
  }

  /**
   * Hides the normal-range control for measures without normal data (SH-FUNC-004C).
   * @private
   */
  updateNormalRangeControl() {
    if (!this.normalRangeControl) return;
    const available = measureHasNormalRange(this.currentMeasureData(), this.settings);
    this.normalRangeControl.classList.toggle('sv-hidden', !available);
  }

  /**
   * Clear the x-axis limit overrides when the measure changes.
   * @private
   */
  resetDomain() {
    this.state.lower = null;
    this.state.upper = null;
  }

  /**
   * Cleaned rows for the selected measure.
   * @private
   */
  currentMeasureData() {
    return this.cleanData.filter((row) => measureLabel(row, this.settings) === this.state.measure);
  }

  /**
   * Cleaned rows for the selected measure after the active filters.
   * @private
   */
  currentFilteredData() {
    return applyFilters(this.currentMeasureData(), this.state.filters);
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live charts, clears the listing and any bar selection,
   * then draws the main chart, the grouped small multiples, and the
   * participant-count notes. Called automatically by the controls and the
   * data/settings setters; call it directly only after mutating state by
   * hand.
   * @returns {void}
   */
  render() {
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.footnote.textContent = 'Hover over or click a bar for details.';
    this.mainAnnotation.innerHTML = '';
    this.notes.innerHTML = '';
    this.multiplesWrap.innerHTML = '';
    this.filteredData = this.currentFilteredData();
    if (!this.filteredData.length) {
      this.footnote.textContent = 'No records match the current filters.';
      return;
    }
    this.binInputs = this.computeBinInputs();
    this.drawMainChart();
    this.drawMultiples();
    this.updateNotes();
  }

  /**
   * Compute the shared bin parameters for the current render, following the
   * original renderer's onPreprocess pipeline (#19): the domain and bin
   * count/width anchor to the full result set of the selected measure —
   * not the filtered subset — so filters and group multiples reuse the same
   * bin boundaries and only the bar heights change. When the x-axis limits
   * are user-modified, the parameters recompute from the measure results
   * inside that domain (the original's "custom" domain state).
   * @private
   */
  computeBinInputs() {
    const measureValues = this.currentMeasureData().map((row) => row.__sh_value);
    const domain = resolveDomain(measureValues, this.state.lower, this.state.upper);
    const binValues = measureValues.filter((value) => domain[0] <= value && value <= domain[1]);
    const binResult = calculateBins(
      binValues,
      this.state.algorithm,
      this.state.quantity,
      this.state.width,
      domain
    );
    return {
      domain,
      quantity: binResult.quantity,
      width: binResult.width,
      bins: binResult.bins,
      digits: displayDigits(binResult.width, measureValues)
    };
  }

  /**
   * Refresh the shown/total participant counts and removed-record note.
   * @private
   */
  updateNotes() {
    const totalParticipants = unique(
      this.currentMeasureData().map((row) => row[this.settings.id_col])
    ).length;
    const shownParticipants = unique(
      this.filteredData.map((row) => row[this.settings.id_col])
    ).length;
    const pct = totalParticipants
      ? ((shownParticipants / totalParticipants) * 100).toFixed(1)
      : '0.0';
    const removedNote = this.removedRecords
      ? `<span class="sv-warning">${this.removedRecords} missing or non-numeric results removed.</span>`
      : '';
    this.notes.innerHTML = `<span>${shownParticipants} of ${totalParticipants} participants shown (${pct}%).</span>${removedNote}`;
  }

  /**
   * Assign a set of rows into the shared bins computed by computeBinInputs.
   * Every chart of a render — the main chart and each group multiple — uses
   * the same bin boundaries; only the per-bin record sets differ (#19).
   * @private
   */
  chartInputs(rows) {
    const { domain, digits, quantity, width } = this.binInputs;
    const bins = this.binInputs.bins.map((bin) => ({ ...bin, records: [] }));
    rows.forEach((row) => {
      if (row.__sh_value < domain[0] || row.__sh_value > domain[1]) return;
      bins[binIndex(row.__sh_value, domain[0], width, bins.length)].records.push(row);
    });
    return { bins, domain, digits, quantity, width };
  }

  /**
   * Draw the main Chart.js bar chart with tooltips, selection, and normal range.
   * @private
   */
  drawMainChart() {
    const inputs = this.chartInputs(this.filteredData);
    this.state.quantity = inputs.quantity;
    this.state.width = Number(inputs.width.toPrecision(4));
    if (this.binQuantityInput) this.binQuantityInput.value = this.state.quantity;
    if (this.binWidthInput) this.binWidthInput.value = this.state.width;
    const first = this.filteredData[0];
    this.state.normalRange =
      this.settings.normal_col_low && this.settings.normal_col_high
        ? {
            low: Number(first[this.settings.normal_col_low]),
            high: Number(first[this.settings.normal_col_high])
          }
        : null;

    const labels = buildTickLabels(inputs.bins, inputs.digits, this.state.annotateBoundaries);
    const data = inputs.bins.map((bin) => bin.records.length);
    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '# of Observations',
            data,
            backgroundColor: 'rgba(37, 99, 235, .72)',
            borderColor: 'rgba(37, 99, 235, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) =>
                binDescription(inputs.bins[ctx.dataIndex], this.state.measure, inputs.digits)
            }
          }
        },
        scales: buildScales(),
        onHover: (event, active) => {
          if (active.length) this.describeBin(inputs.bins[active[0].index], inputs.digits, false);
        },
        onClick: (event, active) => {
          if (active.length) {
            const bin = inputs.bins[active[0].index];
            this.showListing(bin.records, bin, inputs.digits);
            this.highlightSelection(chart, active[0].index);
          }
        }
      },
      plugins: [normalRangePlugin(this)]
    });
    chart.$shBins = inputs.bins;
    this.chart = chart;
    this.charts.push(chart);
    this.drawMainAnnotation(this.filteredData);
  }

  /**
   * De-emphasizes the bars outside the linked listing (SH-FUNC-011);
   * render() rebuilds the charts, which clears the selection.
   * @private
   */
  highlightSelection(chart, index) {
    if (!chart || index == null) return;
    const dataset = chart.data.datasets[0];
    if (typeof dataset.backgroundColor === 'string') chart.$shBaseColor = dataset.backgroundColor;
    dataset.backgroundColor = selectionColors(chart.$shBaseColor, chart.data.labels.length, index);
    chart.$shSelectedBin = index;
    chart.update();
  }

  /**
   * Annotate the main chart with the normality screen when enabled.
   * @private
   */
  drawMainAnnotation(rows) {
    this.mainAnnotation.innerHTML = '';
    if (!this.settings.test_normality) return;
    const pValue = approximateNormalityP(rows.map((row) => row.__sh_value));
    this.mainAnnotation.append(
      statisticalAnnotation(
        'Normality',
        pValue,
        'Approximate Jarque-Bera normality screen',
        'https://en.wikipedia.org/wiki/Jarque%E2%80%93Bera_test'
      )
    );
  }

  /**
   * Draw one small-multiple panel per group value when grouping is active.
   * @private
   */
  drawMultiples() {
    this.multiplesWrap.innerHTML = '';
    if (!this.state.groupBy || this.state.groupBy === 'sh_none') return;
    const groups = unique(this.filteredData.map((row) => row[this.state.groupBy])).sort();
    groups.forEach((groupValue) => {
      const rows = this.filteredData.filter(
        (row) => String(row[this.state.groupBy]) === String(groupValue)
      );
      const panel = createElement('div', 'sv-multiple');
      panel.append(createElement('h3', null, `${groupValue} (${rows.length} records)`));
      if (this.settings.compare_distributions) {
        const groupedValues = Object.fromEntries(
          groups.map((value) => [
            value,
            this.filteredData
              .filter((row) => String(row[this.state.groupBy]) === String(value))
              .map((row) => row.__sh_value)
          ])
        );
        panel.append(
          statisticalAnnotation(
            'Group comparison',
            approximateGroupP(groupedValues),
            'Approximate one-way ANOVA screen',
            'https://en.wikipedia.org/wiki/One-way_analysis_of_variance'
          )
        );
      }
      const canvasWrap = createElement('div', 'sv-multiple-canvas');
      const canvas = document.createElement('canvas');
      canvasWrap.append(canvas);
      panel.append(canvasWrap);
      this.multiplesWrap.append(panel);
      const inputs = this.chartInputs(rows);
      const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: buildTickLabels(inputs.bins, inputs.digits, false),
          datasets: [
            {
              data: inputs.bins.map((bin) => bin.records.length),
              backgroundColor: 'rgba(5, 150, 105, .65)'
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
            x: { ticks: { display: false } }
          },
          onClick: (event, active) => {
            if (active.length) {
              const bin = inputs.bins[active[0].index];
              this.showListing(bin.records, bin, inputs.digits);
              this.highlightSelection(chart, active[0].index);
            }
          }
        }
      });
      chart.$shBins = inputs.bins;
      this.charts.push(chart);
    });
  }

  /**
   * Describe a hovered or selected bin in the footnote.
   * @private
   */
  describeBin(bin, digits, clicked) {
    this.footnote.textContent = `${clicked ? 'Selected' : 'Hover'}: ${binDescription(bin, this.state.measure, digits)}.`;
  }

  /**
   * Show the participant listing for a clicked bin's records.
   * @private
   */
  showListing(records, bin, digits) {
    this.currentTableData = records;
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.describeBin(bin, digits, true);
    renderListing(this);
  }

  /**
   * Resize every live chart (the main chart and any small multiples) to its
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
  }

  /**
   * Tear the histogram down: destroy every Chart.js instance and empty the
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
 * Create a safety histogram inside a container element. The control shell
 * renders immediately; pass long-format result records to setData (or init)
 * on the returned instance to validate the data and draw the chart.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {HistogramSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyHistogram} The live histogram instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function histogram(element = 'body', settings = {}) {
  return new SafetyHistogram(element, settings);
}
