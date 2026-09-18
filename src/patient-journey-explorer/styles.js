// The injected stylesheet for the patient-journey-explorer module (#142,
// design §6.1, §6.6, §6.7, §8, D12). Uses the sv-pje-* prefix and is injected
// once per document, alongside (never replacing) the shared shell stylesheet.
//
// Every colour the module paints is declared as a `--pje-*` custom property on
// `.sv-pje-root`, generated from the palette so the names match what
// `resolveTheme` reads back for the canvas (D12). The light block is active by
// default. Both dark blocks are present but OPT-IN: `:root[data-theme="dark"]`
// forces dark, and the `prefers-color-scheme: dark` block applies only under
// `:root[data-theme="auto"]` — the rest of the library and the demo site are
// light-only, and a dark-OS visitor must not be shown a dark chart card inside
// a light page. This is the one place the module is "ready" for a theme
// mechanism the repo does not yet have; it adds no toggle.
//
// Text colours never go below `--pje-ink-secondary` (#52616f, 7.0:1 on white):
// the library's muted ink measures 3.51:1 and appears nowhere here
// (PJE-ACC-003).

import { PJE_PALETTE } from './palette.js';
import { PLOT_GUTTER_LEFT, PLOT_GUTTER_RIGHT } from './getScales.js';

const STYLE_ID = 'safety-viz-patient-journey-styles';

const propertyName = (key) => `--pje-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * The `--pje-*` declarations for one palette mode.
 * @private
 */
function tokenBlock(mode) {
  return Object.entries(PJE_PALETTE[mode])
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => `${propertyName(key)}:${value}`)
    .join(';');
}

/**
 * The full module stylesheet, built once at first injection.
 * @private
 */
function moduleCss() {
  const L = PLOT_GUTTER_LEFT;
  const R = PLOT_GUTTER_RIGHT;
  return `
.sv-pje-root{${tokenBlock('light')}}
:root[data-theme=dark] .sv-pje-root{${tokenBlock('dark')}}
@media (prefers-color-scheme:dark){:root[data-theme=auto] .sv-pje-root{${tokenBlock('dark')}}}

/* --- the lane stack inside the shell's chart card (design §6.1) ------------ */
.sv-root.safety-patient-journey{--sv-rail-width:360px}
.safety-patient-journey .sv-chart-wrap{height:auto;padding:.75rem .75rem .5rem;background:var(--pje-surface);color:var(--pje-ink-primary)}
.sv-pje-lanes{position:relative;overflow-y:auto;overflow-x:hidden}
.sv-pje-note{margin:.5rem 0;font-size:.85rem;color:var(--pje-ink-secondary)}
.sv-pje-group{margin:0 0 .3rem}
.sv-pje-group-toggle{display:flex;align-items:center;gap:.4rem;width:100%;border:0;border-bottom:1px solid var(--pje-border);background:transparent;color:var(--pje-ink-secondary);font:inherit;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:.3rem 0 .25rem;margin:0 0 .25rem;cursor:pointer;text-align:left}
.sv-pje-group-toggle::before{content:"\\25BE";font-size:.7rem}
.sv-pje-group-toggle[aria-expanded=false]::before{content:"\\25B8"}
.sv-pje-group-toggle:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}
.sv-pje-group-body[hidden]{display:none}
.sv-pje-lane{position:relative;box-sizing:border-box;margin:0 0 2px}
.sv-pje-lane-canvas{position:absolute;inset:0}
.sv-pje-canvas{display:block;width:100%;height:100%}
.sv-pje-lane-label{position:absolute;left:0;top:0;bottom:0;width:${L}px;box-sizing:border-box;padding:0 .5rem 0 0;display:flex;flex-direction:column;justify-content:center;font-size:.74rem;line-height:1.2;color:var(--pje-ink-secondary);pointer-events:none;overflow:hidden;z-index:1}
.sv-pje-lane-label strong{color:var(--pje-ink-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-pje-lane-label small{font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-pje-lane-empty{position:absolute;left:${L}px;right:${R}px;top:0;bottom:0;display:flex;align-items:center;font-size:.78rem;color:var(--pje-ink-secondary)}
.sv-pje-lane-foot{margin:.05rem 0 .3rem ${L}px;font-size:.72rem;color:var(--pje-ink-secondary)}

/* --- the keyboard overlay: real buttons over the canvas (design §8) -------- */
.sv-pje-marks{position:absolute;inset:0;pointer-events:none;z-index:2}
.sv-pje-mark{position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;border-radius:3px}
.sv-pje-mark:focus{outline:none}
.sv-pje-mark:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:2px;box-shadow:0 0 0 2px var(--pje-focus-separator)}

/* --- the one shared axis strip, pinned below the stack (design §6.2) ------- */
.sv-pje-axis{position:relative;margin:.35rem 0 0;padding:0 ${R}px 0 ${L}px;height:2.3rem}
.sv-pje-axis-title{position:absolute;left:0;top:0;width:${L}px;box-sizing:border-box;padding:.35rem .5rem 0 0;font-size:.7rem;font-weight:600;color:var(--pje-ink-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-pje-axis-track{position:relative;height:100%;border-top:1px solid var(--pje-border)}
.sv-pje-axis-tick{position:absolute;top:0;transform:translateX(-50%);padding-top:.35rem;font-size:.68rem;color:var(--pje-ink-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.sv-pje-axis-tick::before{content:"";position:absolute;left:50%;top:-1px;width:1px;height:4px;background:var(--pje-ink-secondary)}
.sv-pje-axis-tick.is-anchor{font-weight:700;color:var(--pje-ink-primary)}
.sv-pje-axis-tick.is-anchor::before{width:2px;background:var(--pje-rule-anchor)}

/* --- the tooltip and the footnote line (design §6.5, §6.7) ----------------- */
.sv-pje-tooltip{position:absolute;z-index:5;max-width:320px;padding:.4rem .55rem;border-radius:6px;background:var(--pje-ink-primary);color:var(--pje-surface);font-size:.76rem;line-height:1.35;pointer-events:none;white-space:pre-line;box-shadow:0 4px 14px rgba(31,41,51,.18)}
.sv-pje-tooltip[hidden]{display:none}
.sv-pje-footnote-text{margin-right:.5rem}
.sv-pje-open-source{border:1px solid var(--pje-border);background:var(--pje-surface);color:var(--pje-ink-primary);border-radius:6px;font:inherit;font-size:.75rem;padding:.2rem .5rem;cursor:pointer}
.sv-pje-open-source:hover{border-color:var(--pje-focus-ring)}
.sv-pje-open-source:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}

/* --- sidebar additions (design §7) ---------------------------------------- */
.sv-pje-subject-list{width:100%;font:inherit;font-size:.82rem;margin-top:.35rem}
.sv-pje-subject-count{margin:.25rem 0 0;font-size:.72rem;color:var(--pje-ink-secondary)}
.sv-pje-sidebar-note{margin:.35rem 0 0;font-size:.72rem;color:var(--pje-ink-secondary)}
.sv-pje-lane-toggle{display:flex;align-items:center;gap:.4rem;font-size:.8rem;font-weight:400;margin:.15rem 0;cursor:pointer}
.sv-pje-lane-toggle input{width:auto;margin:0;accent-color:var(--pje-focus-ring)}
.sv-pje-lane-toggle.is-disabled{color:var(--pje-ink-secondary);cursor:default}

/* --- the anchor context panel in the shell rail (design §6.6) -------------- */
.sv-pje-panel{display:flex;flex-direction:column;min-height:0;height:100%;font-size:.82rem;color:var(--pje-ink-primary)}
.sv-pje-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem;padding:.55rem .7rem;border-bottom:1px solid var(--pje-border);background:var(--pje-panel);flex:0 0 auto}
.sv-pje-panel-title{margin:0;font-size:.95rem;font-weight:700}
.sv-pje-panel-title:focus{outline:none}
.sv-pje-panel-sub{margin:.1rem 0 0;font-size:.75rem;color:var(--pje-ink-secondary)}
.sv-pje-panel-actions{display:flex;gap:.35rem;flex:0 0 auto}
.sv-pje-btn{border:1px solid var(--pje-border);background:var(--pje-surface);color:var(--pje-ink-primary);border-radius:6px;font:inherit;font-size:.75rem;padding:.3rem .5rem;cursor:pointer;white-space:nowrap}
.sv-pje-btn:hover:not(:disabled){border-color:var(--pje-focus-ring)}
.sv-pje-btn:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}
.sv-pje-btn:disabled{opacity:.5;cursor:default}
.sv-pje-panel-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:.6rem .7rem}
.sv-pje-section{margin:0 0 .8rem}
.sv-pje-section h3{margin:0 0 .3rem;font-size:.82rem;font-weight:700}
.sv-pje-section h4{margin:.45rem 0 .2rem;font-size:.74rem;font-weight:600;color:var(--pje-ink-secondary)}
.sv-pje-section-note{margin:0 0 .3rem;font-size:.72rem;color:var(--pje-ink-secondary)}
.sv-pje-honesty{margin:.15rem 0 .3rem;font-size:.74rem;color:var(--pje-warning)}
.sv-pje-empty{margin:.1rem 0;font-size:.76rem;color:var(--pje-ink-secondary);font-style:italic}
.sv-pje-items{list-style:none;margin:0;padding:0}
.sv-pje-item{display:block;width:100%;text-align:left;border:1px solid transparent;background:none;font:inherit;font-size:.78rem;line-height:1.3;padding:.25rem .4rem;border-radius:4px;cursor:pointer;color:var(--pje-ink-primary)}
.sv-pje-item:hover{background:var(--pje-panel);border-color:var(--pje-border)}
.sv-pje-item:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:-2px}
.sv-pje-item small{display:block;color:var(--pje-ink-secondary);font-size:.7rem}
.sv-pje-panel-foot{margin:.5rem 0 0;padding-top:.5rem;border-top:1px solid var(--pje-border);font-size:.74rem;color:var(--pje-ink-secondary)}

/* --- the source-row drawer (design §6.7) ---------------------------------- */
.sv-pje-drawer>summary{cursor:pointer;font-size:.85rem;font-weight:600;padding:.3rem 0}
.sv-pje-drawer>summary:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}
.sv-pje-drawer-domain{margin:.5rem 0 .9rem}
.sv-pje-drawer-domain h3{margin:0 0 .3rem;font-size:.8rem}
.sv-pje-drawer-scroll{overflow-x:auto}
.sv-pje-drawer table{font-size:.76rem}
.sv-pje-drawer th{cursor:default}
.sv-pje-drawer td{white-space:nowrap;max-width:18rem;overflow:hidden;text-overflow:ellipsis}
.sv-pje-drawer a{color:var(--pje-focus-ring)}
.sv-pje-drawer tbody tr:focus{outline:2px solid var(--pje-focus-ring);outline-offset:-2px}
@media (prefers-reduced-motion:no-preference){.sv-pje-drawer tbody tr.is-flashed{background:#fff3c4;transition:background .2s ease}}

/* --- the persistent live region (design §8) -------------------------------- */
.sv-pje-live{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
}

/**
 * Inject the module-specific stylesheet once per document; a second explorer
 * on the page, or any re-render, is a no-op.
 * @returns {void}
 */
export function applyPjeStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = moduleCss();
  document.head.append(style);
}
