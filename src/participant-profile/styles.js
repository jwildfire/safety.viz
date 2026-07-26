// The injected stylesheet for the participant-profile module (#98). Uses the
// sv-profile-* prefix and is injected once per document, alongside (never
// replacing) the shared shell stylesheet (src/shell.js). Covers the header
// details list, the labs-over-time spaghetti card, and the measure table with
// its sparkline cells and expandable inset (pattern: src/hep-explorer/styles.js).
// Requirement groups: PPRF-2/3/4/8.

const STYLE_ID = 'safety-viz-participant-profile-styles';

const MODULE_CSS = `
.sv-profile-root{margin-top:.5rem}

/* --- the rail (obot.roadmap#75, decisions D1/D2/D3/D8) --------------------- */
.sv-profile-rail{display:flex;flex-direction:column;min-height:0;height:100%}
.sv-profile-rail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem;padding:.55rem .7rem;border-bottom:1px solid #e3e8ee;background:#f2f6f8;flex:0 0 auto}
.sv-profile-rail-title{margin:0;font-size:.95rem;font-weight:700;font-variant-numeric:tabular-nums}
.sv-profile-rail-sub{margin:.1rem 0 0;font-size:.75rem;color:#52616f}
.sv-profile-rail-actions{display:flex;gap:.35rem;flex:0 0 auto}
.sv-profile-rail-btn{border:1px solid #d8dee4;background:#fff;color:#1f2933;border-radius:6px;font:inherit;font-size:.75rem;padding:.3rem .5rem;cursor:pointer;white-space:nowrap}
.sv-profile-rail-btn:hover{border-color:#0b62a4;color:#0b3d63}
.sv-profile-rail-btn:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-profile-rail-stepper{flex:0 0 auto;background:#fff;border-bottom:1px solid #e3e8ee}
.sv-profile-rail-stepper:empty{display:none}
.sv-profile-rail-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:auto;padding:.7rem}
.sv-profile-rail.is-empty .sv-profile-rail-body::before{content:"Click a participant in the chart to read their profile here.";display:block;padding:2rem .5rem;text-align:center;color:#7b8b96;font-size:.88rem}
/* Expanded, the block gets room for a proper control column beside it — which
   is to say the expanded profile is the standalone renderer (decision D3). */
.sv-rail-expanded .sv-profile-rail-body{padding:1rem}
.sv-rail-expanded .sv-profile-controls{flex-direction:column;align-items:stretch;float:left;width:210px;margin:0 1.25rem .75rem 0;padding-right:1rem;border-right:1px solid #e3e8ee}
.sv-rail-expanded .sv-profile-spaghetti-card{height:360px}

/* --- the cohort list (decision D8) ---------------------------------------- */
.sv-profile-step-toggle{margin-left:auto;border:1px solid #d8dee4;background:#fff;color:#52616f;border-radius:6px;font:inherit;font-size:.72rem;padding:.2rem .45rem;cursor:pointer}
.sv-profile-step-toggle:hover{border-color:#0b62a4;color:#0b3d63}
.sv-profile-step-toggle:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-profile-cohort{max-height:9rem;overflow-y:auto;border-top:1px solid #e3e8ee;background:#fbfcfd}
.sv-profile-cohort-list{list-style:none;margin:0;padding:.25rem;counter-reset:cohort}
.sv-profile-cohort-list li{counter-increment:cohort}
.sv-profile-cohort-item{display:block;width:100%;text-align:left;border:0;background:none;font:inherit;font-size:.8rem;padding:.2rem .4rem;border-radius:4px;cursor:pointer;color:#1f2933}
.sv-profile-cohort-item::before{content:counter(cohort) ". ";color:#7b8b96;font-variant-numeric:tabular-nums}
.sv-profile-cohort-item:hover{background:#eef3f6}
.sv-profile-cohort-item.is-current{background:#eaf2fb;font-weight:600}
.sv-profile-cohort-item:focus-visible{outline:2px solid #0b62a4;outline-offset:-2px}

/* --- the adverse-event tracks (decisions D5/D6/D7) ------------------------ */
.sv-profile-ae{margin:.9rem 0 1rem;padding:.75rem 0 .2rem;border-top:1px solid #e3e8ee;border-bottom:1px solid #e3e8ee}
.sv-profile-ae-title{margin:0 0 .55rem;font-size:.95rem;font-weight:700}
.sv-profile-ae-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-bottom:.6rem}
.sv-profile-ae-tile{border:1px solid #e3e8ee;border-radius:7px;padding:.35rem .5rem;background:#fff}
.sv-profile-ae-tile-value{display:flex;align-items:center;gap:.3rem;font-size:1rem;font-weight:700;font-variant-numeric:tabular-nums}
.sv-profile-ae-tile-label{margin-top:.1rem;font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:#7b8b96}
.sv-profile-ae-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;display:inline-block}
.sv-profile-ae-mix{display:flex;gap:2px;height:10px}
.sv-profile-ae-mix-seg{border-radius:2px;min-width:4px}
.sv-profile-ae-legend{display:flex;flex-wrap:wrap;gap:.2rem .8rem;margin-top:.3rem;font-size:.74rem;color:#52616f}
.sv-profile-ae-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.sv-profile-ae-track-label{margin:.6rem 0 .35rem;font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;color:#7b8b96}
.sv-profile-ae-timeline{box-sizing:border-box;border:1px solid transparent;padding:0 .75rem}
.sv-profile-ae-plotarea{position:relative;box-sizing:border-box}
.sv-profile-ae-plot{position:relative}
.sv-profile-ae-row{position:relative;height:27px}
.sv-profile-ae-term{position:absolute;top:0;line-height:14px;font-size:.7rem;color:#52616f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-profile-ae-term.is-flipped{text-align:right}
.sv-profile-ae-bar{position:absolute;top:16px;height:9px;border-radius:3px;min-width:4px}
.sv-profile-ae-bar.is-open-ended{border-radius:3px 0 0 3px;-webkit-mask-image:linear-gradient(to right,#000 0,#000 60%,rgba(0,0,0,.25) 100%);mask-image:linear-gradient(to right,#000 0,#000 60%,rgba(0,0,0,.25) 100%)}
.sv-profile-ae-bar.is-serious{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #d03b3b}
.sv-profile-ae-axis{position:relative;height:18px;margin-top:2px;border-top:1px solid #e3e8ee}
.sv-profile-ae-tick{position:absolute;top:2px;transform:translateX(-50%);font-size:.65rem;color:#7b8b96;font-variant-numeric:tabular-nums}
.sv-profile-ae-more,.sv-profile-ae-unplaceable{margin:.4rem 0 0;font-size:.72rem;color:#7b8b96}
.sv-profile-ae-empty{margin:.3rem 0 .8rem;font-size:.82rem;color:#7b8b96}
.sv-profile-ae-soc-wrap{margin-top:.7rem}
.sv-profile-ae-soc{list-style:none;margin:0;padding:0}
.sv-profile-ae-soc li{display:flex;justify-content:space-between;gap:.6rem;font-size:.76rem;padding:.16rem 0;border-bottom:1px dotted #e3e8ee}
.sv-profile-ae-soc-name{color:#52616f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sv-profile-ae-soc-count{font-variant-numeric:tabular-nums;font-weight:600}
.sv-profile-live{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sv-profile-table-footnote{margin:.5rem 0 0;font-size:.72rem;color:#52616f}
.sv-profile-spaghetti-canvas:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
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
.sv-profile-listing-title{margin:0 0 .4rem;font-size:.85rem}
.sv-profile-stepper{display:flex;align-items:center;gap:.6rem;margin:0 0 .5rem;font-size:.85rem}
.sv-profile-step{padding:.2rem .55rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;color:#1f2933;font:inherit;font-size:.8rem;cursor:pointer}
.sv-profile-step:hover:not(:disabled){border-color:#8a94a6;background:#f6f8fa}
.sv-profile-step:disabled{opacity:.45;cursor:default}
.sv-profile-step:focus-visible,.sv-profile-stepper:focus-visible{outline:2px solid #0b62a4;outline-offset:1px}
.sv-profile-step-count{font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:no-preference){.sv-profile-root{scroll-behavior:smooth}}`;

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
