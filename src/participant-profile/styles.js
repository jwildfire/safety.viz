// The injected stylesheet for the participant-profile module (#98). Uses the
// sv-profile-* prefix and is injected once per document, alongside (never
// replacing) the shared shell stylesheet (src/shell.js). Covers the header
// details list, the labs-over-time spaghetti card, and the measure table with
// its sparkline cells and expandable inset (pattern: src/hep-explorer/styles.js).
// Requirement groups: PPRF-2/3/4/8.

const STYLE_ID = 'safety-viz-participant-profile-styles';

const MODULE_CSS = `
.sv-profile-root{margin-top:.5rem}
.sv-profile-header{border-top:2px solid #111827;border-bottom:2px solid #111827;padding:.4rem .2rem;margin:0 0 .75rem}
.sv-profile-titlerow{display:flex;align-items:baseline;flex-wrap:wrap;gap:.75rem}
.sv-profile-id{font-size:1rem;font-weight:700;margin:0}
.sv-profile-link{font-size:.8rem;text-decoration:none;color:#0b62a4}
.sv-profile-link:hover{text-decoration:underline}
.sv-profile-clear{margin-left:auto;padding:.25rem .6rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;color:#1f2933;font:inherit;font-size:.8rem;cursor:pointer}
.sv-profile-clear:hover{border-color:#8a94a6;background:#f6f8fa}
.sv-profile-clear:focus-visible,.sv-profile-palt .sv-profile-detail-value:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-profile-details{list-style:none;display:flex;flex-wrap:wrap;gap:.25rem 1.5rem;padding:0;margin:.5rem 0 0}
.sv-profile-details li{text-align:center}
.sv-profile-detail-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.sv-profile-detail-value{font-size:.9rem;font-variant-numeric:tabular-nums}
.sv-profile-palt .sv-profile-detail-value{border-bottom:1px dotted #999;cursor:pointer}
.sv-profile-footnote{margin:.4rem 0 0;font-size:.75rem;color:#52616f;min-height:1rem}
.sv-profile-controls{display:flex;flex-wrap:wrap;align-items:flex-end;gap:.75rem 1rem;margin:0 0 .75rem}
.sv-profile-controls .sv-profile-field{display:flex;flex-direction:column;gap:.2rem;font-size:.78rem}
.sv-profile-controls label{font-weight:600;color:#52616f}
.sv-profile-controls select{padding:.3rem .4rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.82rem}
.sv-profile-controls select:focus-visible,.sv-profile-extras input:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-profile-spaghetti-card{height:300px;position:relative;border:1px solid #d8dee4;border-radius:10px;padding:.75rem;background:#fff}
.sv-profile-spaghetti-footnote{margin:.5rem 0 0;font-size:.72rem;color:#52616f}
.sv-profile-extras{display:inline-flex;align-items:center;gap:.4rem;font-size:.8rem;margin:.75rem 0 .25rem}
.sv-profile-extras input{accent-color:#0b62a4}
.sv-profile-measure-wrap{margin:.75rem 0 0}
.sv-profile-measure-table{width:100%;border-collapse:collapse;font-size:.82rem}
.sv-profile-measure-table th{text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f;padding:.3rem .5rem;border-bottom:2px solid #111827}
.sv-profile-measure-table td{padding:.3rem .5rem;font-variant-numeric:tabular-nums}
.sv-profile-measure-row td{border-bottom:.5px solid #111827}
.sv-profile-inset-row td{border-bottom:.5px solid #111827;background:none}
.sv-profile-spark{white-space:nowrap}
.sv-profile-spark svg{vertical-align:middle}
.sv-profile-spark-toggle{border:none;background:none;color:#999;cursor:pointer;font:inherit;font-size:.8rem;padding:.1rem .3rem;vertical-align:middle}
.sv-profile-spark-toggle:hover{color:#1f2933}
.sv-profile-spark-toggle:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-profile-inset-card{height:200px;position:relative;padding:.5rem 0}
.sv-profile-listing{margin:1rem 0 0}
.sv-profile-listing-title{margin:0 0 .4rem;font-size:.85rem}`;

/**
 * Inject the module-specific stylesheet once per document; a second profile on
 * the page, or any re-render, is a no-op.
 * @returns {void}
 */
export function applyProfileStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MODULE_CSS;
  document.head.append(style);
}
