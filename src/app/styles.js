// Demo app: its look (#150, obot.roadmap#352). The rainbow-hex theme of
// jwildfire.github.io: paper and graphite, plum for links and active states, a
// seven-hue muted spectrum carried by small hexes, and a thin hex strip on the
// dividers. Instrument Serif for titles, Instrument Sans for text, IBM Plex
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
display:grid;grid-template-columns:18.5rem minmax(0,1fr);min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:1rem;line-height:1.5;-webkit-font-smoothing:antialiased}
.sva-app *,.sva-app *::before,.sva-app *::after{box-sizing:border-box}
.sva-app :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
.sva-domain-subject{--hue:var(--s2)}.sva-domain-ae{--hue:var(--s3)}.sva-domain-bds{--hue:var(--s4)}.sva-domain-eg{--hue:var(--s5)}.sva-domain-other{--hue:var(--s6)}

.sva-strip,.sva-rail::before,.sva-sechead::after{background:var(--spec);-webkit-mask:${HEX_STRIP} left top/auto 9px repeat-x;mask:${HEX_STRIP} left top/auto 9px repeat-x}
.sva-hex{display:inline-block;flex:none;width:.74em;height:.84em;background:var(--hue,var(--faint));clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.sva-hex.sva-hollow{clip-path:none;background:var(--faint);-webkit-mask:${HEX_OUTLINE} center/contain no-repeat;mask:${HEX_OUTLINE} center/contain no-repeat}
.sva-hex.sva-spectrum{background:var(--spec-diag)}
.sva-hex.sva-alarm{background:var(--s0)}

.sva-rail{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--rail);border-right:1px solid var(--rule);padding:1.9rem 1rem 1.1rem;display:flex;flex-direction:column;gap:1rem}
.sva-rail::before{content:"";position:absolute;left:0;right:0;top:0;height:9px}
.sva-brand{display:flex;align-items:center;gap:.65rem;padding:0 .35rem}
.sva-logo{flex:none;width:2.5rem;height:2.5rem}
.sva-logo svg{display:block;width:100%;height:100%}
.sva-wordmark{font-family:var(--serif);font-size:2.05rem;line-height:1;letter-spacing:-.01em;color:var(--ink)}
.sva-kicker{margin:.3rem 0 0;font-family:var(--mono);font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.sva-pitch{margin:0;padding:0 .35rem;color:var(--soft);font-size:.9rem;line-height:1.45}
.sva-button.sva-navtoggle{display:none}
.sva-nav{display:flex;flex-direction:column;gap:.1rem}
.sva-app .sva-group-title{display:flex;align-items:center;gap:.5rem;margin:.95rem .35rem .3rem;font-family:var(--mono);font-size:.68rem;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--ink)}
.sva-item{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .55rem;width:100%;border:0;border-radius:8px;background:none;color:var(--ink);font:inherit;font-size:.9rem;line-height:1.25;text-align:left;padding:.42rem .5rem;cursor:pointer}
.sva-item:hover{background:var(--accent-soft)}
.sva-item[aria-current=page]{background:var(--card);box-shadow:inset 0 0 0 1px var(--rule),inset 3px 0 0 var(--hue,var(--accent))}
.sva-item-title{flex:1 1 auto}
.sva-tag{flex:none;margin-left:auto;font-family:var(--mono);font-size:.64rem;font-weight:500;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;color:var(--soft)}
.sva-tag.sva-missing{color:var(--alarm)}
.sva-links{margin:auto 0 0;padding:.9rem .35rem 0;border-top:1px solid var(--rule);list-style:none;display:flex;flex-direction:column;gap:.4rem;font-family:var(--mono);font-size:.72rem}
.sva-links a{color:var(--soft);text-decoration:none}
.sva-links a:hover{color:var(--accent);text-decoration:underline;text-underline-offset:.2em}
.sva-version{color:var(--faint)}

.sva-main{min-width:0;padding:clamp(1.2rem,3vw,2.5rem)}
.sva-sechead{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:.6rem .9rem;border-bottom:1px solid var(--rule);padding-bottom:1rem;margin-bottom:1.4rem}
.sva-sechead::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:9px;opacity:.9}
.sva-app .sva-title{margin:0;font-family:var(--serif);font-weight:400;font-size:clamp(1.55rem,2.6vw,2rem);line-height:1.1;letter-spacing:-.01em;color:var(--ink)}
.sva-actions{display:flex;flex-wrap:wrap;gap:.35rem}
.sva-button{appearance:none;display:inline-flex;align-items:center;gap:.45em;font:500 .7rem/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.42rem .8rem;cursor:pointer;transition:color 120ms ease,border-color 120ms ease}
.sva-button:hover{color:var(--accent);border-color:var(--accent)}
.sva-count{margin-left:auto;font-family:var(--mono);font-size:.74rem;color:var(--soft)}
.sva-content{min-width:0}
.sva-chart{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:1rem;min-width:0}
.sva-message{margin:0 0 1rem;max-width:62rem;padding:.9rem 1.1rem;background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:10px}
.sva-message.sva-problem{border-left-color:var(--s0)}
.sva-notes{margin:0 0 1rem;padding:0;list-style:none;max-width:62rem}
.sva-note{margin:0 0 .45rem;padding:.6rem 1rem;background:var(--card);border:1px solid var(--rule);border-left:3px solid var(--s1);border-radius:10px;font-size:.92rem}

.sva-data{max-width:62rem}
.sva-steps{display:flex;flex-wrap:wrap;gap:.5rem 1.6rem;margin:0 0 1.1rem;padding:0;list-style:none;font-family:var(--mono);font-size:.74rem;letter-spacing:.04em;color:var(--soft)}
.sva-steps li{display:flex;align-items:center;gap:.5rem}
.sva-step-n{display:grid;place-items:center;width:1.5rem;height:1.7rem;background:var(--hue);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);color:#fff;font-weight:600;font-size:.72rem}
.sva-drop{margin:0 0 1.2rem;padding:1.5rem 1rem;border:1.5px dashed var(--faint);border-radius:12px;background:var(--card);text-align:center;color:var(--soft);transition:border-color 120ms ease,background 120ms ease}
.sva-drop.sva-over{border-color:var(--accent);background:var(--accent-soft);color:var(--ink)}
.sva-drop p{margin:0 0 .5rem;font-family:var(--serif);font-size:1.3rem;line-height:1.3;color:var(--ink)}
.sva-drop p.sva-drop-note{margin:0;font-family:var(--mono);font-size:.74rem;color:var(--soft)}
.sva-drop .sva-button{font-size:.78rem;vertical-align:middle;margin-left:.2rem}
.sva-file{margin:0 0 1.1rem;border:1px solid var(--rule);border-radius:10px;background:var(--card);overflow:hidden}
.sva-file-head{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .8rem;padding:.7rem 1rem;border-bottom:1px solid var(--rule)}
.sva-file.sva-unplaced .sva-file-head{border-bottom:0}
.sva-file-name{font-family:var(--mono);font-weight:600;font-size:.86rem;overflow-wrap:anywhere}
.sva-file-rows{font-family:var(--mono);font-size:.72rem;color:var(--soft)}
.sva-file-head .sva-tag{margin-left:0;font-size:.7rem}
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
.sva-map .sva-tag{margin-left:0;display:inline-flex;align-items:center;gap:.45em;font-size:.66rem}
.sva-map .sva-tag::before{content:"";flex:none;width:.74em;height:.84em;background:var(--faint);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
.sva-map .sva-tag.sva-same::before{background:var(--s2)}
.sva-map .sva-tag.sva-guess::before{background:var(--s1)}
.sva-map .sva-tag.sva-chosen::before{background:var(--accent)}
.sva-map .sva-tag.sva-missing::before{background:var(--s0)}

@media (max-width:900px){
.sva-app{grid-template-columns:minmax(0,1fr)}
.sva-rail{position:relative;height:auto;overflow:visible;border-right:0;border-bottom:1px solid var(--rule);padding:1.5rem 1rem 1rem;gap:.8rem}
.sva-brandrow{display:flex;align-items:center;justify-content:space-between;gap:.8rem}
.sva-button.sva-navtoggle{display:inline-flex}
.sva-rail:not(.sva-open) .sva-nav,.sva-rail:not(.sva-open) .sva-links,.sva-rail:not(.sva-open) .sva-pitch{display:none}
.sva-count{margin-left:0;flex-basis:100%}
.sva-chart{padding:.6rem}
}
`;
