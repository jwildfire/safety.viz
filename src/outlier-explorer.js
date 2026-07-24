// Public entrypoint for the outlier-explorer module (#24): participant-level
// results over time for a selected measure, with a population normal-range
// band and click-to-select participant detail. Same lifecycle API as the
// histogram pilot (init, setData, setSettings, render, resize, destroy) and the
// same gsm.viz-style module flow (checkInputs -> configure -> structureData ->
// getScales/getPlugins -> new Chart).
//
// Performance note (#24): one line per participant is drawn as a SINGLE
// Chart.js line dataset with null gaps between participants, plus one bold
// overlay dataset for the selected participant — two datasets regardless of
// participant count, rather than one dataset per participant (which is slow at
// the hundreds of participants a study carries).

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip
} from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { applyLimitEdit, clearAxisLimits, seedLimitInput, syncAxisLimits } from './axis-limits.js';
import { GROUP_NONE, NORMAL_RANGE_METHODS, syncSettings } from './outlier-explorer/configure.js';
import { checkInputs } from './outlier-explorer/checkInputs.js';
import {
  applyFilters,
  assignSequence,
  buildSeries,
  cleanData,
  computeNormalRange,
  countInliers,
  measureLabel,
  orderedCategories,
  timeLabel,
  unique
} from './outlier-explorer/structureData.js';
import {
  axisStep,
  buildXScale,
  buildYScale,
  resolveYDomain,
  normalizeYDomain,
  defaultYDomain
} from './outlier-explorer/getScales.js';
import {
  SELECTION_COLOR,
  groupColorScale,
  hexToRgba,
  normalRangePlugin,
  pointTooltip
} from './outlier-explorer/getPlugins.js';
import { renderListing } from './histogram/listing.js';
import {
  buildProfileRows,
  mountProfileDock,
  resetProfileDock,
  syncProfileDock,
  unmountProfileDock
} from './profile-host.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

/**
 * Interactive safety outlier explorer: a Chart.js line chart of one
 * participant series per subject over a time axis, with measure / filter /
 * x-axis / y-limit / normal-range / group-by controls, a population
 * normal-range band, and a linked participant listing opened by clicking a
 * point. Construct via the outlierExplorer() factory rather than directly; the
 * constructor renders the control shell immediately and waits for data.
 */
class SafetyOutlierExplorer {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Outlier Explorer target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanData = [];
    this.filteredData = [];
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.charts = [];
    this.participantsSelected = [];
    // The docked participant-profile module (#99, PPRF-OE-001): the shared
    // drill-down rendered into the shell's profile slot and fed by the
    // point-click selection through dispatchSelection's participantsSelected
    // event on the shell root. profileRows is the ONE per-setData profile
    // ingest (hep-core cleaned rows); profileKey is the idempotency guard.
    this.profile = null;
    this.profileFeed = null;
    this.profileKey = null;
    this.profileRows = [];
    this.state = {
      measure: this.settings.start_value,
      filters: {},
      timeIndex: 0,
      groupBy: this.settings.group_by,
      // Y-axis limits (#85): `lower`/`upper` hold USER OVERRIDES only (null =
      // auto), `axisDomain` the [lower, upper] the last render resolved — what
      // the inputs display and what the chart drew. See src/axis-limits.js.
      lower: null,
      upper: null,
      axisDomain: null,
      normalMethod: this.settings.normal_range_method,
      normalSd: this.settings.normal_range_sd,
      quantileLow: this.settings.normal_range_quantile_low,
      quantileHigh: this.settings.normal_range_quantile_high,
      normalRange: null,
      selectedId: null
    };
    this.initFilterState();
    this.renderShell();
    mountProfileDock(this, () => this.profileSettings());
  }

  /**
   * The settings handed to the docked participant-profile module (#99,
   * PPRF-OE-001): the shared long-lab column mappings pass through verbatim;
   * `details` come from profile_details (the host `details` configure the
   * linked listing — per-row fields, not demographics); and the two outbound
   * callbacks wire Clear to the host's own clear path (falling back to a bare
   * empty dispatch when the dock was fed by an external cohort the host never
   * selected, so Clear always clears — PPRF-11) and stepper navigation to a
   * transient chart emphasis (no dispatch, selection state untouched).
   * @private
   */
  profileSettings() {
    const settings = this.settings;
    const profileSettings = {
      id_col: settings.id_col,
      measure_col: settings.measure_col,
      value_col: settings.value_col,
      unit_col: settings.unit_col,
      normal_col_high: settings.normal_col_high,
      normal_col_low: settings.normal_col_low,
      studyday_col: settings.studyday_col,
      visit_col: settings.visit_col,
      visitn_col: settings.visitn_col,
      details:
        settings.profile_details && settings.profile_details.length ? settings.profile_details : [],
      participantProfileURL: settings.participantProfileURL ?? null,
      on_clear: () => {
        if (this.state.selectedId != null) {
          this.clearSelection();
        } else {
          // Externally-fed cohort (e.g. a root-level dispatch the host did not
          // originate): nothing host-side to clear, but the dock still must —
          // reset any transient stepper emphasis and dispatch the empty
          // selection (PPRF-11 clear contract).
          this.emphasizeParticipant(null);
          this.dispatchSelection([]);
        }
      },
      on_step: (id) => this.emphasizeParticipant(id)
    };
    // Only forward a caller-supplied key-measure map — null keeps the profile
    // module's own ALT/AST/TB/ALP defaults.
    if (settings.measure_values) profileSettings.measure_values = settings.measure_values;
    return profileSettings;
  }

  /**
   * Initialize the active filter values from any filter `start` settings
   * (SOE-REG-051/053).
   * @private
   */
  initFilterState() {
    this.state.filters = {};
    this.settings.filters.forEach((filter) => {
      if (filter.start !== undefined && filter.start !== null && filter.start !== '') {
        this.state.filters[filter.value_col] = String(filter.start);
      }
    });
  }

  /**
   * Build the static DOM shell the chart, legend, and listing render into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-outlier-explorer',
        onToggle: () => this.resize()
      })
    );
    this.legendEl = createElement('div', 'oe-legend');
    this.legendEl.style.cssText =
      'display:flex;flex-wrap:wrap;gap:.35rem .9rem;font-size:.8rem;color:#52616f;margin:0 0 .5rem';
    this.main.insertBefore(this.legendEl, this.chartWrap);
    this.footnote.textContent =
      'Hover a point for details; click a point to highlight a participant.';
  }

  /**
   * Load data and render: an alias for setData that keeps the pilot's
   * two-step create-then-init call shape working (SOE-API-001).
   * @param {Object[]} data Long-format result records matching the outlier-explorer data contract.
   * @returns {SafetyOutlierExplorer} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing), rows with missing or
   * non-numeric results are removed with a console warning, and the controls
   * are rebuilt from the new data's measures and filter values.
   * @param {Object[]} data Long-format result records matching the outlier-explorer data contract.
   * @returns {SafetyOutlierExplorer} The instance, for chaining.
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
   * (#99, PPRF-OE-001) — never per gesture.
   * @private
   */
  buildProfileRows() {
    this.profileRows = this.settings.profile
      ? buildProfileRows(this.rawData, this.profileSettings())
      : [];
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize them (same
   * rules as the factory), rebuild the controls, and re-render.
   * @param {OutlierExplorerSettings} settings Setting overrides to merge.
   * @returns {SafetyOutlierExplorer} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.state.normalMethod = this.settings.normal_range_method;
    this.state.groupBy = this.settings.group_by;
    this.initFilterState();
    if (this.rawData.length) this.validateAndCleanData();
    this.buildProfileRows();
    syncProfileDock(this, () => this.profileSettings());
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
   * The active time-axis column spec.
   * @private
   */
  activeTimeCol() {
    return this.settings.time_cols[this.state.timeIndex] || this.settings.time_cols[0];
  }

  /**
   * Cleaned rows for the selected measure, tagged with the derived measurement
   * sequence.
   * @private
   */
  currentMeasureData() {
    const rows = this.cleanData.filter(
      (row) => measureLabel(row, this.settings) === this.state.measure
    );
    return assignSequence(rows, this.settings.id_col);
  }

  /**
   * Cleaned rows for the selected measure after the active filters.
   * @private
   */
  currentFilteredData() {
    return applyFilters(this.currentMeasureData(), this.state.filters);
  }

  /**
   * Rebuild the measure / filter / x-axis / y-limit / normal-range / group
   * controls from data + state.
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
      const hasStart = filter.start !== undefined && filter.start !== null && filter.start !== '';
      // A filter with a start value offers no "All" option (SOE-REG-052).
      if (!hasStart) option(select, '__all__', 'All', !this.state.filters[filter.value_col]);
      unique(this.cleanData.map((row) => row[filter.value_col]))
        .sort()
        .forEach((value) =>
          option(
            select,
            value,
            value,
            String(this.state.filters[filter.value_col]) === String(value)
          )
        );
      select.onchange = () => {
        this.state.filters[filter.value_col] = select.value === '__all__' ? null : select.value;
        this.render();
      };
    });

    if (this.settings.time_cols.length > 1) {
      const xParent = addSection('X-axis');
      const xAxis = addControl('Plot by', document.createElement('select'), xParent);
      this.settings.time_cols.forEach((spec, index) =>
        option(xAxis, String(index), spec.label, index === this.state.timeIndex)
      );
      xAxis.onchange = () => {
        this.state.timeIndex = Number(xAxis.value);
        this.render();
      };
    }

    const yParent = addSection('Y-axis Limits');
    const yRow = addRow(yParent);
    const step = this.currentStep();
    const lower = addControl('Lower', document.createElement('input'), yRow);
    lower.type = 'number';
    lower.step = String(step);
    lower.value = seedLimitInput(this.state, 'lower');
    lower.onchange = () => {
      applyLimitEdit(this.state, 'lower', lower.value);
      normalizeYDomain(this.state);
      this.render();
    };
    this.lowerInput = lower;
    const upper = addControl('Upper', document.createElement('input'), yRow);
    upper.type = 'number';
    upper.step = String(step);
    upper.value = seedLimitInput(this.state, 'upper');
    upper.onchange = () => {
      applyLimitEdit(this.state, 'upper', upper.value);
      normalizeYDomain(this.state);
      this.render();
    };
    this.upperInput = upper;
    const reset = addControl(' ', document.createElement('button'), yParent);
    reset.type = 'button';
    reset.textContent = 'Reset Limits';
    reset.className = 'oe-reset';
    reset.style.cssText =
      'width:100%;padding:.35rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.82rem;cursor:pointer';
    reset.onclick = () => {
      this.resetDomain();
      this.buildControls();
      this.render();
    };

    const nrParent = addSection('Normal Range');
    const method = addControl('Method', document.createElement('select'), nrParent);
    NORMAL_RANGE_METHODS.forEach((value) =>
      option(method, value, value, value === this.state.normalMethod)
    );
    method.onchange = () => {
      this.state.normalMethod = method.value;
      this.buildControls();
      this.render();
    };
    if (this.state.normalMethod === 'Standard Deviation') {
      const sd = addControl('# Std. Dev.', document.createElement('input'), nrParent);
      sd.type = 'number';
      sd.step = 'any';
      sd.min = '0';
      sd.value = this.state.normalSd;
      sd.onchange = () => {
        this.state.normalSd = Number(sd.value) || 0;
        this.render();
      };
    } else if (this.state.normalMethod === 'Quantiles') {
      const qRow = addRow(nrParent);
      const low = addControl('Lower', document.createElement('input'), qRow);
      low.type = 'number';
      low.step = 'any';
      low.value = this.state.quantileLow;
      low.onchange = () => {
        this.state.quantileLow = Number(low.value) || 0;
        this.render();
      };
      const high = addControl('Upper', document.createElement('input'), qRow);
      high.type = 'number';
      high.step = 'any';
      high.value = this.state.quantileHigh;
      high.onchange = () => {
        this.state.quantileHigh = Number(high.value) || 0;
        this.render();
      };
    }

    this.groupControls = addSection('Grouping');
    const group = addControl('Group by', document.createElement('select'), this.groupControls);
    this.settings.groups.forEach((spec) =>
      option(group, spec.value_col, spec.label, spec.value_col === this.state.groupBy)
    );
    this.groupControls.style.display = this.settings.groups.length <= 1 ? 'none' : '';
    group.onchange = () => {
      this.state.groupBy = group.value;
      this.render();
    };
  }

  /**
   * The current y-axis stepper increment, ~1/15 of the default measure range
   * (SOE-REG-033).
   * @private
   */
  currentStep() {
    if (!this.cleanData.length || !this.state.measure) return 1;
    const values = this.currentMeasureData().map((row) => row.__oe_value);
    if (!values.length) return 1;
    const domain = defaultYDomain(values);
    return axisStep(domain[1] - domain[0]);
  }

  /**
   * Clear the y-axis limit overrides when the measure changes (limits are
   * per-measure) or on Reset Limits. The recorded domain goes with them so the
   * next render re-derives it and repopulates both inputs (#85, AXIS-3).
   * @private
   */
  resetDomain() {
    clearAxisLimits(this.state);
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live chart, clears the listing and any selection, then draws
   * the population lines, the normal-range band, the legend, and the counts.
   * Called automatically by the controls and the data/settings setters.
   * @returns {void}
   */
  render() {
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.legendEl.innerHTML = '';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.state.selectedId = null;
    this.participantsSelected = [];
    // The selection resets silently on every render, so the dock must empty in
    // the same preamble (#99, PPRF-OE-003).
    resetProfileDock(this);
    this.notes.innerHTML = '';
    this.footnote.textContent =
      'Hover a point for details; click a point to highlight a participant.';
    this.filteredData = this.currentFilteredData();
    if (!this.filteredData.length) {
      // Keep the participant-count and removed-record notes: when cleanData
      // dropped every row, the removed note is what explains the empty chart.
      this.updateNotes();
      this.notes.innerHTML =
        '<span>No records match the current filters.</span>' + this.notes.innerHTML;
      return;
    }
    this.drawChart();
    this.drawLegend();
    this.updateNotes();
  }

  /**
   * Draw the main Chart.js line chart: one population line dataset (null-gap
   * separated per participant) plus an empty selection-overlay dataset, with
   * the normal-range band plugin, tooltips, and click-to-select.
   * @private
   */
  drawChart() {
    const timeCol = this.activeTimeCol();
    this.filteredData.forEach((row) => {
      row.__oe_timeLabel = timeLabel(row, timeCol);
    });
    // The normal-range controls drive live state, so build the effective
    // config from state (not the initial settings) before computing the band.
    this.state.normalRange = computeNormalRange(this.filteredData, {
      ...this.settings,
      normal_range_method: this.state.normalMethod,
      normal_range_sd: this.state.normalSd,
      normal_range_quantile_low: this.state.quantileLow,
      normal_range_quantile_high: this.state.quantileHigh
    });

    const values = this.filteredData.map((row) => row.__oe_value);
    const domain = resolveYDomain(values, this.state.lower, this.state.upper);
    // The Y-axis Limits inputs mirror the domain this render resolved (#85,
    // AXIS-1) — the padded default (SOE-REG-034) unless a limit was edited.
    syncAxisLimits(this.state, domain, { lower: this.lowerInput, upper: this.upperInput });
    const categories =
      timeCol.type === 'ordinal' ? orderedCategories(this.currentMeasureData(), timeCol) : [];
    this.series = buildSeries(this.filteredData, this.settings, timeCol, this.state.groupBy);

    const grouped = this.state.groupBy && this.state.groupBy !== GROUP_NONE;
    this.groupValues = grouped
      ? unique(this.filteredData.map((row) => row[this.state.groupBy])).sort()
      : [];
    this.colorScale = groupColorScale(this.groupValues);

    const lineAttr = this.settings.line_attributes;
    const pointAttr = this.settings.point_attributes;
    const data = [];
    const pointMeta = [];
    this.series.forEach((series) => {
      series.points.forEach((point) => {
        data.push({ x: point.x, y: point.y });
        pointMeta.push({ id: series.id, group: series.group, point });
      });
      const last = series.points[series.points.length - 1];
      data.push({ x: last ? last.x : null, y: null });
      pointMeta.push(null);
    });
    this.pointMeta = pointMeta;
    this.overlayMeta = [];

    const isSelected = (meta) =>
      this.state.selectedId != null && String(meta.id) === String(this.state.selectedId);
    const baseColor = (meta) =>
      grouped ? this.colorScale.get(String(meta.group)) || pointAttr.color : null;

    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: categories.length ? categories : undefined,
        datasets: [
          {
            label: 'Participants',
            data,
            spanGaps: false,
            showLine: true,
            borderWidth: lineAttr.width,
            pointRadius: (ctx) => (this.pointMeta[ctx.dataIndex] ? pointAttr.radius : 0),
            pointHoverRadius: (ctx) => (this.pointMeta[ctx.dataIndex] ? pointAttr.radius + 2 : 0),
            pointBackgroundColor: (ctx) => {
              const meta = this.pointMeta[ctx.dataIndex];
              if (!meta || isSelected(meta)) return 'rgba(0,0,0,0)';
              const color = baseColor(meta) || pointAttr.color;
              const opacity =
                this.state.selectedId != null ? pointAttr.opacity * 0.3 : pointAttr.opacity;
              return hexToRgba(color, opacity);
            },
            pointBorderColor: (ctx) => {
              const meta = this.pointMeta[ctx.dataIndex];
              if (!meta || isSelected(meta)) return 'rgba(0,0,0,0)';
              const color = baseColor(meta) || pointAttr.color;
              const opacity = this.state.selectedId != null ? 0.25 : 0.85;
              return hexToRgba(color, opacity);
            },
            segment: {
              borderColor: (ctx) => {
                const meta = this.pointMeta[ctx.p0DataIndex];
                const metaEnd = this.pointMeta[ctx.p1DataIndex];
                if (!meta || !metaEnd || String(meta.id) !== String(metaEnd.id))
                  return 'rgba(0,0,0,0)';
                if (isSelected(meta)) return 'rgba(0,0,0,0)';
                const color = baseColor(meta) || lineAttr.color;
                const opacity =
                  this.state.selectedId != null ? lineAttr.opacity * 0.4 : lineAttr.opacity;
                return hexToRgba(color, opacity);
              }
            }
          },
          {
            label: 'Selected',
            data: [],
            spanGaps: false,
            showLine: true,
            borderColor: SELECTION_COLOR,
            borderWidth: lineAttr.width + 1.5,
            pointRadius: pointAttr.radius + 1.5,
            pointHoverRadius: pointAttr.radius + 3,
            pointBackgroundColor: SELECTION_COLOR,
            pointBorderColor: SELECTION_COLOR
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        parsing: true,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => {
                const meta =
                  ctx.datasetIndex === 0
                    ? this.pointMeta[ctx.dataIndex]
                    : this.overlayMeta[ctx.dataIndex];
                return meta ? pointTooltip(meta.point, this.settings, this.state.measure) : '';
              }
            }
          }
        },
        scales: {
          x: buildXScale(timeCol, categories),
          y: buildYScale(domain, this.state.measure)
        },
        onClick: (event, elements) => {
          if (!elements.length) {
            this.clearSelection();
            return;
          }
          const el = elements[0];
          const meta =
            el.datasetIndex === 0 ? this.pointMeta[el.index] : this.overlayMeta[el.index];
          if (meta) this.selectParticipant(meta.id);
        }
      },
      plugins: [normalRangePlugin(this)]
    });
    this.chart = chart;
    this.charts.push(chart);
  }

  /**
   * Render the color-by legend for the active grouping (SOE-REG-049).
   * @private
   */
  drawLegend() {
    this.legendEl.innerHTML = '';
    if (!this.groupValues || !this.groupValues.length) return;
    const groupLabel =
      (this.settings.groups.find((spec) => spec.value_col === this.state.groupBy) || {}).label ||
      this.state.groupBy;
    this.legendEl.append(createElement('strong', null, `${groupLabel}:`));
    this.groupValues.forEach((value) => {
      const chip = createElement('span', 'oe-legend-item');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:.3rem';
      const swatch = createElement('span');
      swatch.style.cssText = `display:inline-block;width:.75rem;height:.75rem;border-radius:2px;background:${this.colorScale.get(
        String(value)
      )}`;
      chip.append(swatch, document.createTextNode(String(value)));
      this.legendEl.append(chip);
    });
  }

  /**
   * Highlight one participant: draw the bold selection overlay, open the
   * linked listing, and dispatch the participantsSelected event (SOE-FUNC-010,
   * SOE-REG-013/014/016, SOE-API-003).
   * @param {string} id Participant identifier.
   * @returns {void}
   */
  selectParticipant(id) {
    this.state.selectedId = id;
    this.applySelection();
    const records = this.filteredData.filter(
      (row) => String(row[this.settings.id_col]) === String(id)
    );
    this.currentTableData = records;
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.footnote.textContent = `Selected participant ${id}: ${records.length} record${
      records.length === 1 ? '' : 's'
    }.`;
    renderListing(this);
    this.dispatchSelection([id]);
  }

  /**
   * Clear any participant selection and the linked listing (SOE-FUNC-010
   * click-outside behavior).
   * @returns {void}
   */
  clearSelection() {
    if (this.state.selectedId == null) return;
    this.state.selectedId = null;
    this.applySelection();
    this.currentTableData = [];
    this.listingWrap.innerHTML = '';
    this.footnote.textContent =
      'Hover a point for details; click a point to highlight a participant.';
    this.dispatchSelection([]);
  }

  /**
   * Update the selection overlay dataset and re-emphasize the base marks.
   * @private
   */
  applySelection() {
    this.emphasizeParticipant(this.state.selectedId);
  }

  /**
   * Draw (or clear, for a null id) the bold overlay for one participant
   * WITHOUT touching the host selection state — the transient emphasis the
   * profile stepper drives (PPRF-11): the host selection still belongs to the
   * click gesture, so footnote/listing keep narrating it while the overlay
   * tracks the stepped participant.
   * @param {string|null} id Participant identifier, or null to clear the overlay.
   * @private
   */
  emphasizeParticipant(id) {
    if (!this.chart) return;
    const overlay = this.chart.data.datasets[1];
    if (id == null) {
      overlay.data = [];
      this.overlayMeta = [];
    } else {
      const series = this.series.find((candidate) => String(candidate.id) === String(id));
      overlay.data = series ? series.points.map((point) => ({ x: point.x, y: point.y })) : [];
      this.overlayMeta = series
        ? series.points.map((point) => ({ id: series.id, group: series.group, point }))
        : [];
    }
    this.chart.update();
  }

  /**
   * Dispatch the custom participantsSelected event on the shell root with the
   * selected IDs (SOE-API-003).
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
   * Refresh the shown/total participant counts, inlier count, and
   * removed-record note (SOE-FUNC-003, SOE-REG-001/037).
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
    const inliers = countInliers(this.filteredData, this.state.normalRange);
    const inlierNote =
      inliers == null
        ? ''
        : `<span>Inliers: ${inliers} of ${this.filteredData.length} observations.</span>`;
    const removedNote = this.removedRecords
      ? `<span class="sv-warning">${this.removedRecords} missing or non-numeric results removed.</span>`
      : '';
    this.notes.innerHTML =
      `<span>${shownParticipants} of ${totalParticipants} participants shown (${pct}%).</span>` +
      inlierNote +
      removedNote;
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
   * Tear the outlier explorer down: destroy the Chart.js instance and empty
   * the target element. The instance cannot be reused afterwards — create a
   * new one via the factory instead.
   * @returns {void}
   */
  destroy() {
    unmountProfileDock(this);
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a safety outlier explorer inside a container element. The control
 * shell renders immediately; pass long-format result records to setData (or
 * init) on the returned instance to validate the data and draw the chart.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {OutlierExplorerSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyOutlierExplorer} The live outlier-explorer instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function outlierExplorer(element = 'body', settings = {}) {
  return new SafetyOutlierExplorer(element, settings);
}
