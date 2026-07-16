// Public entrypoint for the ae-explorer module (#60): a dependency-free
// DOM/SVG reimplementation of RhoInc/aeexplorer (v3.4.1) matching the
// original renderer's behavior, with the lifecycle API shared by every
// safety.viz module (init, setData, setSettings, render, resize, destroy).
// This is the library's first table-first renderer: the summary is a
// hierarchical System Organ Class → Preferred Term incidence table with
// inline SVG rate and difference plots per row, so the shared shell's
// canvas stays unused and hidden. Internals follow the module flow
// (checkInputs → configure → structureData → getScales/getPlugins → DOM);
// the details drill-down reuses the histogram listing.

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { SUMMARIZE_OPTIONS, columnPlan, syncSettings } from './ae-explorer/configure.js';
import { checkInputs } from './ae-explorer/checkInputs.js';
import {
  addDifferences,
  crossTab,
  eventData,
  flagPlaceholders,
  groupCounts,
  groupLevels,
  populationData,
  prevalenceVisible,
  searchCategories
} from './ae-explorer/structureData.js';
import { formatPercent, makeDiffScale, makePercentScale } from './ae-explorer/getScales.js';
import {
  cellTitle,
  colorScale,
  csvName,
  diffTitle,
  dotTitle,
  summaryCsv
} from './ae-explorer/getPlugins.js';
import { renderListing } from './histogram/listing.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NO_MATCH_MESSAGE =
  'Error: No AEs found for the current filters. Update the filters to see results.';
const SUMMARY_FOOTNOTE =
  'Click a category to view the underlying records. Hover a rate for counts.';
const FILTER_TYPE_NOTES = {
  event: 'Event filter: narrows the events counted without changing the group denominators.',
  participant: 'Participant filter: narrows the analysis population and its denominators.'
};

const MODULE_STYLE_ID = 'safety-viz-ae-explorer-styles';
const MODULE_STYLES = `
.safety-ae-explorer .ae-table-wrap{border:1px solid #d8dee4;border-radius:10px;background:#fff;padding:.5rem .75rem;overflow-x:auto}
.safety-ae-explorer .ae-table{width:100%;border-collapse:collapse;font-size:.85rem}
.safety-ae-explorer .ae-table th{border-bottom:2px solid #d8dee4;padding:.4rem .5rem;text-align:left;font-size:.75rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f;white-space:normal;vertical-align:bottom}
.safety-ae-explorer .ae-table th.ae-value{text-align:right}
.safety-ae-explorer .ae-table th .ae-grp-n{display:block;font-weight:400;opacity:.85}
.safety-ae-explorer .ae-groups-super{text-align:center;font-weight:600;color:#52616f;padding-bottom:.2rem;border-bottom:1px solid #e3e8ee}
.safety-ae-explorer .ae-plot-head{text-align:center;vertical-align:bottom}
.safety-ae-explorer svg.ae-axis{display:block;margin:.3rem auto 0}
.safety-ae-explorer .ae-table td{border-bottom:1px solid #e3e8ee;padding:.3rem .5rem;vertical-align:middle}
.safety-ae-explorer .ae-table td.ae-value{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.safety-ae-explorer .ae-table tbody tr:hover{background:#f0f3f6}
.safety-ae-explorer tr.ae-major td{font-weight:600}
.safety-ae-explorer tr.ae-minor td{font-weight:400;color:#3d4852}
.safety-ae-explorer tr.ae-minor td.ae-category{padding-left:2.1em}
.safety-ae-explorer tbody.ae-collapsed tr.ae-minor{display:none}
.safety-ae-explorer tr.ae-hidden{display:none!important}
.safety-ae-explorer tbody.ae-search-miss{display:none}
.safety-ae-explorer .ae-toggle{display:inline-block;width:1.2em;cursor:pointer;color:#0b62a4;font-weight:700;user-select:none}
.safety-ae-explorer .ae-label{cursor:pointer}
.safety-ae-explorer .ae-label:hover{text-decoration:underline;color:#0b62a4}
.safety-ae-explorer .ae-search-match{font-weight:700;color:#b34700}
.safety-ae-explorer .ae-table tfoot td{border-top:2px solid #d8dee4;font-weight:600}
.safety-ae-explorer .ae-plot line.ae-ci-hidden{visibility:hidden}
.safety-ae-explorer tr.ae-show-ci .ae-plot line.ae-ci-hidden{visibility:visible}
.safety-ae-explorer .ae-cell-count{color:#52616f;font-weight:400;visibility:hidden;margin-left:.25em}
.safety-ae-explorer tr.ae-show-ci .ae-cell-count{visibility:visible}
.safety-ae-explorer .ae-search-note{font-size:.8rem;color:#52616f;margin-top:.25rem}
.safety-ae-explorer sup.ae-filter-type{cursor:help;color:#0b62a4;margin-left:.25em}
.safety-ae-explorer .ae-error{color:#9a3412;padding:1rem 0}
.safety-ae-explorer .ae-detail-note{font-size:.85rem;color:#52616f;margin:.35rem 0 .6rem}
`;

/**
 * Interactive hierarchical adverse-event incidence table: one expandable
 * section per System Organ Class with nested Preferred Term rows, per-group
 * participant or event rates with an all-groups Total, an inline rate dot
 * plot on a shared percent axis, a Difference Between Groups plot with 95%
 * confidence intervals, prevalence/search/characteristic filter controls,
 * and a click-through details listing. Construct via the aeExplorer()
 * factory rather than directly; the constructor renders the control shell
 * immediately and waits for data.
 */
class AEExplorer {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`AE Explorer target not found: ${element}`);
    this.settings = syncSettings(settings);
    // The construction-time mappings stay offered by the re-mapping
    // controls even after the user re-maps a variable (AE-REG-044).
    this.initialMappings = {
      id: this.settings.id_col,
      major: this.settings.major_col,
      minor: this.settings.minor_col,
      group: this.settings.group_col
    };
    this.rawData = [];
    this.cleanRows = [];
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.charts = [];
    this.detail = null;
    this.state = {
      summarizeBy: this.settings.summarize_by,
      maxPrevalence: this.settings.max_prevalence,
      searchTerm: '',
      filters: {},
      expanded: new Set()
    };
    this.renderShellChrome();
  }

  /**
   * Build the static DOM the table renders into: the shared shell (with the
   * unused main-chart canvas hidden — this renderer is a table), the table
   * card, and the hidden details view.
   * @private
   */
  renderShellChrome() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-ae-explorer',
        onToggle: () => this.resize()
      })
    );
    this.applyModuleStyles();
    // The shell's chart card hosts Chart.js canvases; this module draws a
    // table instead, in its own card in the same slot position.
    this.chartWrap.classList.add('sv-hidden');
    this.tableWrap = createElement('div', 'ae-table-wrap');
    this.main.insertBefore(this.tableWrap, this.footnote);

    this.detailWrap = createElement('div', 'sv-detail sv-hidden');
    const header = createElement('div', 'sv-listing-actions');
    this.backButton = createElement('button', null, 'Return to the Summary View');
    this.backButton.type = 'button';
    this.backButton.onclick = () => this.backToSummary();
    this.detailTitle = createElement('strong');
    header.append(this.backButton, this.detailTitle);
    this.detailNote = createElement('div', 'ae-detail-note');
    this.detailWrap.append(header, this.detailNote);
    this.main.insertBefore(this.detailWrap, this.footnote);

    this.footnote.textContent = SUMMARY_FOOTNOTE;
  }

  /**
   * Inject the module-scoped stylesheet once per document.
   * @private
   */
  applyModuleStyles() {
    if (typeof document === 'undefined' || document.getElementById(MODULE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MODULE_STYLE_ID;
    style.textContent = MODULE_STYLES;
    document.head.append(style);
  }

  /**
   * Load data and render: an alias for setData that keeps the original
   * renderer's create-then-init call shape working (AE-DATA-003,
   * AE-API-001).
   * @param {Object[]} data Adverse-event records matching the ae-explorer data contract.
   * @returns {AEExplorer} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing); placeholder rows for
   * participants with no adverse events are flagged so they count toward
   * the population denominators (AE-DATA-001); and the filter controls are
   * rebuilt from the new data's values.
   * @param {Object[]} data Adverse-event records matching the ae-explorer data contract.
   * @returns {AEExplorer} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.seedFilterState();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize them
   * (same rules as the factory), re-seed the control state, rebuild the
   * controls, and re-render.
   * @param {AEExplorerSettings} settings Setting overrides to merge.
   * @returns {AEExplorer} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.state.summarizeBy = this.settings.summarize_by;
    this.state.maxPrevalence = this.settings.max_prevalence;
    this.validateAndCleanData();
    this.seedFilterState();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping, flag placeholder
   * rows, and resolve the details-listing columns (every input column when
   * the details setting is null).
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    this.cleanRows = flagPlaceholders(this.rawData, this.settings);
    if (!this.settings.details) {
      const columns = this.rawData.length ? Object.keys(this.rawData[0]) : [];
      this.settings.details = columns.map((column) => ({ value_col: column, label: column }));
    }
    this.state.expanded = new Set();
  }

  /**
   * Reset the active filter values from the filter specs' start values
   * (AE-REG-031).
   * @private
   */
  seedFilterState() {
    this.state.filters = {};
    this.settings.filters.forEach((spec) => {
      const start = Array.isArray(spec.start) ? spec.start[0] : spec.start;
      if (start != null) this.state.filters[spec.value_col] = String(start);
    });
    this.state.searchTerm = '';
  }

  /**
   * Rebuild the sidebar controls from the settings, data, and control
   * state: the summary-basis toggle, the prevalence and search filters, the
   * characteristic filters with their participant/event badges, any
   * variable re-mapping controls, and the validation download.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);

    const summarySection = addSection('Summary');
    const summarize = addControl('Summarize by', document.createElement('select'), summarySection);
    SUMMARIZE_OPTIONS.forEach((value) =>
      option(summarize, value, value, value === this.state.summarizeBy)
    );
    summarize.onchange = () => {
      this.state.summarizeBy = summarize.value;
      this.render();
    };

    const filterSection = addSection('Filters');
    const prevalence = document.createElement('input');
    prevalence.type = 'number';
    prevalence.min = '0';
    prevalence.step = '1';
    prevalence.value = String(this.state.maxPrevalence);
    prevalence.className = 'ae-prevalence';
    addControl('Minimum prevalence (%)', prevalence, filterSection);
    prevalence.oninput = () => {
      this.state.maxPrevalence = Number(prevalence.value) || 0;
      this.render();
    };

    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search categories';
    search.value = this.state.searchTerm;
    search.className = 'ae-search';
    addControl('Search', search, filterSection);
    search.oninput = () => {
      this.state.searchTerm = search.value;
      this.render();
    };
    this.searchNote = createElement('div', 'ae-search-note');
    filterSection.append(this.searchNote);

    const eventRows = this.cleanRows.filter((row) => !row.__ae_placeholder);
    this.activeFilterSpecs = this.settings.filters.filter((spec) => {
      const source = spec.type === 'participant' ? this.cleanRows : eventRows;
      const values = [
        ...new Set(source.map((row) => row[spec.value_col]).filter((value) => value != null))
      ];
      if (!values.length) {
        console.warn(
          `The [ ${spec.value_col} ] filter was removed because the variable does not exist.`
        );
        return false;
      }
      if (values.length < 2) {
        console.warn(
          `The [ ${spec.value_col} ] filter was removed because the variable has only one level.`
        );
        return false;
      }
      return true;
    });
    this.activeFilterSpecs.forEach((spec) => {
      const select = document.createElement('select');
      select.dataset.filter = spec.value_col;
      const active = this.state.filters[spec.value_col];
      option(select, '__all__', 'All', active == null);
      const source = spec.type === 'participant' ? this.cleanRows : eventRows;
      const values = [
        ...new Set(source.map((row) => String(row[spec.value_col] ?? '')).filter(Boolean))
      ].sort();
      values.forEach((value) => option(select, value, value, active === value));
      const wrap = addControl(spec.label, select, filterSection);
      const label = wrap.parentElement.querySelector('label');
      const sup = createElement('sup', 'ae-filter-type', spec.type === 'participant' ? 'P' : 'E');
      sup.title = FILTER_TYPE_NOTES[spec.type];
      label.append(sup);
      select.onchange = () => {
        this.state.filters[spec.value_col] = select.value === '__all__' ? null : select.value;
        this.render();
      };
    });

    this.buildVariableControls(addSection);

    if (this.settings.validation) {
      const dataSection = addSection('Data');
      const download = createElement('button', 'ae-download', 'Download summarized data');
      download.type = 'button';
      download.onclick = () => this.downloadSummary();
      dataSection.append(download);
    }
  }

  /**
   * Re-mapping controls for the primary variables (AE-CFG-004): one select
   * per mapping with two or more configured options, always offering the
   * current column even when it is not listed (AE-REG-044); changing one
   * re-syncs the settings and redraws (AE-REG-041..043).
   * @private
   */
  buildVariableControls(addSection) {
    const optionsByMapping = this.settings.variable_options;
    if (!optionsByMapping) return;
    const mappings = [
      ['id', 'id_col', 'Participant ID'],
      ['major', 'major_col', 'Major category'],
      ['minor', 'minor_col', 'Minor category'],
      ['group', 'group_col', 'Group']
    ];
    let section = null;
    const { addControl } = controlBuilders(this.controls);
    mappings.forEach(([key, settingKey, label]) => {
      const current = this.settings[settingKey];
      const offered = [
        ...new Set([this.initialMappings[key], ...(optionsByMapping[key] || []), current])
      ];
      if (offered.length < 2) return;
      if (!section) section = addSection('Variables');
      const select = document.createElement('select');
      select.dataset.variable = key;
      offered.forEach((column) => option(select, column, column, column === current));
      addControl(label, select, section);
      select.onchange = () => this.setSettings({ [settingKey]: select.value });
    });
  }

  /**
   * The population and event datasets, group keys, and denominators for the
   * current filter state.
   * @private
   */
  computeData() {
    const groups = groupLevels(this.cleanRows, this.settings);
    const specs = this.activeFilterSpecs || this.settings.filters;
    const population = populationData(
      this.cleanRows,
      this.settings,
      groups,
      specs,
      this.state.filters
    );
    const events = eventData(population, specs, this.state.filters);
    const counts = groupCounts(population, events, this.settings, groups);
    return { groups, population, events, counts };
  }

  /**
   * Redraw the summary table from the current data, settings, and control
   * state: closes any open details view, recomputes the roll-up, and
   * rebuilds the table with the prevalence and search visibility applied.
   * Called automatically by the controls and the data/settings setters;
   * call it directly only after mutating state by hand.
   * @returns {void}
   */
  render() {
    this.closeDetail();
    const { groups, events, counts } = this.computeData();
    this.groups = groups;
    this.counts = counts;
    this.plan = columnPlan(groups.length, this.settings);
    this.table = crossTab(events, this.settings, groups, counts, this.state.summarizeBy);
    this.currentEvents = events;
    this.tableWrap.innerHTML = '';
    if (!events.length) {
      this.tableWrap.append(createElement('div', 'ae-error', NO_MATCH_MESSAGE));
      this.updateSearchNote(null);
      return;
    }
    const search = searchCategories(this.table.majors, this.state.searchTerm);
    this.updateSearchNote(this.state.searchTerm ? search : null);
    this.tableWrap.append(this.buildTable(search));
  }

  /**
   * Refresh the matched-category count beside the search control
   * (AE-REG-004).
   * @private
   */
  updateSearchNote(search) {
    if (!this.searchNote) return;
    if (!search) {
      this.searchNote.textContent = '';
      return;
    }
    this.searchNote.textContent = search.count
      ? `${search.count} categor${search.count === 1 ? 'y' : 'ies'} found.`
      : 'No categories found with a matching search term.';
  }

  /**
   * Build the full summary table element for the current roll-up and search
   * state.
   * @private
   */
  buildTable(search) {
    const { plan, groups } = this;
    const color = colorScale(groups, this.settings.colors);
    const shownMaxPer = Math.max(
      this.table.overall.maxPer,
      ...this.table.majors.map((major) => major.maxPer)
    );
    const percentScale = makePercentScale(shownMaxPer, this.settings.plot_settings);
    const allDiffs = [];
    const rowsOf = (item) => addDifferences(item.cells, groups);
    if (plan.diffCol) {
      [this.table.overall, ...this.table.majors].forEach((major) => {
        allDiffs.push(...rowsOf(major));
        (major.minors || []).forEach((minor) => allDiffs.push(...rowsOf(minor)));
      });
    }
    const diffExtent = allDiffs.length
      ? [
          Math.min(...allDiffs.map((diff) => diff.lower)),
          Math.max(...allDiffs.map((diff) => diff.upper))
        ]
      : [0, 0];
    const diffScale = makeDiffScale(diffExtent, this.settings.plot_settings);

    const table = createElement('table', 'ae-table');
    table.append(this.buildHead(percentScale, diffScale));

    const searchActive = Boolean(this.state.searchTerm);
    const hasMatches = searchActive && search.count > 0;
    this.table.majors.forEach((major) => {
      const tbody = document.createElement('tbody');
      const majorMatched = hasMatches && search.majorKeys.has(major.key);
      const minorMatches = hasMatches
        ? major.minors.filter((minor) => search.minorKeys.has(`${major.key}||${minor.key}`))
        : [];
      if (hasMatches && !majorMatched && !minorMatches.length) {
        tbody.className = 'ae-search-miss';
        table.append(tbody);
        return;
      }
      // A match shows its categories expanded; otherwise the section keeps
      // its manual expand/collapse state (pref_terms expands everything).
      const expanded =
        (hasMatches && (majorMatched || minorMatches.length > 0)) ||
        this.settings.pref_terms ||
        this.state.expanded.has(major.key);
      tbody.className = expanded ? 'ae-expanded' : 'ae-collapsed';
      tbody.append(
        this.buildRow(major, {
          kind: 'major',
          color,
          percentScale,
          diffScale,
          expanded,
          matched: majorMatched
        })
      );
      major.minors.forEach((minor) => {
        const minorMatched = hasMatches && search.minorKeys.has(`${major.key}||${minor.key}`);
        if (hasMatches && !majorMatched && !minorMatched) return;
        const row = this.buildRow(minor, {
          kind: 'minor',
          major,
          color,
          percentScale,
          diffScale,
          matched: minorMatched
        });
        if (!hasMatches && !prevalenceVisible(minor, this.state.maxPrevalence)) {
          row.classList.add('ae-hidden');
        }
        tbody.append(row);
      });
      if (!hasMatches && !prevalenceVisible(major, this.state.maxPrevalence)) {
        [...tbody.children].forEach((row) => row.classList.add('ae-hidden'));
      }
      table.append(tbody);
    });

    const tfoot = document.createElement('tfoot');
    tfoot.append(
      this.buildRow(this.table.overall, {
        kind: 'overall',
        color,
        percentScale,
        diffScale
      })
    );
    table.append(tfoot);
    return table;
  }

  /**
   * The header: the category column, one group column per shown group with
   * its (n=…) denominator color-matched to its rate dot, the Total column,
   * and the rate/difference plot columns with their axes. Two or more group
   * columns draw a two-row head — a "Groups" super-header spanning the arms
   * over their per-arm names — otherwise a single row carries everything.
   * @private
   */
  buildHead(percentScale, diffScale) {
    const { plan, groups, counts } = this;
    const color = colorScale(groups, this.settings.colors);
    const thead = document.createElement('thead');

    // A named-count header cell — the label on its own line above its (n=…)
    // denominator — colored to match its rate dot (Total stays gray).
    const countHead = (label, n, key) => {
      const th = createElement('th', 'ae-value');
      th.style.color = color(key);
      th.append(
        document.createTextNode(`${label} `),
        createElement('span', 'ae-grp-n', `(n=${n})`)
      );
      return th;
    };
    const rateHead = () => {
      const th = createElement('th', 'ae-plot-head', 'AE Rate by Group');
      th.append(this.buildAxis(percentScale, (value) => `${Math.round(value)}%`));
      return th;
    };
    const diffHead = () => {
      const th = createElement('th', 'ae-plot-head', 'Difference Between Groups');
      th.append(this.buildAxis(diffScale, (value) => `${Math.round(value)}`));
      return th;
    };
    const totalN = () => counts.reduce((sum, count) => sum + count.n, 0);

    // With two or more group columns, a "Groups" super-header spans them and
    // the per-arm names drop to a second header row (reference parity);
    // Category, Total, and the plot columns span both rows. Otherwise a
    // single header row carries everything.
    if (plan.groupCols && groups.length >= 2) {
      const top = document.createElement('tr');
      const bottom = document.createElement('tr');
      const span2 = (th) => {
        th.rowSpan = 2;
        return th;
      };
      top.append(span2(createElement('th', 'ae-category', 'Category')));
      const superHead = createElement('th', 'ae-groups-super', 'Groups');
      superHead.colSpan = groups.length;
      top.append(superHead);
      groups.forEach((group, index) => bottom.append(countHead(group, counts[index].n, group)));
      if (plan.totalCol) top.append(span2(countHead('Total', totalN(), 'Total')));
      top.append(span2(rateHead()));
      if (plan.diffCol) top.append(span2(diffHead()));
      thead.append(top, bottom);
      return thead;
    }

    const row = document.createElement('tr');
    row.append(createElement('th', 'ae-category', 'Category'));
    if (plan.groupCols) {
      groups.forEach((group, index) => row.append(countHead(group, counts[index].n, group)));
    }
    if (plan.totalCol) row.append(countHead('Total', totalN(), 'Total'));
    row.append(rateHead());
    if (plan.diffCol) row.append(diffHead());
    thead.append(row);
    return thead;
  }

  /**
   * A small three-tick axis under a plot-column header.
   * @private
   */
  buildAxis(scale, format) {
    const { width } = this.settings.plot_settings;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', 18);
    svg.setAttribute('class', 'ae-axis');
    const [d0, d1] = scale.domain;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', scale.x(d0));
    line.setAttribute('x2', scale.x(d1));
    line.setAttribute('y1', 4);
    line.setAttribute('y2', 4);
    line.setAttribute('stroke', '#b8c0cc');
    svg.append(line);
    // The end ticks anchor inward (start/end) so long edge labels — e.g. a
    // wide negative difference bound — stay inside the axis instead of
    // clipping at the SVG boundary; the mid tick stays centered.
    const anchors = ['start', 'middle', 'end'];
    [d0, (d0 + d1) / 2, d1].forEach((value, index) => {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', scale.x(value));
      text.setAttribute('y', 15);
      text.setAttribute('text-anchor', anchors[index]);
      text.setAttribute('font-size', '9');
      text.setAttribute('fill', '#52616f');
      text.textContent = format(value);
      svg.append(text);
    });
    return svg;
  }

  /**
   * One summary row — a System Organ Class, Preferred Term, or the overall
   * footer — with its expand control, rate cells, and inline plots.
   * @private
   */
  buildRow(item, { kind, major, color, percentScale, diffScale, expanded, matched }) {
    const { plan, groups } = this;
    const tr = document.createElement('tr');
    tr.className = kind === 'minor' ? 'ae-minor' : kind === 'major' ? 'ae-major' : 'ae-overall';

    const category = createElement('td', 'ae-category');
    if (kind === 'major') {
      const toggle = createElement('span', 'ae-toggle', expanded ? '−' : '+');
      toggle.title = 'Show or hide the preferred terms in this category';
      toggle.onclick = (event) => {
        event.stopPropagation();
        this.toggleMajor(item.key);
      };
      category.append(toggle);
    }
    const label = createElement('span', kind === 'overall' ? null : 'ae-label');
    this.setLabelText(label, item.key, matched);
    if (kind !== 'overall') {
      label.onclick = () =>
        this.showDetails(
          kind === 'minor' ? { major: major.key, minor: item.key } : { major: item.key }
        );
    }
    category.append(label);
    tr.append(category);

    if (plan.groupCols) {
      groups.forEach((group) => {
        const cell = item.cells[group];
        const td = createElement('td', 'ae-value', formatPercent(cell.per));
        td.title = cellTitle(cell);
        const count = createElement('span', 'ae-cell-count', `(${cellTitle(cell)})`);
        count.dataset.group = group;
        td.append(count);
        tr.append(td);
      });
    }
    if (plan.totalCol) {
      const td = createElement('td', 'ae-value ae-total', formatPercent(item.total.per));
      td.title = cellTitle(item.total);
      tr.append(td);
    }

    const rateTd = createElement('td', 'ae-prevplot');
    rateTd.append(this.buildDotPlot(item, color, percentScale));
    tr.append(rateTd);

    if (plan.diffCol) {
      const diffTd = createElement('td', 'ae-diffplot');
      diffTd.append(this.buildDiffPlot(item, color, diffScale));
      // The whole cell is the hover target for the interval/count reveal —
      // the diamonds themselves are too small to hit reliably (AE-REG-017).
      diffTd.addEventListener('mouseenter', () => tr.classList.add('ae-show-ci'));
      diffTd.addEventListener('mouseleave', () => tr.classList.remove('ae-show-ci'));
      tr.append(diffTd);
    }
    return tr;
  }

  /**
   * Write a row label, wrapping the matched search substring for the
   * highlight style (AE-REG-003).
   * @private
   */
  setLabelText(label, text, matched) {
    label.textContent = '';
    const term = this.state.searchTerm;
    const index = matched ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
    if (index < 0) {
      label.textContent = text;
      return;
    }
    label.append(
      document.createTextNode(text.slice(0, index)),
      createElement('span', 'ae-search-match', text.slice(index, index + term.length)),
      document.createTextNode(text.slice(index + term.length))
    );
  }

  /**
   * The inline rate dot plot: one group-colored point per group on the
   * shared percent axis (AE-USER-012).
   * @private
   */
  buildDotPlot(item, color, percentScale) {
    const { height, width, radius } = this.settings.plot_settings;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('class', 'ae-plot');
    this.groups.forEach((group) => {
      const cell = item.cells[group];
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', percentScale.x(cell.per));
      circle.setAttribute('cy', height / 2);
      circle.setAttribute('r', Math.max(2, radius - 2));
      circle.setAttribute('fill', color(group));
      circle.setAttribute('fill-opacity', '0.85');
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = dotTitle(group, cell);
      circle.append(title);
      svg.append(circle);
    });
    return svg;
  }

  /**
   * The inline difference plot: one diamond per group pair at the
   * difference in rates with its 95% interval line — solid when the
   * interval excludes zero, faint otherwise, colored by the higher group
   * (AE-USER-013). With more than two groups the interval lines stay
   * hidden until the difference cell is hovered (AE-REG-017).
   * @private
   */
  buildDiffPlot(item, color, diffScale) {
    const { height, width, radius } = this.settings.plot_settings;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('class', 'ae-plot');
    const mid = height / 2;
    const half = Math.max(3, radius - 2);
    const diffs = addDifferences(item.cells, this.groups);
    const hideCi = this.groups.length > 2;
    diffs.forEach((diff) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', diffScale.x(diff.lower));
      line.setAttribute('x2', diffScale.x(diff.upper));
      line.setAttribute('y1', mid);
      line.setAttribute('y2', mid);
      line.setAttribute('stroke', '#52616f');
      line.setAttribute('class', hideCi ? 'ae-ci ae-ci-hidden' : 'ae-ci');
      svg.append(line);

      const x = diffScale.x(diff.diff);
      const diamond = document.createElementNS(SVG_NS, 'path');
      diamond.setAttribute(
        'd',
        `M ${x} ${mid - half} L ${x + half} ${mid} L ${x} ${mid + half} L ${x - half} ${mid} Z`
      );
      const higher = diff.diff < 0 ? diff.group2 : diff.group1;
      diamond.setAttribute('fill', color(higher));
      diamond.setAttribute('stroke', color(higher));
      diamond.setAttribute('fill-opacity', diff.sig ? '1' : '0.1');
      diamond.setAttribute('class', 'ae-diamond');
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = diffTitle(diff, item.cells);
      diamond.append(title);
      svg.append(diamond);
    });
    return svg;
  }

  /**
   * Expand or collapse one System Organ Class section (AE-USER-014,
   * AE-USER-015).
   * @private
   */
  toggleMajor(key) {
    if (this.state.expanded.has(key)) this.state.expanded.delete(key);
    else this.state.expanded.add(key);
    this.render();
  }

  /**
   * Open the details view for a category (AE-USER-016): the record-level
   * listing of the events under the clicked System Organ Class or Preferred
   * Term as currently filtered, with the active filters reported and a
   * Return to the Summary View button.
   * @param {{major: string, minor: ?string}} target The clicked category.
   * @returns {void}
   */
  showDetails(target) {
    this.detail = target;
    const rows = this.currentEvents.filter(
      (row) =>
        String(row[this.settings.major_col] ?? '') === target.major &&
        (target.minor == null || String(row[this.settings.minor_col] ?? '') === target.minor)
    );
    const labelText = target.minor ? `${target.minor} (${target.major})` : target.major;
    this.detailTitle.textContent = `Details for ${rows.length} ${labelText} records`;

    const active = (this.activeFilterSpecs || []).filter(
      (spec) => this.state.filters[spec.value_col] != null
    );
    this.detailNote.textContent = active.length
      ? `The listing is filtered as shown: ${active
          .map((spec) => `${spec.label} = ${this.state.filters[spec.value_col]}`)
          .join('; ')}.`
      : '';

    this.sidebar.classList.add('sv-hidden');
    this.tableWrap.classList.add('sv-hidden');
    this.detailWrap.classList.remove('sv-hidden');
    this.currentTableData = rows;
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    renderListing(this);
    this.footnote.textContent = 'Click Return to the Summary View to go back.';
  }

  /**
   * Close the details view without re-rendering.
   * @private
   */
  closeDetail() {
    if (!this.detail) return;
    this.detail = null;
    this.detailWrap.classList.add('sv-hidden');
    this.sidebar.classList.remove('sv-hidden');
    this.tableWrap.classList.remove('sv-hidden');
    this.listingWrap.innerHTML = '';
    this.currentTableData = [];
    this.footnote.textContent = SUMMARY_FOOTNOTE;
  }

  /**
   * Return from the details view to the summary table (AE-USER-017).
   * @returns {void}
   */
  backToSummary() {
    this.closeDetail();
    this.render();
  }

  /**
   * The validation download's payload: the summarized data as currently
   * filtered and summarized, and its major-minor-basis file name
   * (AE-USER-020, AE-REG-027).
   * @returns {{name: string, csv: string}} The file name and CSV text.
   */
  buildValidationCsv() {
    return {
      name: csvName({ ...this.settings, summarize_by: this.state.summarizeBy }),
      csv: summaryCsv(this.table.majors, this.groups)
    };
  }

  /**
   * Trigger the summarized-data CSV download (AE-CFG-009).
   * @private
   */
  downloadSummary() {
    const { name, csv } = this.buildValidationCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Table layout reflows with the page, so resizing is a no-op kept for the
   * shared lifecycle shape (the R htmlwidget bindings call it).
   * @returns {void}
   */
  resize() {
    this.charts.forEach((chart) => chart.resize());
  }

  /**
   * Tear the explorer down: empty the target element. The instance cannot
   * be reused afterwards — create a new one via the factory instead.
   * @returns {void}
   */
  destroy() {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    this.element.innerHTML = '';
  }
}

/**
 * Create an adverse-event explorer inside a container element. The control
 * shell renders immediately; pass one-record-per-adverse-event data (plus
 * placeholder rows for participants with no adverse events) to setData (or
 * init) on the returned instance to validate the data and draw the summary
 * table (AE-API-001).
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {AEExplorerSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {AEExplorer} The live explorer instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function aeExplorer(element = 'body', settings = {}) {
  return new AEExplorer(element, settings);
}
