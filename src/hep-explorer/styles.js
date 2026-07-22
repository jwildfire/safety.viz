// The injected stylesheet for the hep-explorer module (obot.roadmap#43,
// safety.viz#91): the quadrant summary table, the participant drill-down
// panels, the shared participant-trace header and Participants control, and the
// composite plot's cards, migration table and concern legend. Moved VERBATIM
// out of src/hep-explorer.js so the entry file is left as the orchestrator and
// the module's rules have one obvious home — the migration Sankey (Amirzadegan
// 2025 Fig 3, safety.viz#92) adds its own rules here rather than to a growing
// method on the class.
//
// The shared shell stylesheet (src/shell.js) stays module-agnostic; this is the
// hep-explorer's own, injected once per document.
//
// Requirement groups: HEP-QUAD-005, HEP-SELECT-002, HEP-SELECT-005, HEP-COMP-*.

const STYLE_ID = 'safety-viz-hep-explorer-styles';

const MODULE_CSS = `
.safety-hep-explorer .hep-quadrant-summary{margin-top:1rem}
.safety-hep-explorer .hep-quadrant-summary table{width:100%;max-width:420px;border-collapse:collapse;font-size:.85rem;background:#fff}
.safety-hep-explorer .hep-quadrant-summary th,.safety-hep-explorer .hep-quadrant-summary td{border-bottom:1px solid #e3e8ee;padding:.4rem .55rem;text-align:left}
.safety-hep-explorer .hep-quadrant-summary th{border-bottom:2px solid #d8dee4;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.safety-hep-explorer .hep-quadrant-summary td.hep-num,.safety-hep-explorer .hep-quadrant-summary th.hep-num{text-align:right;font-variant-numeric:tabular-nums}
.safety-hep-explorer .hep-detail{margin-top:1.25rem;border-top:2px solid #111827;padding-top:.75rem}
.safety-hep-explorer .hep-detail-title{font-size:.95rem;margin:0 0 .5rem}
.safety-hep-explorer .hep-detail-chart{height:220px;position:relative;border:1px solid #d8dee4;border-radius:10px;padding:.75rem;background:#fff}
.safety-hep-explorer .hep-summary-table{width:100%;max-width:520px;border-collapse:collapse;font-size:.85rem;background:#fff;margin-top:.9rem}
.safety-hep-explorer .hep-summary-table th,.safety-hep-explorer .hep-summary-table td{border-bottom:1px solid #e3e8ee;padding:.4rem .55rem;text-align:left}
.safety-hep-explorer .hep-summary-table th{border-bottom:2px solid #d8dee4;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.safety-hep-explorer .hep-summary-table td.hep-num,.safety-hep-explorer .hep-summary-table th.hep-num{text-align:right;font-variant-numeric:tabular-nums}
.safety-hep-explorer .hep-composite{margin-top:.5rem}
.safety-hep-explorer .hep-composite-header{font-size:.85rem;color:#52616f;background:#f6f8fa;border:1px solid #e3e8ee;border-radius:8px;padding:.4rem .6rem;margin:0 0 .6rem;min-height:1.2rem}
.safety-hep-explorer .hep-composite-header.is-active{color:#1f2933;font-weight:600;border-color:#b8c0cc;background:#eef2f6}
.safety-hep-explorer .hep-composite-select select{padding:.25rem;font-size:.82rem}
.safety-hep-explorer .hep-composite-select option{padding:.15rem .3rem}
.safety-hep-explorer .hep-composite-clear{width:100%;margin-top:.35rem;padding:.25rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.78rem;cursor:pointer}
.safety-hep-explorer .hep-composite-clear:disabled{color:#9aa5b1;cursor:default}
.safety-hep-explorer .hep-composite-legend{display:flex;flex-wrap:wrap;gap:.35rem 1rem;font-size:.8rem;color:#52616f;margin:0 0 .75rem}
.safety-hep-explorer .hep-composite-legend .hep-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.safety-hep-explorer .hep-composite-section-title{font-size:.9rem;margin:1rem 0 .5rem;color:#1f2933}
.safety-hep-explorer .hep-composite-edish{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}
.safety-hep-explorer .hep-composite-panels{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;max-width:760px}
.safety-hep-explorer .hep-composite-card{border:1px solid #d8dee4;border-radius:10px;padding:.6rem .7rem;background:#fff}
.safety-hep-explorer .hep-composite-card h4{font-size:.82rem;margin:0 0 .4rem;color:#52616f;font-weight:600}
.safety-hep-explorer .hep-composite-canvas{height:280px;position:relative}
.safety-hep-explorer .hep-composite-panel-canvas{height:210px;position:relative}
.safety-hep-explorer .hep-migration{margin-top:1.25rem}
.safety-hep-explorer .hep-migration table{border-collapse:collapse;font-size:.82rem;background:#fff}
.safety-hep-explorer .hep-migration th,.safety-hep-explorer .hep-migration td{border:1px solid #d8dee4;padding:.35rem .55rem;text-align:center}
.safety-hep-explorer .hep-migration th{font-size:.72rem;text-transform:uppercase;letter-spacing:.02em;color:#52616f;font-weight:700}
.safety-hep-explorer .hep-migration td.hep-rowhead{text-align:left;font-weight:600;color:#1f2933;white-space:nowrap}
.safety-hep-explorer .hep-migration td.hep-total,.safety-hep-explorer .hep-migration th.hep-total{background:#f6f8fa;font-weight:700}
.safety-hep-explorer .hep-migration caption{caption-side:top;text-align:left;font-size:.82rem;color:#52616f;margin-bottom:.35rem}
.safety-hep-explorer .hep-concern-legend{display:flex;flex-wrap:wrap;gap:.35rem .9rem;font-size:.76rem;color:#52616f;margin:.5rem 0 0}
.safety-hep-explorer .hep-concern-legend .hep-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.safety-hep-explorer .hep-concern-swatch{display:inline-block;width:.8rem;height:.8rem;border:1px solid #b8c0cc;border-radius:2px}`;

/**
 * Inject the module-specific stylesheet once per document; a second explorer on
 * the page, or any re-render, is a no-op.
 * @returns {void}
 * @private
 */
export function applyModuleStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MODULE_CSS;
  document.head.append(style);
}
