// Visual language for the patient-journey-explorer module (#142).
//
// Built against the `dataviz` skill's documented palette — every hex below is a
// step from references/palette.md, snapped to this repo's own surfaces
// (#ffffff chart card, #faf6f1 page) rather than the skill's #fcfcfb default.
// The token object is the visual report's §7 object; the design's D23 (opaque
// fills, severity by height and border weight) and §6.4 (a per-hue
// de-emphasis table) are the two recorded edits to it, marked inline.
//
// Color does exactly three jobs here:
//   1. `lane`   — categorical identity, THREE hues only. The skill caps
//                 categorical hues at three on the `--pairs all` pairlist, which
//                 is the correct pairlist for stacked lanes. Lanes 4-7 take
//                 chrome ink; their identity is position + a permanent label +
//                 mark geometry, never hue (D4).
//   2. `lab`    — a diverging pair (warm above range / cool below range) with a
//                 neutral gray midpoint, direction ALSO carried by glyph shape.
//   3. `escalate` — one reserved status red, meaning "escalated": the serious-AE
//                 outline and the HH/LL lab ring. Never a series color.
//
// Validated with the skill's validator, `--pairs all` (the hardest pairlist), in
// BOTH modes: all marks >= 3:1 vs surface, CVD separation above the recorded
// floor. `palette.test.js` recomputes every number in PJE_VALIDATION from the
// composited fill actually drawn, so an edit that crosses a gate fails there.
//
// Pure except `resolveTheme`, which reads getComputedStyle (D20).

export const PJE_PALETTE = {
  light: {
    // surfaces & chrome
    surface: '#ffffff', // .sv-chart-wrap background
    page: '#faf6f1', // site.css --paper
    panel: '#f6f8fa',
    border: '#d8dee4',
    grid: '#e1e0d9',
    inkPrimary: '#1f2933',
    inkSecondary: '#52616f', // floor for ALL text under 24px — the library's muted ink fails AA
    inkMuted: '#898781', // non-text chrome only (window edges)
    warning: '#9a3412',

    // lanes 1/3/5 — categorical
    ex: '#008300', // exposure bar
    ae: '#4a3aa7', // adverse-event bar + start dot
    cm: '#d55181', // con-med bar

    // lanes 2/4/6/7 — chrome ink
    doseCaret: '#111827',
    doseNotch: '#ffffff',
    lbTrace: '#52616f',
    mh: '#52616f',
    ds: '#52616f',

    // AE severity (D23): ONE opaque fill at every grade — an alpha ramp put MILD
    // at 2.05:1 against white, under the 3:1 gate PJE-ACC-001 asserts. Severity
    // is carried by bar height and border width instead; the alpha map is kept
    // at 1 so a consumer reading it draws exactly what the gate measured.
    aeSeverityAlpha: { MILD: 1, MODERATE: 1, SEVERE: 1 },
    aeSeverityHeight: { MILD: 5, MODERATE: 7, SEVERE: 9 },
    aeSeverityBorder: { MILD: 1, MODERATE: 1.5, SEVERE: 2 },

    // labs — diverging arms + neutral midpoint
    labHigh: '#eb6834',
    labLow: '#0d366b',
    labBand: '#f0efec',

    // status
    escalate: '#d03b3b',

    // reference lines
    ruleDay1: '#52616f',
    ruleDisposition: '#52616f',
    ruleAnchor: '#111827',

    // context window
    windowFill: 'rgba(17, 24, 39, 0.06)',
    windowEdge: '#898781',

    // focus
    focusRing: '#0b62a4',
    focusSeparator: '#ffffff'
  },

  dark: {
    surface: '#1a1a19',
    page: '#0d0d0d',
    panel: '#232320',
    border: '#3a3a37',
    grid: '#2c2c2a',
    inkPrimary: '#f5f5f3',
    inkSecondary: '#c3c2b7',
    inkMuted: '#898781',
    warning: '#f0b37e',

    ex: '#008300',
    ae: '#9085e9',
    cm: '#d55181',

    doseCaret: '#ffffff',
    doseNotch: '#1a1a19',
    lbTrace: '#c3c2b7',
    mh: '#c3c2b7',
    ds: '#c3c2b7',

    aeSeverityAlpha: { MILD: 1, MODERATE: 1, SEVERE: 1 },
    aeSeverityHeight: { MILD: 5, MODERATE: 7, SEVERE: 9 },
    aeSeverityBorder: { MILD: 1, MODERATE: 1.5, SEVERE: 2 },

    labHigh: '#d95926',
    labLow: '#9ec5f4',
    labBand: '#383835',

    escalate: '#e66767',

    ruleDay1: '#c3c2b7',
    ruleDisposition: '#c3c2b7',
    ruleAnchor: '#ffffff',

    windowFill: 'rgba(255, 255, 255, 0.08)',
    windowEdge: '#898781',

    focusRing: '#86b6ef', // #0b62a4 is 2.73:1 on the dark surface and fails
    focusSeparator: '#1a1a19'
  }
};

// Shape is the non-color channel: every encoding above is redundant with one of
// these. The glyph names are the `$pjeMarks[].glyph` vocabulary of design §6.4,
// which is what the browser suite asserts against.
export const PJE_GLYPHS = {
  // H / L are the one-letter aliases labs.js and draw.js already read as
  // high / low; ABNORMAL is the direction-unknown glyph every other non-normal
  // indicator falls back to, so an abnormal point never wears the normal ring.
  labFlag: {
    HIGH: 'triangle-up',
    H: 'triangle-up',
    LOW: 'triangle-down',
    L: 'triangle-down',
    HH: 'triangle-up-double',
    LL: 'triangle-down-double',
    ABNORMAL: 'diamond',
    NORMAL: 'circle-open'
  },
  doseChange: {
    INCREASE: 'caret-up',
    REDUCTION: 'caret-down',
    INTERRUPTION: 'caret-pause',
    RESTART: 'caret-restart'
  },
  aeStartDot: { serious: 'circle-filled', default: 'circle-open' },
  // An adverse event with no recorded severity draws a hatched bar at the
  // MODERATE height and says so in its accessible name (PJE-ACC-002).
  aeSeverityMissing: 'hatch-bar'
};

// Mark geometry (px), per the skill's marks-and-anatomy reference.
export const PJE_MARKS = {
  exBarHeight: 12,
  cmBarHeight: 8,
  mhDotRadius: 4,
  labGlyphSize: 9,
  labGlyphSizeExtreme: 11,
  barRadius: 4, // rounded data-ends
  surfaceGap: 2, // between overlapping fills, and inside the escalation ring
  lineWidth: 2,
  escalateRingWidth: 2,
  focusRingWidth: 2,
  focusSeparatorWidth: 2
};

// De-emphasis of out-of-window marks while anchored (design §6.4, D23): a
// per-hue fill alpha chosen so every de-emphasized fill lands in 1.9:1 … 2.4:1
// against the light surface — read as "stepped back", never erased. A flat
// ×0.28 took the AE hue to 1.62:1. Strokes keep 0.75 of their alpha; labels are
// suppressed; hit targets, tooltips and tab order are untouched.
export const PJE_DEEMPHASIS = {
  fillAlpha: { ae: 0.4, ex: 0.55, cm: 0.55 },
  strokeAlpha: 0.75
};

// The recorded validator numbers. `palette.test.js` recomputes each contrast
// ratio from the composited fill against the mode's surface and each ΔE floor
// from the three categorical hues (normal vision and simulated deuteranopia),
// so these are assertions, not documentation.
export const PJE_VALIDATION = {
  light: {
    contrast: {
      ex: 4.95,
      ae: 8.56,
      cm: 3.94,
      escalate: 4.8,
      labHigh: 3.2,
      labLow: 11.95,
      focusRing: 6.37
    },
    deemphasis: { ae: 2.05, ex: 2.31, cm: 2.08 }
  },
  dark: {
    contrast: {
      ex: 3.52,
      ae: 5.57,
      cm: 4.41,
      escalate: 5.39,
      labHigh: 4.48,
      labLow: 9.74,
      focusRing: 8.25
    },
    deemphasis: { ae: 1.95, ex: 1.9, cm: 2.17 }
  },
  // The worst pairwise CIE76 ΔE between the three categorical hues, under
  // normal vision and under simulated deuteranopia, in either mode.
  cvdDeltaEMin: 13
};

const propertyName = (key) => `--pje-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * Resolve the active theme tokens. Reads the CSS custom properties the module
 * stylesheet sets on its root (so a future repo-wide theme toggle drives the
 * canvas too), falling back to the literals above when the stylesheet is absent
 * — jsdom under Vitest, or a host that strips injected styles. The one
 * DOM-touching export in this file.
 * @param {HTMLElement} [root] The module root element (.sv-pje-root).
 * @param {'light'|'dark'} [mode] Force a mode; defaults to the media query.
 * @returns {Object} A flat token object for canvas painting (a copy; never the palette itself).
 */
export function resolveTheme(root, mode) {
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const base = PJE_PALETTE[mode || (prefersDark ? 'dark' : 'light')] || PJE_PALETTE.light;
  const out = { ...base };
  if (!root || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return out;
  const computed = window.getComputedStyle(root);
  for (const key of Object.keys(base)) {
    if (typeof base[key] !== 'string') continue;
    const value = String(computed.getPropertyValue(propertyName(key)) || '').trim();
    if (value) out[key] = value;
  }
  return out;
}
