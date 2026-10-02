import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PJE_DEEMPHASIS,
  PJE_GLYPHS,
  PJE_MARKS,
  PJE_PALETTE,
  PJE_VALIDATION,
  resolveTheme
} from '../../../src/patient-journey-explorer/palette.js';

// The visual language of the patient-journey-explorer module (#142, design
// §6.3-§6.4, D4, D23): three categorical hues with opaque fills, a per-hue
// de-emphasis table, and the recorded validator numbers recomputed here from
// the composited fill actually drawn, so a palette edit or a de-emphasis edit
// that crosses a gate fails this file. PJE-ACC-001.

const MODULE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/patient-journey-explorer'
);

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const linear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// What the canvas paints for a translucent fill: the source-over composite,
// rounded to the 8-bit channel the surface actually holds.
const composite = (fg, bg, alpha) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
const ratio = (hex, surface, alpha = 1) =>
  contrast(composite(hexToRgb(hex), hexToRgb(surface), alpha), hexToRgb(surface));

// CIE76 colour difference in Lab, and the Machado (2009) deuteranopia
// simulation at full severity, applied in linear RGB.
const toLab = (rgb) => {
  const [r, g, b] = rgb.map(linear);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => {
  const la = toLab(a);
  const lb = toLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};
const DEUTAN = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881]
];
const deutan = (rgb) => {
  const lin = rgb.map(linear);
  return DEUTAN.map((row) => {
    const c = Math.max(0, Math.min(1, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  });
};

const HUES = ['ex', 'ae', 'cm'];

describe('PJE_PALETTE', () => {
  it('PJE-ACC-001: each categorical hue is opaque and at least 3:1 against its surface in both modes, at the recorded ratios (#142)', () => {
    for (const mode of ['light', 'dark']) {
      const tokens = PJE_PALETTE[mode];
      for (const hue of HUES) {
        const measured = ratio(tokens[hue], tokens.surface);
        expect(measured, `${mode}.${hue}`).toBeGreaterThanOrEqual(3);
        expect(measured, `${mode}.${hue}`).toBeCloseTo(PJE_VALIDATION[mode].contrast[hue], 1);
      }
    }
    expect(PJE_VALIDATION.light.contrast).toMatchObject({ ae: 8.56, ex: 4.95, cm: 3.94 });
  });

  it('PJE-ACC-001: the de-emphasized fill composites to between 1.9:1 and 2.4:1 per hue, at the recorded ratios (#142)', () => {
    expect(PJE_DEEMPHASIS.fillAlpha).toEqual({ ae: 0.4, ex: 0.55, cm: 0.55 });
    expect(PJE_DEEMPHASIS.strokeAlpha).toBe(0.75);
    const tokens = PJE_PALETTE.light;
    for (const hue of HUES) {
      const measured = ratio(tokens[hue], tokens.surface, PJE_DEEMPHASIS.fillAlpha[hue]);
      expect(measured, hue).toBeGreaterThanOrEqual(1.9);
      expect(measured, hue).toBeLessThanOrEqual(2.4);
      expect(measured, hue).toBeCloseTo(PJE_VALIDATION.light.deemphasis[hue], 1);
    }
    expect(PJE_VALIDATION.light.deemphasis).toMatchObject({ ae: 2.05, ex: 2.31, cm: 2.08 });
  });

  it('PJE-ACC-001: the escalation red, the diverging lab arms and the focus ring hold their recorded contrast in both modes (#142)', () => {
    for (const mode of ['light', 'dark']) {
      const tokens = PJE_PALETTE[mode];
      for (const key of ['escalate', 'labHigh', 'labLow', 'focusRing']) {
        const measured = ratio(tokens[key], tokens.surface);
        expect(measured, `${mode}.${key}`).toBeGreaterThanOrEqual(3);
        expect(measured, `${mode}.${key}`).toBeCloseTo(PJE_VALIDATION[mode].contrast[key], 1);
      }
      expect(
        ratio(tokens.inkSecondary, tokens.surface),
        `${mode}.inkSecondary`
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(PJE_VALIDATION.light.contrast.focusRing).toBe(6.37);
    expect(PJE_VALIDATION.dark.contrast.focusRing).toBe(8.25);
  });

  it('PJE-ACC-001: the three hues stay pairwise separable under normal vision and simulated deuteranopia at the recorded floor (#142)', () => {
    expect(PJE_VALIDATION.cvdDeltaEMin).toBe(13);
    for (const mode of ['light', 'dark']) {
      const rgb = HUES.map((hue) => hexToRgb(PJE_PALETTE[mode][hue]));
      for (let i = 0; i < rgb.length; i += 1) {
        for (let j = i + 1; j < rgb.length; j += 1) {
          expect(deltaE(rgb[i], rgb[j]), `${mode} ${HUES[i]}/${HUES[j]}`).toBeGreaterThanOrEqual(
            PJE_VALIDATION.cvdDeltaEMin
          );
          expect(
            deltaE(deutan(rgb[i]), deutan(rgb[j])),
            `${mode} deutan ${HUES[i]}/${HUES[j]}`
          ).toBeGreaterThanOrEqual(PJE_VALIDATION.cvdDeltaEMin);
        }
      }
    }
  });

  it('PJE-ACC-002: severity is carried by height and border weight at a single opaque fill (D23), and every encoding has a glyph (#142)', () => {
    for (const mode of ['light', 'dark']) {
      expect(PJE_PALETTE[mode].aeSeverityAlpha).toEqual({ MILD: 1, MODERATE: 1, SEVERE: 1 });
      expect(PJE_PALETTE[mode].aeSeverityHeight).toEqual({ MILD: 5, MODERATE: 7, SEVERE: 9 });
      expect(PJE_PALETTE[mode].aeSeverityBorder).toEqual({ MILD: 1, MODERATE: 1.5, SEVERE: 2 });
    }
    expect(PJE_GLYPHS.labFlag).toMatchObject({
      HIGH: 'triangle-up',
      LOW: 'triangle-down',
      NORMAL: 'circle-open'
    });
    expect(PJE_GLYPHS.doseChange).toEqual({
      INCREASE: 'caret-up',
      REDUCTION: 'caret-down',
      INTERRUPTION: 'caret-pause',
      RESTART: 'caret-restart'
    });
    expect(PJE_GLYPHS.aeStartDot).toEqual({ serious: 'circle-filled', default: 'circle-open' });
    expect(PJE_GLYPHS.aeSeverityMissing).toBe('hatch-bar');
    expect(PJE_MARKS.exBarHeight).toBe(12);
    expect(PJE_MARKS.cmBarHeight).toBe(8);
    expect(PJE_MARKS).not.toHaveProperty('deemphasisFillAlpha');
  });

  it('the light and dark token sets carry the same keys (#142)', () => {
    expect(Object.keys(PJE_PALETTE.dark).sort()).toEqual(Object.keys(PJE_PALETTE.light).sort());
  });
});

describe('resolveTheme', () => {
  it('falls back to the literals when there is no root, no window or getComputedStyle yields empty (#142)', () => {
    expect(resolveTheme()).toEqual(PJE_PALETTE.light);
    expect(resolveTheme(null, 'dark')).toEqual(PJE_PALETTE.dark);
    expect(resolveTheme(null, 'light')).not.toBe(PJE_PALETTE.light);
  });

  it('reads --pje-* custom properties back off the root when a stylesheet sets them (#142)', () => {
    const style = { '--pje-ex': ' #123456 ', '--pje-rule-anchor': '#000000' };
    const root = {};
    const previous = globalThis.window;
    globalThis.window = {
      getComputedStyle: () => ({ getPropertyValue: (name) => style[name] || '' })
    };
    try {
      const theme = resolveTheme(root, 'light');
      expect(theme.ex).toBe('#123456');
      expect(theme.ruleAnchor).toBe('#000000');
      expect(theme.ae).toBe(PJE_PALETTE.light.ae);
      expect(theme.aeSeverityHeight).toEqual(PJE_PALETTE.light.aeSeverityHeight);
    } finally {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
  });
});

describe('muted ink guard', () => {
  it("the library's #7b8b96 muted ink (3.51:1) appears nowhere in the module's source (#142)", () => {
    // A source grep, not PJE-ACC-003's evidence: that requirement measures
    // rendered contrast in the browser. This guard only stops the literal
    // from being pasted in from the sibling modules that still use it.
    const files = fs
      .readdirSync(MODULE_DIR)
      .filter((name) => name.endsWith('.js'))
      .map((name) => path.join(MODULE_DIR, name));
    const entry = path.join(MODULE_DIR, '..', 'patient-journey-explorer.js');
    if (fs.existsSync(entry)) files.push(entry);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(fs.readFileSync(file, 'utf8').toLowerCase(), file).not.toContain('#7b8b96');
    }
  });
});
