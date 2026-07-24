// Shared renderer chrome (#17): the collapsible control sidebar and
// main-column slots introduced by the histogram redesign (#15), factored out
// so every safety.viz renderer shares one layout by construction. Chrome
// classes use the neutral sv- prefix, and one stylesheet is injected per
// document by whichever module mounts first.

/**
 * Create an element with an optional class and text content.
 * @param {string} tag Element tag name.
 * @param {?string} [className] Class attribute to set when non-empty.
 * @param {string} [text] Text content to set when provided.
 * @returns {HTMLElement} The detached element.
 */
export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Build the standard "prototype" banner (HEP-MIG / HWF prototype marking): a
 * self-contained notice a chart prepends to its own output so the not-yet-stable
 * status travels with the chart everywhere it renders — the demo, the deployed
 * site, and any downstream embed (e.g. a gsm.safety htmlwidget) — not just the
 * gallery pages. The default copy names the target release and warns that
 * behaviour and API may change.
 * @param {string} [note] Optional trailing sentence appended after the label.
 * @returns {HTMLElement} A `.sv-prototype` banner element.
 */
export function prototypeBanner(note) {
  const banner = createElement('div', 'sv-prototype');
  banner.setAttribute('role', 'note');
  const tag = createElement('span', 'sv-prototype-tag', 'Prototype');
  banner.append(tag);
  const text =
    note ||
    'This chart is a prototype under evaluation for the v1.5 release — its behaviour and ' +
      'settings may change before it is finalized.';
  banner.append(createElement('span', 'sv-prototype-text', text));
  return banner;
}

/**
 * Append an option to a select.
 * @param {HTMLSelectElement} select Select to append to.
 * @param {string} value Option value.
 * @param {string} label Option label.
 * @param {boolean} selected Whether the option starts selected.
 * @returns {void}
 */
export function option(select, value, label, selected) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  opt.selected = selected;
  select.appendChild(opt);
}

const SHELL_STYLE_ID = 'safety-viz-shell-styles';

const SHELL_STYLES = `
.sv-root{display:flex;align-items:flex-start;gap:1.25rem;width:100%;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2933}
.sv-sidebar{position:sticky;top:1rem;flex:0 0 250px;max-height:calc(100vh - 2rem);overflow-y:auto;border:1px solid #d8dee4;border-radius:10px;background:#f6f8fa;padding:.8rem .9rem 1rem}
.sv-sidebar-header{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.sv-sidebar-title{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#52616f}
.sv-sidebar-toggle{border:1px solid #d8dee4;border-radius:6px;background:#fff;color:#52616f;font:inherit;font-size:.85rem;line-height:1;padding:.25rem .5rem;cursor:pointer}
.sv-sidebar-toggle:hover{color:#1f2933;border-color:#b8c0cc}
.sv-collapsed .sv-sidebar{flex-basis:auto;padding:.5rem}
.sv-collapsed .sv-sidebar-title,.sv-collapsed .sv-controls{display:none}
.sv-control-section{border-top:1px solid #e3e8ee;margin-top:.8rem;padding-top:.65rem}
.sv-section-title{margin:0 0 .5rem;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#52616f}
.sv-controls>.sv-control{margin-top:.75rem}
.sv-control{margin:0 0 .55rem}
.sv-control:last-child{margin-bottom:0}
.sv-control label{display:block;font-size:.78rem;font-weight:600;margin-bottom:.25rem}
.sv-control select,.sv-control input{width:100%;box-sizing:border-box;padding:.35rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.85rem;color:inherit}
.sv-control input[type=checkbox]{width:auto;margin:0;accent-color:#0b62a4}
.sv-control select:focus-visible,.sv-control input:focus-visible,.sv-sidebar-toggle:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-control-row{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.sv-control-row .sv-control{margin:0}
.sv-control-inline{display:flex;align-items:center;gap:.4rem;font-size:.85rem}
.sv-main{flex:1 1 auto;min-width:0}
.sv-notes{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;font-size:.85rem;color:#52616f;margin:0 0 .6rem}
.sv-warning{color:#9a3412}
.sv-chart-wrap{height:460px;position:relative;border:1px solid #d8dee4;border-radius:10px;padding:1rem;background:#fff}
.sv-footnote{margin:.6rem 0 0;font-size:.85rem;color:#52616f}
.sv-profile:empty{display:none}
.sv-multiples{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-top:1.25rem}
.sv-multiples:empty{display:none}
.sv-multiple{border:1px solid #d8dee4;border-radius:10px;padding:.75rem .85rem;background:#fff}
.sv-multiple h3{font-size:.92rem;margin:0 0 .4rem}
.sv-multiple-canvas{height:200px}
.sv-overview-panel{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}
.sv-overview-panel:hover,.sv-overview-panel:focus-visible{border-color:#0b62a4;box-shadow:0 0 0 2px rgba(11,98,164,.18);outline:none}
.sv-listing{margin-top:1.25rem}
.sv-listing table{width:100%;border-collapse:collapse;font-size:.85rem;background:#fff}
.sv-listing th,.sv-listing td{border-bottom:1px solid #e3e8ee;padding:.45rem .55rem;text-align:left;vertical-align:top}
.sv-listing th{border-bottom:2px solid #d8dee4;cursor:pointer;font-size:.75rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f;white-space:nowrap}
.sv-listing tbody tr:hover{background:#f6f8fa}
.sv-listing tbody tr.sv-listing-rowlink{cursor:pointer}
.sv-listing tbody tr.sv-listing-rowlink:focus-visible{outline:2px solid #0b62a4;outline-offset:-2px}
.sv-listing tbody tr.sv-listing-row-selected{background:#e8f0fe}
.sv-listing tbody tr.sv-listing-row-selected:hover{background:#dce8fc}
.sv-listing-actions{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:.5rem 0;font-size:.85rem;flex-wrap:wrap}
.sv-listing-tools{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.sv-listing-search{padding:.35rem .45rem;border:1px solid #b8c0cc;border-radius:6px;font:inherit;font-size:.85rem}
.sv-listing-actions button{padding:.3rem .6rem;border:1px solid #d8dee4;border-radius:6px;background:#fff;color:#1f2933;font:inherit;font-size:.8rem;cursor:pointer}
.sv-listing-actions button:hover:not(:disabled){border-color:#b8c0cc;background:#f6f8fa}
.sv-listing-actions button:disabled{opacity:.45;cursor:default}
.sv-annotation,.sv-main-annotation{font-size:.85rem;background:rgba(255,255,255,.92);border:1px solid #d8dee4;border-radius:6px;padding:.25rem .4rem}
.sv-main-annotation{position:absolute;right:1.25rem;top:1.25rem;z-index:2}
.sv-main-annotation:empty{display:none}
.sv-info{text-decoration:none}
.sv-hidden{display:none!important}
.sv-view-list{display:flex;flex-direction:column;gap:.35rem}
.sv-view-option{display:block;width:100%;text-align:left;padding:.45rem .55rem;border:1px solid #d8dee4;border-radius:8px;background:#fff;font:inherit;font-size:.85rem;line-height:1.3;color:#1f2933;cursor:pointer}
.sv-view-option:hover{border-color:#b8c0cc;background:#f6f8fa}
.sv-view-option.is-active{border-color:#0b62a4;background:#eaf2fb;color:#0b3d63;font-weight:600;box-shadow:inset 0 0 0 1px #0b62a4}
.sv-view-option:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-prototype{display:flex;align-items:baseline;gap:.5rem;margin:0 0 .6rem;padding:.4rem .6rem;border:1px solid #e6c98a;border-left:4px solid #d99a2b;border-radius:6px;background:#fdf6e6;color:#6b4e12;font-size:.8rem;line-height:1.35}
.sv-prototype-tag{flex:0 0 auto;text-transform:uppercase;letter-spacing:.05em;font-weight:700;font-size:.68rem;padding:.08rem .4rem;border-radius:999px;background:#d99a2b;color:#fff}
.sv-prototype-text{flex:1 1 auto}
@media (max-width:900px){
.sv-root{flex-direction:column}
.sv-sidebar{position:static;flex:1 1 auto;width:100%;max-height:none}
.sv-controls{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:0 1.25rem;align-items:start}
.sv-control-section{border-top:none}
}`;

/**
 * Inject the shared chrome stylesheet once per document.
 * @returns {void}
 */
export function applyShellStyles() {
  if (document.getElementById(SHELL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHELL_STYLE_ID;
  style.textContent = SHELL_STYLES;
  document.head.append(style);
}

/**
 * The standard DOM slots every renderer draws into.
 * @typedef {Object} ShellSlots
 * @property {HTMLElement} root Layout root (sidebar + main columns).
 * @property {HTMLElement} sidebar Collapsible control sidebar.
 * @property {HTMLButtonElement} sidebarToggle Collapse/expand button.
 * @property {HTMLElement} controls Container the module rebuilds its controls into.
 * @property {HTMLElement} main Main column.
 * @property {HTMLElement} notes Status line above the chart.
 * @property {HTMLElement} chartWrap Chart card wrapping the canvas.
 * @property {HTMLCanvasElement} canvas Main chart canvas.
 * @property {HTMLElement} mainAnnotation Overlay annotation inside the chart card.
 * @property {HTMLElement} footnote Hover/selection footnote below the chart.
 * @property {HTMLElement} multiplesWrap Small-multiples grid.
 * @property {HTMLElement} profileWrap Participant-profile dock slot below the chart card and small multiples, above the shared listing (#98, PPRF-1); hidden while empty.
 * @property {HTMLElement} listingWrap Linked participant listing container.
 */

/**
 * Empty the target element and build the shared renderer shell into it:
 * a collapsible control sidebar next to a main column of chart, footnote,
 * small-multiples, and listing slots.
 * @param {HTMLElement} element Container the shell replaces the contents of.
 * @param {Object} [options] Shell options.
 * @param {string} [options.moduleClass] Module identity class added to the root.
 * @param {Function} [options.onToggle] Called after the sidebar collapses or expands (e.g. to resize charts).
 * @returns {ShellSlots} The slots the module renders into.
 */
export function renderShell(element, { moduleClass = '', onToggle } = {}) {
  element.innerHTML = '';
  const root = createElement('div', `sv-root ${moduleClass}`.trim());

  const sidebar = createElement('aside', 'sv-sidebar');
  const sidebarHeader = createElement('div', 'sv-sidebar-header');
  sidebarHeader.append(createElement('span', 'sv-sidebar-title', 'Controls'));
  const sidebarToggle = createElement('button', 'sv-sidebar-toggle');
  sidebarToggle.type = 'button';
  const setCollapsed = (collapsed) => {
    root.classList.toggle('sv-collapsed', collapsed);
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggle.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
    sidebarToggle.textContent = collapsed ? '»' : '«';
  };
  sidebarToggle.onclick = () => {
    setCollapsed(!root.classList.contains('sv-collapsed'));
    if (onToggle) onToggle();
  };
  setCollapsed(false);
  sidebarHeader.append(sidebarToggle);
  const controls = createElement('div', 'sv-controls');
  sidebar.append(sidebarHeader, controls);

  const main = createElement('div', 'sv-main');
  const notes = createElement('div', 'sv-notes');
  const chartWrap = createElement('div', 'sv-chart-wrap');
  const canvas = createElement('canvas', 'sv-chart');
  const mainAnnotation = createElement('div', 'sv-main-annotation');
  const footnote = createElement('div', 'sv-footnote');
  const profileWrap = createElement('div', 'sv-profile');
  const multiplesWrap = createElement('div', 'sv-multiples');
  const listingWrap = createElement('div', 'sv-listing');
  chartWrap.append(canvas, mainAnnotation);
  main.append(notes, chartWrap, footnote, multiplesWrap, profileWrap, listingWrap);

  root.append(sidebar, main);
  element.append(root);
  applyShellStyles();
  return {
    root,
    sidebar,
    sidebarToggle,
    controls,
    main,
    notes,
    chartWrap,
    canvas,
    mainAnnotation,
    footnote,
    multiplesWrap,
    profileWrap,
    listingWrap
  };
}

/**
 * Control-builder helpers bound to a shell's controls container. Signatures
 * match how modules build controls: sections group related controls under a
 * heading, rows place two controls side by side, and addControl wraps a
 * labeled input (into the controls container by default).
 * @param {HTMLElement} controls The shell's controls container.
 * @returns {{addSection: Function, addRow: Function, addControl: Function}} The bound helpers.
 */
export function controlBuilders(controls) {
  return {
    addSection(label) {
      const section = createElement('section', 'sv-control-section');
      section.append(createElement('h4', 'sv-section-title', label));
      controls.append(section);
      return section;
    },
    addRow(parent) {
      const row = createElement('div', 'sv-control-row');
      parent.append(row);
      return row;
    },
    addControl(label, input, parent = controls) {
      const wrap = createElement('div', 'sv-control');
      const lab = createElement('label', null, label);
      wrap.append(lab, input);
      parent.append(wrap);
      return input;
    }
  };
}

/**
 * Render a view selector into its own sidebar section: a stacked list of
 * always-visible option buttons, the active one highlighted, one row per view.
 * Shared by every renderer with more than one top-level view (hep-explorer,
 * qt-explorer) so the builder and its CSS live in one place (#76 / VIEW-1)
 * rather than being duplicated per module. Preserves the a11y contract the
 * consumers ship: real `<button type="button">`s, `aria-pressed` reflecting the
 * active option, and the `:focus-visible` outline from the shared stylesheet.
 * @param {Function} addSection The shell's section builder (from {@link controlBuilders}).
 * @param {Object} config View-selector configuration.
 * @param {Array<{value: string, label: string}>} config.options The selectable views, in display order.
 * @param {string} config.active The value of the currently active view.
 * @param {(value: string) => void} config.onChange Called with the chosen value when a non-active option is activated.
 * @param {string} [config.title='View'] The section heading.
 * @returns {HTMLElement} The created section element (with the option list appended).
 */
export function renderViewSelector(addSection, { options, active, onChange, title = 'View' }) {
  const section = addSection(title);
  const list = createElement('div', 'sv-view-list');
  options.forEach(({ value, label }) => {
    const isActive = value === active;
    const optionButton = createElement(
      'button',
      `sv-view-option${isActive ? ' is-active' : ''}`,
      label
    );
    optionButton.type = 'button';
    optionButton.setAttribute('aria-pressed', String(isActive));
    optionButton.onclick = () => {
      if (value === active) return;
      onChange(value);
    };
    list.append(optionButton);
  });
  section.append(list);
  return section;
}
