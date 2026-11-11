import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { normalizeDomain } from '../../../src/patient-journey-explorer/normalize.js';
import { laneAriaLabel, tooltipLines } from '../../../src/patient-journey-explorer/getPlugins.js';

// The Patient Journey lines everything up on one study-day axis (#374,
// obot.roadmap#436), so a lab result says which visit it belongs to: the
// tooltip's span line reads "Week 8 · Day 57", from the optional
// `lb_visit_col` (VISIT by default). A record without a visit keeps "Day 57".

const REF = '2013-12-16';

const lb = (settings, extra = {}) =>
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
        LBDY: 57,
        VISIT: 'Week 8',
        TRTSDT: REF,
        ...extra
      }
    ],
    'LB',
    settings
  ).events[0];

describe('the Patient Journey lab tooltip names the visit', () => {
  it('PJE-XAX-001: a lab result\'s tooltip and accessible name read "Week 8 · Day 57" from lb_visit_col, and "Day 57" without a visit (#374)', () => {
    expect(DEFAULT_SETTINGS.lb_visit_col).toBe('VISIT');
    const settings = syncSettings({});
    const options = { mode: 'day', refDate: REF };

    const event = lb(settings);
    expect(tooltipLines(event, settings, options)[2]).toBe('Week 8 · Day 57');
    expect(laneAriaLabel(event, settings, options)).toContain('Week 8 · day 57');

    // Named under another column.
    const renamed = syncSettings({ lb_visit_col: 'AVISIT' });
    const avisit = lb(renamed, { VISIT: '', AVISIT: 'Week 8' });
    expect(tooltipLines(avisit, renamed, options)[2]).toBe('Week 8 · Day 57');

    // No visit on the record: the day alone, as before.
    expect(tooltipLines(lb(settings, { VISIT: '' }), settings, options)[2]).toBe('Day 57');
    const none = syncSettings({ lb_visit_col: null });
    expect(tooltipLines(lb(none), none, options)[2]).toBe('Day 57');
  });
});
