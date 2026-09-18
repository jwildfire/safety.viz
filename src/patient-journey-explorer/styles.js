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
/* The shell pins its annotation to the card's top-right corner, which here is
   the first lane group — the pill covered the group header and the end of the
   exposure bar. The lanes fill the card, so the hint sits in flow beneath the
   axis strip instead, where it also links to the panel on a stacked layout. */
.safety-patient-journey .sv-main-annotation{position:static;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin:.5rem 0 0;padding:.3rem .5rem;font-size:.78rem;color:var(--pje-ink-secondary)}
.safety-patient-journey .sv-main-annotation:empty{display:none}
/* The notice above the lane stack (PJE-ANCH-006): the one line a first-time
   reviewer needs — that the marks are clickable and what clicking shows. */
.sv-pje-cue{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .5rem;margin:0 0 .6rem;padding:.55rem .75rem;border:1px solid var(--pje-border);border-left:4px solid var(--pje-focus-ring);border-radius:6px;background:var(--pje-panel);font-size:.84rem;line-height:1.4;color:var(--pje-ink-primary)}
.sv-pje-cue[hidden]{display:none}
.sv-pje-cue strong{font-weight:700}
.sv-pje-annotation-link{border:0;background:none;padding:0;font:inherit;color:var(--pje-focus-ring);text-decoration:underline;cursor:pointer}
.sv-pje-annotation-link:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}
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
.sv-pje-lane-label small{font-size:.68rem;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
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
.sv-pje-panel-title{margin:0;font-family:inherit;font-size:.95rem;font-weight:700}
.sv-pje-panel-title:focus{outline:none}
.sv-pje-panel-sub{margin:.1rem 0 0;font-size:.75rem;color:var(--pje-ink-secondary)}
.sv-pje-panel-actions{display:flex;gap:.35rem;flex:0 0 auto}
.sv-pje-btn{border:1px solid var(--pje-border);background:var(--pje-surface);color:var(--pje-ink-primary);border-radius:6px;font:inherit;font-size:.75rem;padding:.3rem .5rem;cursor:pointer;white-space:nowrap}
.sv-pje-btn:hover:not(:disabled){border-color:var(--pje-focus-ring)}
.sv-pje-btn:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}
.sv-pje-btn:disabled{opacity:.5;cursor:default}
.sv-pje-panel-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:.6rem .7rem}
.sv-pje-section{margin:0 0 .8rem}
.sv-pje-section h3{margin:0 0 .3rem;font-family:inherit;font-size:.82rem;font-weight:700}
.sv-pje-section h4{margin:.45rem 0 .2rem;font-family:inherit;font-size:.74rem;font-weight:600;color:var(--pje-ink-secondary)}
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
.sv-pje-drawer-domain h3{margin:0 0 .3rem;font-family:inherit;font-size:.8rem}
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
  style.textContent = moduleCss() + narrativeCss();
  document.head.append(style);
}

/**
 * The AI narrative card styles (#146): light-blue, labelled, one chip per
 * sentence. Appended to the module stylesheet by applyPjeStyles.
 * @private
 */
export function narrativeCss() {
  return `
/* --- the AI narrative cards (#146, PJE-NARR-009 … 014) --------------------- */
.sv-pje-root{--pje-ai-bg:#e8f3fc;--pje-ai-border:#9fc7ea;--pje-ai-ink:#0f3a5f;--pje-ai-chip:#d4e8f9;--pje-ai-chip-ink:#0f3a5f;--pje-ai-accepted:#d7f0dd;--pje-ai-accepted-ink:#1b5e33}
:root[data-theme=dark] .sv-pje-root{--pje-ai-bg:#12283a;--pje-ai-border:#2f5d84;--pje-ai-ink:#d8ecff;--pje-ai-chip:#1d3d5a;--pje-ai-chip-ink:#d8ecff;--pje-ai-accepted:#1c3f2a;--pje-ai-accepted-ink:#bfe8cc}
.sv-pje-ai{box-sizing:border-box;margin:0 0 .6rem;padding:.55rem .75rem .6rem;border:1px solid var(--pje-ai-border);border-left:5px solid var(--pje-ai-border);border-radius:8px;background:var(--pje-ai-bg);color:var(--pje-ai-ink);font-size:.82rem;line-height:1.45}
.sv-pje-ai.is-stale .sv-pje-ai-summary,.sv-pje-ai.is-stale .sv-pje-ai-sentence{color:var(--pje-ink-secondary);opacity:.72}
.sv-pje-ai.is-loading{opacity:.85}
.sv-pje-ai-head{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .55rem;margin:0 0 .3rem}
.sv-pje-ai-label{display:inline-block;padding:.1rem .45rem;border-radius:999px;background:var(--pje-ai-ink);color:var(--pje-ai-bg);font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.sv-pje-ai-title{font-weight:700;font-size:.86rem}
.sv-pje-ai-chip{display:inline-block;padding:.05rem .4rem;border-radius:999px;background:var(--pje-ai-chip);color:var(--pje-ai-chip-ink);border:1px solid var(--pje-ai-border);font-size:.66rem;font-weight:600;white-space:nowrap;vertical-align:middle}
.sv-pje-ai-chip.is-accepted{background:var(--pje-ai-accepted);color:var(--pje-ai-accepted-ink);border-color:var(--pje-ai-accepted-ink)}
.sv-pje-ai-toggle{margin-left:auto;border:1px solid var(--pje-ai-border);background:var(--pje-surface);color:var(--pje-ai-ink);border-radius:6px;font:inherit;font-size:.74rem;padding:.2rem .5rem;cursor:pointer}
.sv-pje-ai-toggle:hover{border-color:var(--pje-ai-ink)}
.sv-pje-ai-toggle:focus-visible,.sv-pje-ai-cite:focus-visible,.sv-pje-ai-action:focus-visible,.sv-pje-ai-request-btn:focus-visible{outline:2px solid var(--pje-focus-ring);outline-offset:1px}
.sv-pje-ai-summary{margin:0;font-size:.84rem}
.sv-pje-ai-summary.is-pending{font-style:italic;color:var(--pje-ink-secondary)}
.sv-pje-ai-summary.is-refused{font-style:italic}
.sv-pje-ai-body{margin:.45rem 0 0;padding-top:.45rem;border-top:1px dashed var(--pje-ai-border)}
.sv-pje-ai-body[hidden]{display:none}
.sv-pje-ai-sentence{margin:0 0 .4rem}
.sv-pje-ai-sentence .sv-pje-ai-chip{margin-right:.15rem}
.sv-pje-ai-cites{display:inline-flex;flex-wrap:wrap;gap:.2rem;vertical-align:middle}
.sv-pje-ai-cite{border:1px solid var(--pje-ai-border);background:var(--pje-surface);color:var(--pje-ai-ink);border-radius:4px;font:inherit;font-size:.68rem;padding:.02rem .35rem;cursor:pointer;max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sv-pje-ai-cite:hover{border-color:var(--pje-ai-ink);background:var(--pje-ai-chip)}
.sv-pje-ai-cite.is-off-timeline{border-style:dashed}
.sv-pje-ai-conf{margin-left:.35rem;font-size:.66rem;color:var(--pje-ink-secondary)}
.sv-pje-ai-stale{margin:0 0 .4rem;padding:.3rem .5rem;border-radius:6px;background:var(--pje-surface);border:1px solid var(--pje-warning);color:var(--pje-warning);font-size:.76rem;opacity:1}
.sv-pje-ai-flags{margin:.2rem 0 .3rem;display:flex;flex-wrap:wrap;gap:.25rem}
.sv-pje-ai-flag{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.66rem;padding:.02rem .35rem;border-radius:4px;background:var(--pje-surface);border:1px solid var(--pje-ai-border)}
.sv-pje-ai-actions{display:flex;flex-wrap:wrap;gap:.3rem;margin:.35rem 0 .25rem}
.sv-pje-ai-action.is-accept{border-color:var(--pje-ai-accepted-ink)}
.sv-pje-ai-prov{margin:.2rem 0 0;font-size:.66rem;color:var(--pje-ink-secondary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.sv-pje-ai-foot{margin:.25rem 0 0;font-size:.7rem;color:var(--pje-ink-secondary)}
.sv-pje-ai-edit-row{display:block;margin:0 0 .4rem}
.sv-pje-ai-textarea{display:block;width:100%;box-sizing:border-box;margin:.15rem 0 0;font:inherit;font-size:.8rem;padding:.3rem .4rem;border:1px solid var(--pje-ai-border);border-radius:6px;background:var(--pje-surface);color:var(--pje-ink-primary)}
.sv-pje-ai-tray{margin:.55rem 0 0}
.sv-pje-ai-tray:empty{display:none}
.sv-pje-ai-tray-head{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .5rem;margin:0 0 .5rem;padding:.4rem .6rem;border:1px dashed var(--pje-ai-border);border-radius:8px;color:var(--pje-ai-ink);font-size:.78rem}
.sv-pje-ai-tray-hint{color:var(--pje-ink-secondary)}
.sv-pje-ai-request-btn{font-size:.74rem;padding:.15rem .5rem;border-color:var(--pje-ai-border);color:var(--pje-ai-ink)}
.sv-pje-ai-request-btn:hover{border-color:var(--pje-ai-ink);background:var(--pje-ai-chip)}
.sv-pje-narrative-banner:empty{display:none}
.sv-pje-panel-body>.sv-pje-ai{margin-bottom:.8rem}
/* a cited mark, lit from a citation chip (PJE-NARR-011) */
.sv-pje-mark.is-cited{outline:3px solid var(--pje-ai-ink);outline-offset:2px;box-shadow:0 0 0 3px var(--pje-ai-bg),0 0 0 6px var(--pje-ai-border);z-index:3}
@media (prefers-reduced-motion:no-preference){.sv-pje-mark.is-cited{animation:sv-pje-cite-pulse 1.2s ease-out 2}}
@keyframes sv-pje-cite-pulse{0%{box-shadow:0 0 0 3px var(--pje-ai-bg),0 0 0 6px var(--pje-ai-border)}50%{box-shadow:0 0 0 5px var(--pje-ai-bg),0 0 0 10px var(--pje-ai-border)}100%{box-shadow:0 0 0 3px var(--pje-ai-bg),0 0 0 6px var(--pje-ai-border)}}
`;
}
