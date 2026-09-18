import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { normalizeDomain } from '../../../src/patient-journey-explorer/normalize.js';
import {
  PJE_DEEMPHASIS,
  PJE_MARKS,
  PJE_PALETTE
} from '../../../src/patient-journey-explorer/palette.js';
import { windowBounds } from '../../../src/patient-journey-explorer/anchor.js';
import { deriveDoseChanges } from '../../../src/patient-journey-explorer/structureData.js';
import {
  DOMAIN_LABELS,
  MIN_BAR_WIDTH,
  buildLaneDatasets,
  dayLabel,
  endCapFor,
  glyphFor,
  laneAriaLabel,
  markGeometry,
  ratioLine,
  severityStyle,
  spanLabel,
  tooltipLines,
  withAlpha
} from '../../../src/patient-journey-explorer/getPlugins.js';

// Pure dataset, geometry and text builders for the patient-journey-explorer
// module (#142, design §6.3–6.5, D16, D20, D23): floating bars in ELAPSED
// space, the end cap per endState, the glyph vocabulary, the SAE tag, the
// direction-aware ratio line, the "+N days from anchor" line only when
// anchored, and the accessible name. The canvas code lives in draw.js and is
// browser-tested. PJE-LANE-005/006, PJE-ACC-002, PJE-ANCH-003, PJE-TIME-*.

const settings = syncSettings({});
const theme = PJE_PALETTE.light;
const REF = '2013-12-16';
const domain = [-14, 183];

const ae = (extra = {}) =>
  normalizeDomain(
    [
      {
        USUBJID: 'P1',
        AETERM: 'Erythema',
        AEDECOD: 'ERYTHEMA',
        AEBODSYS: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS',
        ASTDY: 30,
        AENDY: 115,
        AESEV: 'MODERATE',
        AESER: 'N',
        AEREL: 'PROBABLE',
        AEOUT: 'RECOVERED/RESOLVED',
        AESTDTC: '2014-01-14',
        TRTSDT: REF,
        ...extra
      }
    ],
    'AE',
    settings
  ).events[0];
const cm = (extra = {}) =>
  normalizeDomain(
    [
      {
        USUBJID: 'P1',
        CMTRT: 'ASPIRIN',
        CMCLAS: 'ANALGESICS',
        CMDOSE: '81',
        CMROUTE: 'ORAL',
        ASTDY: -10,
        AENDY: '',
        TRTSDT: REF,
        ...extra
      }
    ],
    'CM',
    settings
  ).events[0];
const ex = (rows) =>
  normalizeDomain(
    rows.map((row) => ({ USUBJID: 'P1', EXTRT: 'XANOMELINE', EXDOSU: 'mg', TRTSDT: REF, ...row })),
    'EX',
    settings
  ).events;
const lb = (extra = {}) =>
  normalizeDomain(
    [
      {
        USUBJID: 'P1',
        LBTEST: 'Aspartate Aminotransferase',
        LBTESTCD: 'AST',
        LBSTRESN: 36,
        LBSTRESU: 'U/L',
        LBSTNRLO: 10,
        LBSTNRHI: 34,
        LBNRIND: 'HIGH',
        LBDY: 32,
        TRTSDT: REF,
        ...extra
      }
    ],
    'LB',
    settings
  ).events[0];
const mh = () =>
  normalizeDomain(
    [
      {
        USUBJID: 'P1',
        MHTERM: 'VERBATIM_1',
        MHDECOD: 'ASTHMA',
        MHCAT: 'GENERAL',
        MHDY: -37,
        MHSTRTPT: 'BEFORE',
        TRTSDT: REF
      }
    ],
    'MH',
    settings
  ).events[0];
const ds = () =>
  normalizeDomain(
    [
      {
        USUBJID: 'P1',
        DSDECOD: 'COMPLETED',
        DSTERM: 'Completed the study',
        DSCAT: 'DISPOSITION EVENT',
        DSSTDY: 184,
        TRTSDT: REF
      }
    ],
    'DS',
    settings
  ).events[0];

describe('withAlpha', () => {
  it('PJE-ANCH-003: converts #rrggbb, #rgb, rgb() and rgba() to an rgba() string at the given alpha (#142)', () => {
    expect(withAlpha('#4a3aa7', 0.4)).toBe('rgba(74, 58, 167, 0.4)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(withAlpha('rgb(17, 24, 39)', 0.5)).toBe('rgba(17, 24, 39, 0.5)');
    expect(withAlpha('rgba(17, 24, 39, 0.06)', 0.5)).toBe('rgba(17, 24, 39, 0.5)');
    expect(withAlpha('#4a3aa7', 2)).toBe('rgba(74, 58, 167, 1)');
    expect(withAlpha('#4a3aa7', -1)).toBe('rgba(74, 58, 167, 0)');
    expect(withAlpha('not-a-color', 0.5)).toBe('not-a-color');
  });
});

describe('severityStyle / glyphFor / endCapFor (PJE-ACC-002, D16, D23)', () => {
  it('PJE-ACC-002: severity maps to the palette height, border width and (opaque) alpha; blank severity draws the hatched bar at the moderate height (#142)', () => {
    for (const key of ['MILD', 'MODERATE', 'SEVERE']) {
      const style = severityStyle(ae({ AESEV: key }), theme, settings);
      expect(style).toMatchObject({
        key,
        height: theme.aeSeverityHeight[key],
        borderWidth: theme.aeSeverityBorder[key],
        alpha: 1,
        glyph: 'bar',
        missing: false
      });
    }
    const blank = severityStyle(ae({ AESEV: '' }), theme, settings);
    expect(blank).toMatchObject({
      key: null,
      height: theme.aeSeverityHeight.MODERATE,
      borderWidth: theme.aeSeverityBorder.MODERATE,
      glyph: 'hatch-bar',
      missing: true
    });
    const outside = severityStyle(ae({ AESEV: 'UNKNOWN' }), theme, settings);
    expect(outside).toMatchObject({
      height: theme.aeSeverityHeight.MODERATE,
      glyph: 'bar',
      missing: false
    });
  });

  it('PJE-ACC-002: a custom severity scale maps its first rank to MILD, its last to SEVERE and the rest to MODERATE (#142)', () => {
    const grades = syncSettings({ ae_severity_values: ['1', '2', '3', '4', '5'] });
    const grade = (value) =>
      normalizeDomain([{ USUBJID: 'P1', AETERM: 'x', ASTDY: 1, AESEV: value }], 'AE', grades)
        .events[0];
    expect(severityStyle(grade('1'), theme, grades).height).toBe(theme.aeSeverityHeight.MILD);
    expect(severityStyle(grade('3'), theme, grades).height).toBe(theme.aeSeverityHeight.MODERATE);
    expect(severityStyle(grade('5'), theme, grades).height).toBe(theme.aeSeverityHeight.SEVERE);
  });

  it('PJE-ACC-002: glyphs are the palette vocabulary — bars for intervals, lab glyphs by indicator, carets by direction, a hollow circle for history and a dot for disposition (#142)', () => {
    expect(glyphFor(ae())).toBe('bar');
    expect(glyphFor(ae({ AESEV: '' }))).toBe('hatch-bar');
    expect(glyphFor(cm())).toBe('bar');
    expect(glyphFor(ex([{ EXDOSE: 54, ASTDY: 1 }])[0])).toBe('bar');
    expect(glyphFor(lb({ LBNRIND: 'HIGH' }))).toBe('triangle-up');
    expect(glyphFor(lb({ LBNRIND: 'LOW' }))).toBe('triangle-down');
    expect(glyphFor(lb({ LBNRIND: 'HH' }))).toBe('triangle-up-double');
    expect(glyphFor(lb({ LBNRIND: 'LL' }))).toBe('triangle-down-double');
    expect(glyphFor(lb({ LBNRIND: 'NORMAL' }))).toBe('circle-open');
    expect(glyphFor(lb({ LBNRIND: 'ABNORMAL' }))).toBe('circle-open');
    expect(glyphFor(lb({ LBNRIND: '' }))).toBe('dot');
    const changes = deriveDoseChanges(
      ex([
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
        { EXDOSE: 81, ASTDY: 17, AENDY: 100 },
        { EXDOSE: 54, ASTDY: 101, AENDY: 120 },
        { EXDOSE: 0, ASTDY: 121, AENDY: 130 },
        { EXDOSE: 54, ASTDY: 131, AENDY: 180 }
      ]),
      settings
    );
    expect(changes.map(glyphFor)).toEqual([
      'caret-up',
      'caret-down',
      'caret-pause',
      'caret-restart'
    ]);
    expect(glyphFor(mh())).toBe('circle-open');
    expect(glyphFor(ds())).toBe('dot');
  });

  it('PJE-ANCH-002: the end cap is closed / arrow (ongoing) / fade (end not recorded) by endState, never by a bare missing value (#142)', () => {
    expect(endCapFor(ae())).toBe('closed');
    expect(endCapFor(ae({ AENDY: '', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }))).toBe('arrow');
    expect(endCapFor(ae({ AENDY: '', AEOUT: '' }))).toBe('fade');
    expect(endCapFor(cm())).toBe('fade');
    // An end before the start is a zero-length mark (design §5.1 rule 3), so it caps closed.
    expect(endCapFor(ae({ AENDY: 3 }))).toBe('closed');
    expect(endCapFor(lb())).toBe('closed');
  });
});

describe('markGeometry (PJE-LANE-005/006)', () => {
  it('PJE-LANE-006: an interval is [elapsedStart, elapsedEnd] with the lane height and a minimum drawn width (#142)', () => {
    const geometry = markGeometry(ae(), { lane: 'adverseEvents', domain, settings, theme });
    expect(geometry).toMatchObject({
      x0: 29,
      x1: 114,
      height: theme.aeSeverityHeight.MODERATE,
      minWidth: MIN_BAR_WIDTH,
      endCap: 'closed',
      glyph: 'bar',
      clippedStart: false
    });
    expect(
      markGeometry(ex([{ EXDOSE: 54, ASTDY: 1, AENDY: 16 }])[0], {
        lane: 'exposure',
        domain,
        settings,
        theme
      })
    ).toMatchObject({
      x0: 0,
      x1: 15,
      height: PJE_MARKS.exBarHeight
    });
    expect(
      markGeometry(cm({ ASTDY: 1, AENDY: 5 }), { lane: 'conMeds', domain, settings, theme })
    ).toMatchObject({
      x0: 0,
      x1: 4,
      height: PJE_MARKS.cmBarHeight
    });
  });

  it('PJE-ANCH-002: an open interval runs to the domain end with its end cap; a same-day event is zero-width but keeps the minimum width (#142)', () => {
    const ongoing = markGeometry(ae({ AENDY: '', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }), {
      lane: 'adverseEvents',
      domain,
      settings,
      theme
    });
    expect(ongoing).toMatchObject({ x0: 29, x1: 183, endCap: 'arrow' });
    const unrecorded = markGeometry(cm(), { lane: 'conMeds', domain, settings, theme });
    expect(unrecorded).toMatchObject({ x0: -10, x1: 183, endCap: 'fade' });
    const sameDay = markGeometry(ae({ ASTDY: 48, AENDY: 48 }), {
      lane: 'adverseEvents',
      domain,
      settings,
      theme
    });
    expect(sameDay.x0).toBe(sameDay.x1);
    expect(sameDay.minWidth).toBeGreaterThan(0);
    const backwards = markGeometry(ae({ ASTDY: 48, AENDY: 3 }), {
      lane: 'adverseEvents',
      domain,
      settings,
      theme
    });
    expect(backwards).toMatchObject({ x0: 47, x1: 47, endCap: 'closed' });
  });

  it('PJE-LANE-008: a clipped start draws from the domain edge, points are zero-width at their day, and an unplaceable event has no geometry (#142)', () => {
    const clipped = markGeometry(
      { ...cm({ ASTDY: -9894 }), clippedStart: true },
      { lane: 'conMeds', domain, settings, theme }
    );
    expect(clipped).toMatchObject({ x0: -14, x1: 183, clippedStart: true });
    expect(markGeometry(lb(), { lane: 'labs', domain, settings, theme })).toMatchObject({
      x0: 31,
      x1: 31,
      height: PJE_MARKS.labGlyphSize,
      glyph: 'triangle-up'
    });
    expect(
      markGeometry(lb({ LBNRIND: 'HH' }), { lane: 'labs', domain, settings, theme }).height
    ).toBe(PJE_MARKS.labGlyphSizeExtreme);
    expect(markGeometry(mh(), { lane: 'medicalHistory', domain, settings, theme })).toMatchObject({
      x0: -37,
      x1: -37,
      height: PJE_MARKS.mhDotRadius * 2
    });
    expect(
      markGeometry(ae({ ASTDY: '', AENDY: '' }), { lane: 'adverseEvents', domain, settings, theme })
    ).toBeNull();
    expect(markGeometry(null, { lane: 'adverseEvents', domain, settings, theme })).toBeNull();
    expect(markGeometry(cm(), { lane: 'conMeds', domain: null, settings, theme })).toMatchObject({
      x0: -10,
      x1: -10
    });
  });
});

describe('dayLabel / spanLabel (PJE-TIME-001, D16)', () => {
  it('PJE-TIME-001: day mode prints the study day and date mode the calendar date, falling back to the day when no date resolves (#142)', () => {
    expect(dayLabel(30, { mode: 'day', refDate: REF })).toBe('Day 30');
    expect(dayLabel(-7, { mode: 'day', refDate: REF })).toBe('Day -7');
    expect(dayLabel(30, { mode: 'date', refDate: REF })).toBe('2014-01-14');
    expect(dayLabel(30, { mode: 'date', refDate: null })).toBe('Day 30');
    expect(dayLabel(null, { mode: 'day' })).toBe('no study day');
  });

  it('PJE-ANCH-002: the terminal phrase comes from endState — "to day N", "to ongoing (<outcome>)", or "end not recorded" (#142)', () => {
    expect(spanLabel(ae(), { mode: 'day', refDate: REF })).toBe('Day 30 to day 115');
    expect(
      spanLabel(ae({ AENDY: '', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }), {
        mode: 'day',
        refDate: REF
      })
    ).toBe('Day 30 to ongoing (not recovered/not resolved)');
    expect(spanLabel(ae({ AENDY: '', AEOUT: '' }), { mode: 'day', refDate: REF })).toBe(
      'Day 30, end not recorded'
    );
    expect(spanLabel(cm(), { mode: 'day', refDate: REF })).toBe('Day -10, end not recorded');
    expect(spanLabel(ae({ ASTDY: 48, AENDY: 48 }), { mode: 'day', refDate: REF })).toBe(
      'Day 48 to day 48'
    );
    expect(spanLabel(lb(), { mode: 'day', refDate: REF })).toBe('Day 32');
    expect(spanLabel(ae({ ASTDY: '', AENDY: '' }), { mode: 'day', refDate: REF })).toBe(
      'No study day recorded'
    );
  });

  it('PJE-TIME-001: in date mode both ends of a closed interval are dates, and the day is used where no date resolves (#142)', () => {
    expect(spanLabel(ae(), { mode: 'date', refDate: REF })).toBe('2014-01-14 to 2014-04-09');
    expect(spanLabel(ae({ TRTSDT: '', AESTDTC: '' }), { mode: 'date', refDate: null })).toBe(
      'Day 30 to day 115'
    );
    expect(
      spanLabel(ae({ TRTSDT: '', AESTDTC: '2014-01-14' }), { mode: 'date', refDate: null })
    ).toBe('2014-01-14 to day 115');
  });
});

describe('ratioLine (PC-29)', () => {
  it('PJE-CTX-002: "× ULN" above the range, "× LLN" below it, two decimals, and no line when the relevant limit is missing (#142)', () => {
    expect(ratioLine(lb({ LBSTRESN: 137, LBSTNRHI: 34 }))).toBe('4.03 × ULN');
    expect(ratioLine(lb({ LBSTRESN: 36, LBSTNRHI: 34 }))).toBe('1.06 × ULN');
    expect(ratioLine(lb({ LBNRIND: 'LOW', LBSTRESN: 6.1, LBSTNRLO: 10 }))).toBe('0.61 × LLN');
    expect(ratioLine(lb({ LBNRIND: 'HIGH', LBSTNRHI: '' }))).toBeNull();
    expect(ratioLine(lb({ LBNRIND: 'NORMAL', LBSTRESN: 20 }))).toBeNull();
    expect(ratioLine(ae())).toBeNull();
  });
});

describe('tooltipLines (design §6.5)', () => {
  it('PJE-KEY-001: an adverse event reads label, domain · severity · relatedness, the span, the category, the verbatim term, the placing column and the gesture line (#142)', () => {
    expect(tooltipLines(ae(), settings, { mode: 'day', refDate: REF })).toEqual([
      'ERYTHEMA',
      'Adverse event · Moderate · related: PROBABLE',
      'Day 30 to day 115',
      'SKIN AND SUBCUTANEOUS TISSUE DISORDERS',
      'Erythema',
      'placed by ASTDY',
      'Enter to anchor · Shift+Enter to open the source record'
    ]);
  });

  it('PJE-ACC-002: a serious event adds the literal SAE tag and a blank severity adds "severity not recorded" (#142)', () => {
    const serious = tooltipLines(ae({ AESER: 'Y' }), settings, { mode: 'day', refDate: REF });
    expect(serious).toContain('SAE');
    expect(serious[1]).toBe('Adverse event · Moderate · related: PROBABLE');
    const blank = tooltipLines(ae({ AESEV: '' }), settings, { mode: 'day', refDate: REF });
    expect(blank).toContain('severity not recorded');
    expect(blank[1]).toBe('Adverse event · related: PROBABLE');
    expect(tooltipLines(ae({ AESER: 'N' }), settings, { mode: 'day', refDate: REF })).not.toContain(
      'SAE'
    );
  });

  it('PJE-ANCH-004: the "+N days from anchor" line appears only when anchored, signed, in elapsed days (#142)', () => {
    const unanchored = tooltipLines(ae(), settings, { mode: 'day', refDate: REF });
    expect(unanchored.some((line) => line.includes('from anchor'))).toBe(false);
    const anchor = ae();
    expect(tooltipLines(ae(), settings, { mode: 'day', refDate: REF, anchor })).toContain(
      '+0 days from anchor'
    );
    expect(
      tooltipLines(ae({ ASTDY: 42 }), settings, { mode: 'day', refDate: REF, anchor })
    ).toContain('+12 days from anchor');
    expect(
      tooltipLines(ae({ ASTDY: -5 }), settings, {
        mode: 'day',
        refDate: REF,
        anchor: ae({ ASTDY: 10 })
      })
    ).toContain('-14 days from anchor');
    expect(
      tooltipLines(ae({ ASTDY: 31 }), settings, { mode: 'day', refDate: REF, anchor })
    ).toContain('+1 day from anchor');
    expect(
      tooltipLines(ae({ ASTDY: '' }), settings, { mode: 'day', refDate: REF, anchor }).some((l) =>
        l.includes('from anchor')
      )
    ).toBe(false);
    expect(
      tooltipLines(ae(), settings, { mode: 'day', refDate: REF, anchor: { day: 30 } })
    ).toContain('+0 days from anchor');
  });

  it('PJE-ANCH-002: ongoing and end-not-recorded produce different terminal text, and a con-med shows its class and dose (#142)', () => {
    const ongoing = tooltipLines(ae({ AENDY: '', AEOUT: 'NOT RECOVERED/NOT RESOLVED' }), settings, {
      mode: 'day',
      refDate: REF
    });
    const unrecorded = tooltipLines(ae({ AENDY: '', AEOUT: '' }), settings, {
      mode: 'day',
      refDate: REF
    });
    expect(ongoing[2]).toBe('Day 30 to ongoing (not recovered/not resolved)');
    expect(unrecorded[2]).toBe('Day 30, end not recorded');
    expect(ongoing[2]).not.toBe(unrecorded[2]);
    expect(tooltipLines(cm(), settings, { mode: 'day', refDate: REF })).toEqual([
      'ASPIRIN',
      'Con-med',
      'Day -10, end not recorded',
      'ANALGESICS',
      '81 ORAL',
      'placed by ASTDY',
      'Enter to anchor · Shift+Enter to open the source record'
    ]);
  });

  it('PJE-CTX-002: a lab point reads test and value, the indicator, the day, the ratio line and the reference range (#142)', () => {
    expect(tooltipLines(lb(), settings, { mode: 'day', refDate: REF })).toEqual([
      'Aspartate Aminotransferase 36 U/L',
      'Lab result · HIGH',
      'Day 32',
      '1.06 × ULN',
      'Aspartate Aminotransferase (10–34 U/L)',
      'placed by LBDY',
      'Enter to anchor · Shift+Enter to open the source record'
    ]);
    expect(tooltipLines(lb({ LBNRIND: '' }), settings, { mode: 'day', refDate: REF })[1]).toBe(
      'Lab result · indicator not recorded'
    );
  });

  it('PJE-DERIV-001: dose changes, exposure, medical history and disposition each read their domain word and detail (#142)', () => {
    const exs = ex([
      { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
      { EXDOSE: 81, ASTDY: 17, AENDY: 100 }
    ]);
    const [change] = deriveDoseChanges(exs, settings);
    expect(tooltipLines(change, settings, { mode: 'day', refDate: REF }).slice(0, 3)).toEqual([
      '54 → 81 mg',
      'Dose change · increase',
      'Day 17'
    ]);
    expect(tooltipLines(exs[0], settings, { mode: 'day', refDate: REF }).slice(0, 3)).toEqual([
      'XANOMELINE',
      'Exposure',
      'Day 1 to day 16'
    ]);
    const history = tooltipLines(mh(), settings, { mode: 'day', refDate: REF });
    expect(history.slice(0, 3)).toEqual(['ASTHMA', 'Medical history', 'Day -37']);
    expect(history).toContain('recorded day -37; onset before study');
    const disposition = tooltipLines(ds(), settings, { mode: 'day', refDate: REF });
    expect(disposition.slice(0, 4)).toEqual([
      'COMPLETED',
      'Disposition',
      'Day 184',
      'DISPOSITION EVENT'
    ]);
    expect(disposition).toContain('Completed the study');
  });

  it('PJE-TIME-003: a partial recorded date is shown as recorded; PJE-TIME-004: a disagreeing full date is named (#142)', () => {
    expect(
      tooltipLines(cm({ CMSTDTC: '2011' }), settings, { mode: 'day', refDate: REF })
    ).toContain('recorded as 2011');
    expect(
      tooltipLines(cm({ CMSTDTC: '2013-12' }), settings, { mode: 'date', refDate: REF })
    ).toContain('recorded as 2013-12');
    const conflict = ae({ AESTDTC: '2014-06-01' });
    expect(conflict.dateConflict).toBe(true);
    expect(tooltipLines(conflict, settings, { mode: 'day', refDate: REF })).toContain(
      'recorded date 2014-06-01 disagrees with day 30'
    );
    expect(
      tooltipLines(ae(), settings, { mode: 'date', refDate: REF }).some((l) =>
        l.startsWith('recorded')
      )
    ).toBe(false);
  });

  it('PJE-LANE-008: an unplaceable event says so instead of a span (#142)', () => {
    const lines = tooltipLines(ae({ ASTDY: '', AENDY: '' }), settings, {
      mode: 'day',
      refDate: REF
    });
    expect(lines[2]).toBe('No study day recorded');
    expect(lines.some((l) => l.startsWith('placed by'))).toBe(false);
  });
});

describe('laneAriaLabel (PJE-KEY-001, PJE-ACC-002)', () => {
  it('PJE-KEY-001: the accessible name is a sentence naming the label, domain, severity, days and both gestures (#142)', () => {
    expect(laneAriaLabel(ae(), settings, { mode: 'day', refDate: REF })).toBe(
      'Erythema, adverse event, moderate, related: PROBABLE, day 30 to day 115. Press Enter to anchor time on this event, Shift and Enter to open its source record.'
    );
  });

  it('PJE-ACC-002: seriousness and a missing severity are named, never carried by the ring or the hatch alone (#142)', () => {
    const serious = laneAriaLabel(ae({ AESER: 'Y' }), settings, { mode: 'day', refDate: REF });
    expect(serious).toContain('serious (SAE)');
    const blank = laneAriaLabel(ae({ AESEV: '' }), settings, { mode: 'day', refDate: REF });
    expect(blank).toContain('severity not recorded');
    expect(blank).not.toContain('moderate');
  });

  it('PJE-KEY-001: labs name the test, value, indicator and ratio; date mode names dates; other domains read their domain word (#142)', () => {
    expect(laneAriaLabel(lb(), settings, { mode: 'day', refDate: REF })).toBe(
      'Aspartate Aminotransferase 36 U/L, lab result, HIGH, 1.06 × ULN, day 32. Press Enter to anchor time on this event, Shift and Enter to open its source record.'
    );
    expect(laneAriaLabel(ae(), settings, { mode: 'date', refDate: REF })).toContain(
      '2014-01-14 to 2014-04-09'
    );
    expect(laneAriaLabel(cm(), settings, { mode: 'day', refDate: REF })).toBe(
      'Aspirin, con-med, day -10, end not recorded. Press Enter to anchor time on this event, Shift and Enter to open its source record.'
    );
    expect(laneAriaLabel(ds(), settings, { mode: 'day', refDate: REF })).toContain(
      'Completed, disposition, day 184.'
    );
  });
});

describe('buildLaneDatasets (PJE-LANE-005/006, PJE-ANCH-003)', () => {
  it('PJE-LANE-006: interval lanes produce floating bars {x: [elapsedStart, elapsedEnd], y: row} with the event and its end cap on each point (#142)', () => {
    const exs = ex([
      { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
      { EXDOSE: 81, ASTDY: 17, AENDY: 100 }
    ]);
    const [dataset] = buildLaneDatasets('exposure', exs, { domain, settings, theme });
    expect(dataset.type).toBe('bar');
    expect(dataset.indexAxis).toBe('y');
    expect(dataset.barThickness).toBe(PJE_MARKS.exBarHeight);
    expect(dataset.minBarLength).toBe(MIN_BAR_WIDTH);
    expect(dataset.data.map((p) => [p.x, p.y])).toEqual([
      [[0, 15], 'XANOMELINE'],
      [[16, 99], 'XANOMELINE']
    ]);
    expect(dataset.data[0].event).toBe(exs[0]);
    expect(dataset.data[0]).toMatchObject({ endCap: 'closed', glyph: 'bar', emphasis: 'full' });
    expect(dataset.backgroundColor[0]).toBe(theme.ex);
    const [cmSet] = buildLaneDatasets('conMeds', [cm()], { domain, settings, theme });
    expect(cmSet.data[0]).toMatchObject({ x: [-10, 183], y: 'CM-0', endCap: 'fade' });
    expect(cmSet.barThickness).toBe(PJE_MARKS.cmBarHeight);
  });

  it('PJE-ACC-002: the adverse-event lane emits one bar dataset per severity height so bar height and border weight carry severity at one opaque fill (#142)', () => {
    const events = [ae({ AESEV: 'MILD' }), ae({ AESEV: 'SEVERE', AESER: 'Y' }), ae({ AESEV: '' })];
    const datasets = buildLaneDatasets('adverseEvents', events, { domain, settings, theme });
    expect(datasets.map((d) => d.barThickness).sort((a, b) => a - b)).toEqual([5, 7, 9]);
    for (const dataset of datasets) {
      expect(dataset.grouped).toBe(false);
      expect(dataset.backgroundColor.every((c) => c === theme.ae)).toBe(true);
    }
    const hatched = datasets.flatMap((d) => d.data).find((p) => p.glyph === 'hatch-bar');
    expect(hatched.event.flags.severity).toBeNull();
    const severe = datasets.find((d) => d.barThickness === 9);
    expect(severe.borderWidth[0]).toBe(theme.aeSeverityBorder.SEVERE);
    expect(severe.data[0].serious).toBe(true);
  });

  it('PJE-ANCH-003: with window bounds, out-of-window marks are dim with the per-hue de-emphasis alpha and in-window marks stay full strength (#142)', () => {
    const events = [ae({ ASTDY: 30, AENDY: 40 }), ae({ ASTDY: 150, AENDY: 160 })];
    const bounds = windowBounds(30, 30);
    const [dataset] = buildLaneDatasets('adverseEvents', events, {
      domain,
      settings,
      theme,
      bounds
    });
    expect(dataset.data.map((p) => p.emphasis)).toEqual(['full', 'dim']);
    expect(dataset.backgroundColor).toEqual([
      theme.ae,
      withAlpha(theme.ae, PJE_DEEMPHASIS.fillAlpha.ae)
    ]);
    expect(dataset.borderColor[1]).toBe(withAlpha(theme.ae, PJE_DEEMPHASIS.strokeAlpha));
    const [cmSet] = buildLaneDatasets('conMeds', [cm({ ASTDY: 100 })], {
      domain,
      settings,
      theme,
      bounds
    });
    expect(cmSet.backgroundColor[0]).toBe(withAlpha(theme.cm, PJE_DEEMPHASIS.fillAlpha.cm));
  });

  it('PJE-LANE-005: the labs lane is one line dataset per call over {x: elapsed, y: value} with the glyph per point and the trace ink (#142)', () => {
    const points = [
      lb({ LBDY: -7, LBSTRESN: 20, LBNRIND: 'NORMAL' }),
      lb({ LBDY: 32, LBSTRESN: 36, LBNRIND: 'HIGH' })
    ];
    const [dataset] = buildLaneDatasets('labs', points, { domain, settings, theme });
    expect(dataset.type).toBe('line');
    expect(dataset.label).toBe('Aspartate Aminotransferase');
    expect(dataset.borderColor).toBe(theme.lbTrace);
    expect(dataset.borderWidth).toBe(PJE_MARKS.lineWidth);
    expect(dataset.pointRadius).toBe(0);
    expect(dataset.data.map((p) => [p.x, p.y, p.glyph])).toEqual([
      [-7, 20, 'circle-open'],
      [31, 36, 'triangle-up']
    ]);
    expect(dataset.data[1].ratio).toBe('1.06 × ULN');
  });

  it('PJE-LANE-006: dose changes, medical history and disposition are scatter datasets with hidden points that draw.js paints as glyphs (#142)', () => {
    const [change] = deriveDoseChanges(
      ex([
        { EXDOSE: 54, ASTDY: 1, AENDY: 16 },
        { EXDOSE: 81, ASTDY: 17, AENDY: 100 }
      ]),
      settings
    );
    const [doseSet] = buildLaneDatasets('doseChanges', [change], { domain, settings, theme });
    expect(doseSet).toMatchObject({ type: 'scatter', pointRadius: 0 });
    expect(doseSet.data[0]).toMatchObject({ x: 16, y: 'doseChanges', glyph: 'caret-up' });
    const [mhSet] = buildLaneDatasets('medicalHistory', [mh()], { domain, settings, theme });
    expect(mhSet.data[0]).toMatchObject({ x: -37, y: 'medicalHistory', glyph: 'circle-open' });
    const [dsSet] = buildLaneDatasets('disposition', [ds()], { domain, settings, theme });
    expect(dsSet.data[0]).toMatchObject({
      x: 183,
      y: 'disposition',
      glyph: 'dot',
      reference: true
    });
  });

  it('PJE-LANE-008: unplaceable events are left out of every dataset, and empty input yields no datasets (#142)', () => {
    const [dataset] = buildLaneDatasets('adverseEvents', [ae(), ae({ ASTDY: '', AENDY: '' })], {
      domain,
      settings,
      theme
    });
    expect(dataset.data).toHaveLength(1);
    expect(buildLaneDatasets('adverseEvents', [], { domain, settings, theme })).toEqual([]);
    expect(buildLaneDatasets('labs', null, { domain, settings, theme })).toEqual([]);
    expect(buildLaneDatasets('nope', [ae()], { domain, settings, theme })).toEqual([]);
  });

  it('PJE-LANE-001: every domain has a human label (#142)', () => {
    expect(DOMAIN_LABELS).toEqual({
      EX: 'Exposure',
      DOSE: 'Dose change',
      AE: 'Adverse event',
      LB: 'Lab result',
      CM: 'Con-med',
      MH: 'Medical history',
      DS: 'Disposition'
    });
  });
});
