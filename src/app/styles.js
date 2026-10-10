// Demo app: its look (#150, obot.roadmap#352). The rainbow-hex theme of
// jwildfire.github.io: paper and graphite, plum for links and active states, a
// seven-hue muted spectrum carried by small hexes, and a thin hex strip along
// the top of the header and the footer. Instrument Serif for titles, Instrument Sans for text, IBM Plex
// Mono for labels — each with a system fallback, because the single-file build
// loads nothing and must still read well.
//
// The spectrum is used with meaning, never as decoration alone:
//
//   green, teal, blue, violet, pink   the domains (subject, adverse events,
//                                     labs and vitals, ECG, outside the set)
//   red                               something a chart needs is missing
//   amber                             a guess
//   plum                              chosen by hand
//
// A group another chart library declares (#181), and a library's own tab, has
// a colour too (#268): the one the library names, or the first of pink, amber
// and green that no tab in the header uses (libraries.js::tabColours). The
// page sets it on the tab, the chart names and the chart's card as --hue. No
// tab is grey, and red is never given to one.
//
// Colour is always on a hex beside words; the words stay graphite, so nothing
// is said by colour alone.
//
// One stylesheet, injected once by the page. Every class is prefixed `sva-`;
// the charts keep their own `sv-` shell styles.

/** The seven-hex mark: a graphite centre and six hues of the spectrum. */
export const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<polygon points="50.0,33.3 64.4,41.7 64.4,58.3 50.0,66.7 35.6,58.3 35.6,41.7" fill="#1f2328"/>' +
  '<polygon points="82.1,33.3 96.5,41.7 96.5,58.3 82.1,66.7 67.6,58.3 67.6,41.7" fill="#d87972"/>' +
  '<polygon points="66.0,61.1 80.5,69.4 80.5,86.1 66.0,94.4 51.6,86.1 51.6,69.4" fill="#c78a3b"/>' +
  '<polygon points="34.0,61.1 48.4,69.4 48.4,86.1 34.0,94.4 19.5,86.1 19.5,69.4" fill="#77a95b"/>' +
  '<polygon points="17.9,33.3 32.4,41.7 32.4,58.3 17.9,66.7 3.5,58.3 3.5,41.7" fill="#00afa9"/>' +
  '<polygon points="34.0,5.6 48.4,13.9 48.4,30.6 34.0,38.9 19.5,30.6 19.5,13.9" fill="#519fdd"/>' +
  '<polygon points="66.0,5.6 80.5,13.9 80.5,30.6 66.0,38.9 51.6,30.6 51.6,13.9" fill="#988bdd"/>' +
  '</svg>';

/**
 * The mark as an address a page can use for its favicon (#270): the docs site
 * and the demo app's page both do, so one tab's icon says both are safety.viz.
 */
export const LOGO_HREF = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG).replace(/'/g, '%27')}`;

// A row of hex outlines one band tall, and a single hex outline; both are
// masks, so whatever colour sits behind shows through the strokes.
const HEX_STRIP =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg' width%3D'6.928' height%3D'9.000' viewBox%3D'0 0 6.928 9.000'%3E%3Cg fill%3D'none' stroke%3D'%23000' stroke-width%3D'0.9'%3E%3Cpolygon points%3D'3.464%2C0.50 6.928%2C2.50 6.928%2C6.50 3.464%2C8.50 0.000%2C6.50 0.000%2C2.50'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E\")";
const HEX_OUTLINE =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg' viewBox%3D'0 0 20 23'%3E%3Cpolygon points%3D'10%2C1.6 18.2%2C6.3 18.2%2C16.7 10%2C21.4 1.8%2C16.7 1.8%2C6.3' fill%3D'none' stroke%3D'%23000' stroke-width%3D'2.6'%2F%3E%3C%2Fsvg%3E\")";

export const STYLES = `
.sva-app{--bg:#fafaf8;--rail:#f3f4f1;--ink:#1f2328;--soft:#5b6470;--faint:#98a0aa;--accent:#6c3270;--accent-deep:#522456;--accent-soft:rgba(108,50,112,.1);--card:#fff;--rule:#e4e6e3;--line:#cfd3cf;--alarm:#a2423a;
--s0:#d87972;--s1:#c78a3b;--s2:#77a95b;--s3:#00afa9;--s4:#519fdd;--s5:#988bdd;--s6:#c67bb6;
--spec:linear-gradient(90deg,var(--s0),var(--s1),var(--s2),var(--s3),var(--s4),var(--s5),var(--s6));
--spec-diag:linear-gradient(135deg,var(--s0),var(--s1),var(--s2),var(--s3),var(--s4),var(--s5),var(--s6));
--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Instrument Serif",Georgia,"Times New Roman",serif;--mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
--gutter:clamp(.9rem,2.5vw,2rem);
display:flex;flex-direction:column;min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:1rem;line-height:1.5;-webkit-font-smoothing:antialiased}
.sva-app *,.sva-app *::before,.sva-app *::after{box-sizing:border-box}
.sva-app :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sva-app [hidden]{display:none}
.sva-domain-subject{--hue:var(--s2)}.sva-domain-ae{--hue:var(--s3)}.sva-domain-bds{--hue:var(--s4)}.sva-domain-eg{--hue:var(--s5)}.sva-domain-other{--hue:var(--s6)}

.sva-header::before,.sva-footer::before{content:"";position:absolute;left:0;right:0;top:0;height:9px;background:var(--spec);-webkit-mask:${HEX_STRIP} left top/auto 9px repeat-x;mask:${HEX_STRIP} left top/auto 9px repeat-x}
.sva-hex{display:inline-block;flex:none;width:.74em;height:.84em;background:var(--hue,var(--faint));clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.sva-hex.sva-hollow{clip-path:none;background:var(--faint);-webkit-mask:${HEX_OUTLINE} center/contain no-repeat;mask:${HEX_OUTLINE} center/contain no-repeat}
.sva-hex.sva-spectrum{background:var(--spec-diag)}
.sva-hex.sva-alarm{background:var(--s0)}

.sva-header{position:relative;background:var(--rail);border-bottom:1px solid var(--rule);padding-top:9px}
.sva-bar{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;padding:.5rem var(--gutter)}
.sva-brand{display:flex;align-items:center;gap:.5rem;margin-right:.3rem;color:inherit;text-decoration:none}
.sva-logo{flex:none;width:1.9rem;height:1.9rem}
.sva-logo svg{display:block;width:100%;height:100%}
.sva-wordmark{font-family:var(--serif);font-size:1.65rem;line-height:1;letter-spacing:-.01em;color:var(--ink)}
.sva-kicker{align-self:flex-end;padding-bottom:.12rem;font-family:var(--mono);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);white-space:nowrap}
.sva-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem}
.sva-appstatus{margin-left:auto;display:flex;align-items:center}
.sva-item,.sva-tab{position:relative;display:inline-flex;align-items:center;gap:.45rem;border:1px solid transparent;border-radius:999px;background:none;color:var(--ink);font:inherit;font-size:.86rem;line-height:1.2;white-space:nowrap;padding:.36rem .62rem;cursor:pointer}
.sva-item:hover,.sva-tab:hover{background:var(--accent-soft)}
.sva-tab[aria-pressed=true],.sva-item[aria-current=page]{background:var(--card);border-color:var(--hue,var(--accent));box-shadow:0 1px 0 var(--rule)}
.sva-item[aria-current=page]{font-weight:600;background:color-mix(in srgb,var(--hue,var(--accent)) 14%,var(--card));box-shadow:inset 0 0 0 1px var(--hue,var(--accent))}
.sva-tag,.sva-tab-count{font-family:var(--mono);font-size:.64rem;font-weight:500;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;color:var(--soft)}
.sva-tag.sva-missing{color:var(--alarm)}
.sva-charts{display:flex;align-items:center;border-top:1px solid var(--rule);background:var(--bg);padding:.22rem var(--gutter)}
.sva-group{position:relative;display:flex;flex:1 1 auto;min-width:0;flex-wrap:nowrap;align-items:center;gap:.1rem;max-width:100%;overflow-x:auto;scrollbar-width:none}
.sva-group::-webkit-scrollbar{display:none}
.sva-charts .sva-item{flex:none;gap:.38rem;font-size:.8rem;padding:.26rem .55rem}
.sva-action{flex:none;font-family:var(--mono);font-size:.66rem;font-weight:500;line-height:1;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);background:var(--card);border:1px solid var(--accent);border-radius:999px;padding:.36rem .7rem;cursor:pointer;white-space:nowrap}
.sva-action:hover:not(:disabled){background:var(--accent-soft)}
.sva-action:disabled{color:var(--soft);border-color:var(--line);cursor:default}
.sva-r{flex:none;display:flex;align-items:center;min-height:1.6rem;margin-left:auto;padding-left:.8rem;border-left:1px solid var(--rule)}
.sva-r-row{display:inline-flex;align-items:center;gap:.6rem}
.sva-r-say{font-size:.78rem;color:var(--soft);white-space:nowrap}
.sva-r-say.sva-bad{color:var(--alarm)}
.sva-r-meta{font-family:var(--mono);font-size:.64rem;letter-spacing:.04em;color:var(--soft);white-space:nowrap}
.sva-chip{display:inline-flex;align-items:center;gap:.42rem;font-family:var(--mono);font-size:.6rem;font-weight:500;line-height:1;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.36rem .62rem;cursor:pointer;white-space:nowrap}
.sva-chip:hover:not(:disabled),.sva-chip[aria-expanded=true]{border-color:var(--accent);color:var(--accent)}
.sva-chip:disabled{cursor:default}
.sva-dot{flex:none;width:.5rem;height:.5rem;border-radius:50%;background:var(--s2)}
.sva-caret{font-size:.9em;color:var(--soft)}
.sva-spin{flex:none;width:.85rem;height:.85rem;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:sva-spin .9s linear infinite}
@keyframes sva-spin{to{transform:rotate(360deg)}}
.sva-segs{display:inline-flex;gap:3px}
.sva-segs i{width:22px;height:5px;border-radius:3px;background:var(--line)}
.sva-segs i.sva-done{background:var(--accent)}
.sva-segs i.sva-now{background:var(--accent);opacity:.45}
.sva-r-under{position:relative;height:0}
.sva-r-panel{position:absolute;top:8px;right:var(--gutter);z-index:25;width:20.5rem;max-width:calc(100vw - 1rem);padding:1rem 1.1rem .8rem;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px rgba(31,35,40,.16);font-size:.84rem;line-height:1.45;color:var(--ink)}
.sva-app .sva-r-heading{margin:0 1.6rem .55rem 0;font-family:var(--serif);font-weight:normal;font-size:1.25rem;line-height:1.2}
.sva-app .sva-r-text{margin:0 0 .6rem;max-width:none}
.sva-app .sva-r-list{display:grid;grid-template-columns:auto 1fr;gap:.25rem .8rem;margin:0 0 .3rem;font-size:.8rem}
.sva-r-list dd{margin:0}
.sva-r-list dt{font-family:var(--mono);font-size:.58rem;font-weight:500;line-height:1.7;letter-spacing:.07em;text-transform:uppercase;color:var(--soft)}
.sva-r-more{margin:.2rem 0 .4rem}
.sva-r-more summary{cursor:pointer;color:var(--soft);margin-bottom:.3rem}
.sva-app .sva-r-actions{display:flex;gap:.5rem;margin:.7rem 0 .2rem}
.sva-r-x{position:absolute;top:.5rem;right:.55rem}
.sva-r-panel.sva-r-wide{width:52rem;max-width:calc(100vw - 2 * var(--gutter));max-height:calc(100vh - 7rem);overflow:auto}
.sva-r-cols{display:grid;grid-template-columns:1fr 1.5fr 1.2fr;gap:1.6rem;margin:.7rem 0 .9rem;font-size:.82rem}
.sva-app .sva-r-title{margin:0 0 .4rem;font:500 .62rem/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.sva-app .sva-r-title:not(:first-child){margin-top:.9rem}
.sva-r-steps,.sva-r-items{list-style:none;margin:0;padding:0}
.sva-r-steps li{display:flex;align-items:center;gap:.45rem;margin:0;padding:.16rem 0}
.sva-r-note{margin-left:auto;font-family:var(--mono);font-size:.7rem;color:var(--soft);white-space:nowrap}
.sva-r-items li{margin:0;padding:.22rem 0;border-bottom:1px solid var(--rule);overflow-wrap:anywhere}
.sva-r-items li:last-child{border-bottom:0}
.sva-r-cols .sva-r-list{margin:0}
.sva-app .sva-r-col .sva-r-text{margin:.45rem 0 0;color:var(--soft)}
@media (prefers-reduced-motion:reduce){.sva-spin{animation:none}}
.sva-app .sva-group-title,.sva-app .sva-title,.sva-count,.sva-charts .sva-tag.sva-ready{position:absolute;width:1px;height:1px;margin:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

.sva-main{flex:1;min-width:0;padding:1.1rem var(--gutter) 2.2rem}
.sva-sechead{position:relative}
.sva-button{appearance:none;display:inline-flex;align-items:center;gap:.45em;font:500 .7rem/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.42rem .8rem;cursor:pointer;transition:color 120ms ease,border-color 120ms ease}
.sva-button:hover{color:var(--accent);border-color:var(--accent)}
.sva-content{min-width:0}
.sva-corner{position:relative;height:0;z-index:6}
.sva-corner>.sv-status{position:absolute;top:-.74rem;right:1rem}
.sva-chart{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:1rem;min-width:0}
.sva-message{margin:0 0 1rem;max-width:62rem;padding:.9rem 1.1rem;background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:10px}
.sva-message.sva-problem{border-left-color:var(--s0)}
.sva-chart-links{margin:.75rem 0 0;font-family:var(--mono);font-size:.72rem;line-height:1.6;color:var(--soft)}
.sva-chart-links a{white-space:nowrap;color:var(--ink);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:.2em}
.sva-chart-links a:hover{color:var(--accent);text-decoration-color:var(--accent)}
.sva-welcome{display:flex;align-items:center;gap:.8rem;margin:0 0 1.15rem;padding:.5rem .5rem .5rem 1rem;background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:10px;font-size:.86rem}
.sva-app .sva-welcome p{margin:0;flex:1;min-width:0}
.sva-welcome a{color:var(--accent-deep);text-underline-offset:.2em}
.sva-close{flex:none;width:1.7rem;height:1.7rem;padding:0;border:0;border-radius:50%;background:none;color:var(--soft);font-family:inherit;font-size:1.15rem;line-height:1;cursor:pointer}
.sva-close:hover{background:var(--accent-soft);color:var(--accent)}
.sva-notes{margin:0 0 1rem;padding:0;list-style:none;max-width:62rem}
.sva-note{margin:0 0 .45rem;padding:.6rem 1rem;background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--s1);border-radius:10px;font-size:.92rem}

.sva-rbqm{min-width:0;max-width:100%}
.sva-rbqm-files{margin:0 0 1.1rem;padding:.7rem 1rem;background:var(--card);border:1px solid var(--rule);border-radius:10px;min-width:0}
.sva-rbqm-files-summary{cursor:pointer;font-size:.92rem}
.sva-rbqm-files[open] .sva-rbqm-files-summary{margin:0 0 .7rem}
.sva-rbqm-files .sva-rbqm-drop{margin:0 0 .8rem;padding:.9rem .8rem}
.sva-rbqm-files .sva-rbqm-drop p{font-size:1.05rem}
.sva-rbqm-choose{margin:0 0 .5rem}
.sva-app .sva-rbqm-subheading{margin:.7rem 0 .3rem;font-family:var(--mono);font-size:.68rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--soft)}
.sva-app .sva-rbqm-aside{margin:0 0 .4rem;font-size:.8rem;color:var(--soft)}
.sva-rbqm-loaded,.sva-rbqm-support{margin:0;padding:0;list-style:none;font-size:.88rem}
.sva-rbqm-loaded li,.sva-rbqm-support li{padding:.22rem 0;border-bottom:1px solid var(--rule);overflow-wrap:anywhere}
.sva-rbqm-loaded li:last-child,.sva-rbqm-support li:last-child{border-bottom:0}
.sva-rbqm-unused{color:var(--alarm)}
.sva-rbqm-cannot{color:var(--soft)}
.sva-rbqm-section{margin:0 0 1.1rem;padding:1rem;background:var(--card);border:1px solid var(--rule);border-radius:10px;min-width:0}
.sva-app .sva-rbqm-need{margin:0 0 .3rem;font-size:1.05rem}
.sva-app .sva-rbqm-need.sva-rbqm-problem{color:var(--alarm)}
.sva-app .sva-rbqm-supports{margin:0 0 1rem;font-size:.92rem;color:var(--soft)}
.sva-app .sva-rbqm-placeholder{margin:0;padding:2.4rem 1rem;border:1.5px dashed var(--line);border-radius:8px;text-align:center;color:var(--soft);font-size:.9rem}
.sva-link{appearance:none;border:0;background:none;padding:0;font:inherit;color:var(--accent-deep);text-decoration:underline;text-underline-offset:.2em;cursor:pointer}
.sva-rbqm-steps{list-style:none;margin:.9rem 0 .2rem;padding:0;max-width:26rem}
.sva-rbqm-steps li{display:flex;align-items:center;gap:.55rem;margin:0;padding:.24rem 0;border-bottom:1px solid var(--rule);font-size:.92rem;color:var(--soft)}
.sva-rbqm-steps li:last-child{border-bottom:0}
.sva-rbqm-steps li[data-state=done],.sva-rbqm-steps li[data-state=now]{color:var(--ink)}
.sva-rbqm-headrow{display:flex;align-items:baseline;flex-wrap:wrap;gap:.2rem .8rem;margin:0 0 .6rem}
.sva-app .sva-rbqm-headrow .sva-rbqm-heading{margin:0}
.sva-rbqm-count{font-family:var(--mono);font-size:.68rem;color:var(--soft)}
.sva-app .sva-rbqm-outcome{margin:0 0 .8rem;font-size:.92rem}
.sva-rbqm-ov{display:flex;flex-wrap:wrap;align-items:flex-start;gap:1rem 1.8rem}
.sva-rbqm-key{flex:1 1 15rem;min-width:15rem;font-size:.8rem;color:var(--soft)}
.sva-app .sva-rbqm-key .sva-rbqm-subheading{margin-top:0}
.sva-rbqm-key ul{list-style:none;margin:0 0 .5rem;padding:0;display:flex;flex-wrap:wrap;gap:.1rem 1.3rem}
.sva-rbqm-key li{display:flex;gap:.45rem;align-items:center;margin:0;padding:.12rem 0}
.sva-app .sva-rbqm-key p{margin:0}
.sva-flag-green{color:#3daf06}.sva-flag-amber{color:#feaa02}.sva-flag-red{color:#ff5859}.sva-flag-none{color:#828282}
.sva-rbqm-whybox{padding:.8rem 1.1rem;border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:8px;color:var(--ink)}
.sva-app .sva-rbqm-why{display:inline;margin:0}
.sva-ico{width:.95rem;height:.95rem;flex:none}
.sva-view-item .sva-ico{width:.92rem;height:.92rem}
.sva-ico-ran{color:#5f9e45}.sva-ico-cannot,.sva-ico-todo{color:#8b939d}
.sva-ico-running{color:var(--accent);animation:sva-spin 1.1s linear infinite}
@media (prefers-reduced-motion:reduce){.sva-ico-running,.sva-spin{animation:none}}
.sva-app .sva-rbqm-heading{margin:0 0 .6rem;font-family:var(--serif);font-weight:normal;font-size:1.35rem;line-height:1.2}
.sva-rbqm-table{max-height:26rem;overflow:auto;border:1px solid var(--rule);border-radius:8px}
.sva-rbqm-table table{width:100%;border-collapse:collapse;font-size:.84rem}
.sva-rbqm-table th{position:sticky;top:0;z-index:1;background:var(--bg);font-family:var(--mono);font-size:.62rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);text-align:center;padding:.4rem .35rem;border-bottom:1px solid var(--rule);cursor:pointer;white-space:nowrap}
.sva-rbqm-table td{padding:.22rem .35rem;border-bottom:1px solid var(--rule);text-align:center;white-space:nowrap}
.sva-rbqm-table th:first-child,.sva-rbqm-table td:first-child{text-align:left;padding-left:.7rem}
.sva-rbqm-table td.group-overview--metric{cursor:pointer}
.sva-rbqm-table.sva-rbqm-fit{flex:0 1 auto;min-width:0;width:fit-content;max-width:100%;max-height:none}
.sva-rbqm-fit table{width:auto;max-width:100%}
.sva-rbqm-fit th:not(:first-child),.sva-rbqm-fit td:not(:first-child){width:100px;max-width:100px}
.sva-rbqm-fit th:not(:first-child){overflow:hidden;text-overflow:ellipsis}
.sva-rbqm-fit th:first-child{min-width:9rem}
.sva-rbqm-fit td{height:2.2rem}
.sva-rbqm-figures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.sva-rbqm-figure{margin:0;min-width:0}
.sva-rbqm-chart{position:relative;height:24rem;min-width:0}
.sva-app .sva-rbqm-caption{margin:.3rem 0 0;font-size:.72rem;color:var(--soft)}

.sva-footer{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1.5rem;padding:1.15rem var(--gutter) .9rem;border-top:1px solid var(--rule);background:var(--rail);font-family:var(--mono);font-size:.72rem;color:var(--soft)}
.sva-pitch{margin:0}
.sva-links{margin:0 0 0 auto;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:.3rem 1.2rem}
.sva-links a{color:var(--soft);text-decoration:none}
.sva-links a:hover{color:var(--accent);text-decoration:underline;text-underline-offset:.2em}
.sva-version{color:var(--faint)}

.sva-data{display:grid;grid-template-columns:minmax(0,17rem) minmax(0,62rem);gap:1.5rem;align-items:start}
.sva-data-main{min-width:0}
.sva-side{position:sticky;top:1rem;max-height:calc(100vh - 2rem);overflow-y:auto;min-width:0;padding:.95rem 1rem;border:1px solid var(--rule);border-radius:10px;background:var(--card);font-size:.88rem}
.sva-side-section+.sva-side-section{margin-top:1rem;padding-top:.95rem;border-top:1px solid var(--rule)}
.sva-app .sva-side-title{margin:0 0 .6rem;font-family:var(--mono);font-size:.66rem;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--soft)}
.sva-steps{margin:0;padding:0;list-style:none}
.sva-step{display:grid;grid-template-columns:1.5rem minmax(0,1fr);gap:0 .6rem;align-items:start;padding-bottom:.95rem}
.sva-step:last-child{padding-bottom:0}
.sva-step-n{display:grid;place-items:center;width:1.5rem;height:1.7rem;background:var(--line);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);color:var(--soft);font:600 .72rem/1 var(--mono)}
.sva-step[data-state=current] .sva-step-n{background:var(--accent);color:#fff}
.sva-step[data-state=done] .sva-step-n{background:var(--ink);color:#fff}
.sva-step-title{display:block;font-weight:600;line-height:1.7rem}
.sva-step[data-state=todo] .sva-step-title{font-weight:500;color:var(--soft)}
.sva-step-status{display:block;font-family:var(--mono);font-size:.7rem;color:var(--soft)}
.sva-step-actions{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.55rem}
.sva-side .sva-study{width:100%;margin-top:.55rem}
.sva-app .sva-study-note{margin:.45rem 0 0;font-size:.78rem;line-height:1.45;color:var(--soft)}
.sva-loaded{margin:0 -.4rem;padding:0;list-style:none}
.sva-loaded-file{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 .5rem;align-items:baseline;width:100%;padding:.35rem .4rem;border:0;border-radius:8px;background:none;color:var(--ink);font:inherit;text-align:left;cursor:pointer}
.sva-loaded-file:hover{background:var(--accent-soft)}
.sva-loaded-name{font-family:var(--mono);font-weight:600;font-size:.8rem;overflow-wrap:anywhere}
.sva-loaded-detail,.sva-flags{grid-column:2;font-size:.76rem;color:var(--soft)}
.sva-flags:empty{display:none}
.sva-flag{display:inline-flex;align-items:center;gap:.4em;margin-right:.7rem;font-family:var(--mono);font-size:.64rem;font-weight:500;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.sva-flag::before{content:"";flex:none;width:.74em;height:.84em;background:var(--faint);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.sva-flag.sva-guess::before{background:var(--s1)}
.sva-flag.sva-missing{color:var(--alarm)}
.sva-flag.sva-missing::before{background:var(--s0)}
.sva-app .sva-loaded-empty{margin:0;font-size:.82rem;color:var(--soft)}
.sva-drop{margin:0 0 1.2rem;padding:1.5rem 1rem;border:1.5px dashed var(--faint);border-radius:12px;background:var(--card);text-align:center;color:var(--soft);transition:border-color 120ms ease,background 120ms ease}
.sva-drop.sva-over{border-color:var(--accent);background:var(--accent-soft);color:var(--ink)}
.sva-drop p{margin:0 0 .5rem;font-family:var(--serif);font-size:1.3rem;line-height:1.3;color:var(--ink)}
.sva-drop p.sva-drop-note{margin:0;font-family:var(--mono);font-size:.74rem;color:var(--soft)}
.sva-file{scroll-margin-top:1rem;margin:0 0 1.1rem;border:1px solid var(--rule);border-radius:10px;background:var(--card);overflow:hidden}
.sva-file-head{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .8rem;padding:.7rem 1rem;border-bottom:1px solid var(--rule)}
.sva-file.sva-unplaced .sva-file-head{border-bottom:0}
.sva-file.sva-raw .sva-file-head{border-bottom:0}
.sva-file-name{font-family:var(--mono);font-weight:600;font-size:.86rem;overflow-wrap:anywhere}
.sva-file-rows{font-family:var(--mono);font-size:.72rem;color:var(--soft)}
.sva-file-head .sva-tag{font-size:.7rem}
.sva-select{max-width:100%;padding:.34rem .5rem;border:1px solid var(--line);border-radius:8px;background:var(--card);font-family:var(--mono);font-size:.78rem;color:var(--ink)}
.sva-select:hover{border-color:var(--accent)}
.sva-scroll{overflow-x:auto}
.sva-map{width:100%;border-collapse:collapse;font-size:.9rem}
.sva-map th,.sva-map td{text-align:left;padding:.42rem 1rem;border-bottom:1px solid var(--rule);vertical-align:middle}
.sva-map tr:last-child td{border-bottom:0}
.sva-map th{font-family:var(--mono);font-size:.66rem;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);background:var(--bg)}
.sva-map .sva-select{width:100%;min-width:9rem;max-width:26rem}
.sva-map td:last-child{white-space:nowrap}
.sva-map-section td{background:var(--bg);font-family:var(--mono);font-size:.66rem;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--soft)}
.sva-map-hint td{color:var(--soft);font-size:.86rem}
.sva-map .sva-tag{display:inline-flex;align-items:center;gap:.45em;font-size:.66rem}
.sva-map .sva-tag::before{content:"";flex:none;width:.74em;height:.84em;background:var(--faint);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.sva-map .sva-tag.sva-same::before{background:var(--s2)}
.sva-map .sva-tag.sva-guess::before{background:var(--s1)}
.sva-map .sva-tag.sva-chosen::before{background:var(--accent)}
.sva-map .sva-tag.sva-missing::before{background:var(--s0)}

@media (max-width:900px){
.sva-rbqm-figures{grid-template-columns:minmax(0,1fr)}
.sva-rbqm-chart{height:20rem}
.sva-rbqm-section{padding:.6rem}
.sva-rbqm-table table{font-size:.74rem}
.sva-rbqm-table th,.sva-rbqm-table td{padding:.2rem .16rem}
.sva-rbqm-table th:first-child,.sva-rbqm-table td:first-child{padding-left:.35rem}
.sva-data{grid-template-columns:minmax(0,1fr);gap:1.1rem}
.sva-side{position:static;max-height:none}
.sva-loaded-file{display:flex;flex-wrap:wrap;gap:.1rem .55rem}
.sva-loaded-file .sva-flags{flex-basis:100%;padding-left:1.25rem}
}
@media (max-width:520px){
.sva-rbqm-table table{font-size:.7rem}
.sva-rbqm-table th{font-size:.625rem;letter-spacing:0;white-space:normal;vertical-align:bottom;padding:.25rem .08rem}
.sva-rbqm-table td{padding:.2rem .08rem}
.sva-rbqm-table th:first-child,.sva-rbqm-table td:first-child{padding-left:.3rem;white-space:normal}
}
@media (max-width:760px){
.sva-corner-view{height:auto;display:flex;justify-content:flex-end;margin:0 0 .45rem}
.sva-corner-view>.sv-status{position:static}
.sva-tabs{order:3;flex-basis:100%;min-width:0}
.sva-tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;max-width:100%}
.sva-tabs .sva-item,.sva-tab,.sva-charts .sva-item{min-height:44px}
.sva-bar,.sva-charts{min-width:0;max-width:100vw}
.sva-charts:has(>.sva-r){overflow-x:auto;scrollbar-width:none}
.sva-charts:has(>.sva-r) .sva-group{flex:none;max-width:none;overflow:visible}
.sva-r{order:-1;position:sticky;left:calc(-1 * var(--gutter));z-index:2;align-self:stretch;margin:0 .6rem 0 calc(-1 * var(--gutter));padding:0 .6rem 0 var(--gutter);background:var(--bg);border-left:0;border-right:1px solid var(--rule)}
.sva-r[data-phase="off"] .sva-r-say{display:none}
.sva-r-panel{left:.5rem;right:.5rem;width:auto}
.sva-r-panel.sva-r-wide{width:auto;max-width:none}
.sva-r-cols{grid-template-columns:1fr;gap:.4rem}
.sva-rbqm-fit th:first-child{min-width:0}
.sva-chart{padding:.6rem}
.sva-links{margin-left:0}
}
`;
