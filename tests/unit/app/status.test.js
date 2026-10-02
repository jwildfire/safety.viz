import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { parseFile } from '../../../src/app/parse.js';
import { buildMapping, setColumn, setMeasure } from '../../../src/app/mapping.js';
import { chartStatus, neededBy, supportedCount } from '../../../src/app/status.js';

const demo = (file) =>
  parseFile(file, readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8'));

const files = {
  subject: demo('adsl.csv'),
  ae: demo('adae.csv'),
  bds: demo('adbds.csv'),
  eg: demo('adeg.csv')
};
const demoMappings = () =>
  Object.fromEntries(
    Object.entries(files).map(([domain, file]) => [domain, buildMapping(domain, file, manifest)])
  );

// A made-up chart that reads domains outside the standard set. No chart the
// app lists does since the experimental Patient Journey Explorer left the
// manifest (#165); the app's handling of one is kept, and held by this entry.
const withOutside = {
  ...manifest,
  modules: {
    ...manifest.modules,
    'visit-calendar': {
      export: 'visitCalendar',
      title: 'Visit Calendar',
      domains: [],
      externalDomains: ['sv', 'tv'],
      settings: {},
      note: 'Reads two domains of its own: subject visits and planned visits.'
    }
  }
};

const states = (status) =>
  Object.fromEntries(Object.entries(status).map(([module, entry]) => [module, entry.state]));

describe('demo app: chart status', () => {
  it('APP-STAT-001: on the demo study all thirteen charts are ready (#149, #165)', () => {
    const status = chartStatus(demoMappings(), manifest);
    expect(Object.keys(status)).toEqual(Object.keys(manifest.modules));
    const ready = Object.entries(states(status)).filter(([, state]) => state === 'ready');
    expect(ready).toHaveLength(13);
    expect(supportedCount(status)).toEqual({ ready: 13, total: 13 });
    // The experimental Patient Journey Explorer is not among the charts.
    expect(status).not.toHaveProperty('patient-journey-explorer');
  });

  it('APP-STAT-009: a chart that reads domains outside the standard set needs more domains, whatever is loaded (#165)', () => {
    for (const mappings of [{}, demoMappings()]) {
      const status = chartStatus(mappings, withOutside);
      expect(status['visit-calendar']).toEqual({ state: 'needs more domains', missing: [] });
    }
    // It is counted among the charts, and never among the ready ones.
    expect(supportedCount(chartStatus(demoMappings(), withOutside))).toEqual({
      ready: 13,
      total: 14
    });
  });

  it('APP-STAT-002: a chart whose domain has no file says which file, and is not an error (#149)', () => {
    const { bds } = demoMappings();
    const status = chartStatus({ bds }, manifest);
    expect(status.histogram.state).toBe('ready');
    expect(status['qt-explorer']).toMatchObject({
      state: 'no file',
      missing: [{ kind: 'domain', domain: 'eg', label: 'ECG' }]
    });
    // Time to event reads two tables and names both.
    expect(status['time-to-event'].missing.map((item) => item.label)).toEqual([
      'Adverse events',
      'Subject-level'
    ]);
    // An optional domain never holds a chart back.
    expect(status['participant-profile'].state).toBe('ready');
    expect(supportedCount(status)).toEqual({ ready: 9, total: 13 });
  });

  it('APP-STAT-003: with no upper limit of normal, the two hepatic charts and the participant profile say so by name (#149)', () => {
    const mappings = demoMappings();
    mappings.bds = setColumn(mappings.bds, 'STNRHI', null, files.bds);
    const status = chartStatus(mappings, manifest);
    for (const module of ['hep-explorer', 'hep-waterfall', 'participant-profile']) {
      expect(status[module].state, module).toBe('missing');
      expect(status[module].missing, module).toEqual([
        { kind: 'column', domain: 'bds', key: 'STNRHI', label: 'Upper limit of normal' }
      ]);
    }
    // Charts for which the column is optional are untouched.
    expect(status.histogram.state).toBe('ready');
    expect(status['nep-explorer'].state).toBe('ready');
  });

  it('APP-STAT-004: a chart that finds its measures by name is missing them by name (#149)', () => {
    const mappings = demoMappings();
    mappings.bds = setMeasure(setMeasure(mappings.bds, 'CREAT', null), 'TB', null);
    const status = chartStatus(mappings, manifest);
    expect(status['nep-explorer']).toMatchObject({
      state: 'missing',
      missing: [{ kind: 'measure', domain: 'bds', key: 'CREAT', label: 'Creatinine' }]
    });
    expect(status['hep-explorer'].missing).toEqual([
      { kind: 'measure', domain: 'bds', key: 'TB', label: 'Total bilirubin' }
    ]);
    // The waterfall needs ALT only; the profile draws whichever measures exist.
    expect(status['hep-waterfall'].state).toBe('ready');
    expect(status['participant-profile'].state).toBe('ready');
  });

  it('APP-STAT-005: the QT explorer needs one QTc correction, not both (#149)', () => {
    const mappings = demoMappings();
    mappings.eg = setMeasure(mappings.eg, 'QTcF', null);
    expect(chartStatus(mappings, manifest)['qt-explorer'].state).toBe('ready');
    mappings.eg = setMeasure(mappings.eg, 'QTcB', null);
    expect(chartStatus(mappings, manifest)['qt-explorer']).toMatchObject({
      state: 'missing',
      missing: [{ kind: 'measure', domain: 'eg', key: 'QTcF', label: 'QTcF or QTcB' }]
    });
  });

  it('APP-STAT-006: time to event needs its participant and day columns although its schema requires none (#149)', () => {
    const mappings = demoMappings();
    mappings.subject = setColumn(mappings.subject, 'EOSDY', null, files.subject);
    mappings.ae = setColumn(mappings.ae, 'USUBJID', null, files.ae);
    const status = chartStatus(mappings, manifest);
    expect(status['time-to-event'].state).toBe('missing');
    expect(status['time-to-event'].missing).toEqual([
      { kind: 'column', domain: 'ae', key: 'USUBJID', label: 'Participant' },
      { kind: 'column', domain: 'subject', key: 'EOSDY', label: 'End-of-study day' }
    ]);
  });

  it('APP-STAT-007: with nothing loaded no chart is ready and none is in error (#149)', () => {
    const status = chartStatus({}, manifest);
    expect(supportedCount(status)).toEqual({ ready: 0, total: 13 });
    expect(new Set(Object.values(states(status)))).toEqual(new Set(['no file']));
  });
});

describe('demo app: what needs each row', () => {
  it('APP-STAT-008: each column and measure knows which charts cannot draw without it (#151)', () => {
    const needed = neededBy(manifest);
    expect(needed.columns.bds.STNRHI).toEqual([
      'Hepatic Safety Explorer',
      'Hepatic ALT Waterfall',
      'Participant Profile'
    ]);
    expect(needed.columns.bds.ARM).toEqual(['Hepatic ALT Waterfall']);
    // Optional everywhere: no chart needs it.
    expect(needed.columns.bds.DY).toEqual([]);
    // Time to event's needs come from the chart, not its schema's empty required list.
    expect(needed.columns.subject.EOSDY).toEqual(['Time-to-Event Explorer']);
    expect(needed.columns.ae.USUBJID).toContain('Time-to-Event Explorer');
    expect(needed.measures.CREAT).toEqual(['Nephrotoxicity Explorer']);
    expect(needed.measures.ALT).toEqual(['Hepatic Safety Explorer', 'Hepatic ALT Waterfall']);
    // One of the two corrections is enough, so neither is needed on its own account.
    expect(needed.measures.QTcF).toEqual([]);
    expect(needed.anyMeasure).toEqual([{ keys: ['QTcF', 'QTcB'], charts: ['QT Safety Explorer'] }]);
  });
});
