// The visit numbering and study day the demo extracts carry (#365, #366).
import { describe, expect, it } from 'vitest';
import {
  analysisVisit,
  demoDataContract,
  scheduledVisitNum,
  syntheticStudyDay,
  visitNumberer
} from '../../../scripts/demo-data-lib.mjs';

describe('scheduledVisitNum', () => {
  it('numbers Baseline 0, Week N as N and Screening before Baseline (#366)', () => {
    expect(scheduledVisitNum('Baseline')).toBe(0);
    expect(scheduledVisitNum('Week 2')).toBe(2);
    expect(scheduledVisitNum('Week 26')).toBe(26);
    expect(scheduledVisitNum('SCREENING 1')).toBe(-2);
    expect(scheduledVisitNum('Screening 2')).toBe(-1);
    expect(scheduledVisitNum('Unscheduled 4.1')).toBeNull();
  });
});

describe('visitNumberer', () => {
  // The pilot's labs number Week 2 as 4 and Week 26 as 13, and their baseline was
  // drawn at SDTM visit 1 (Screening 1).
  const labs = [
    { AVISIT: 'Baseline', AVISITN: '0', VISIT: 'SCREENING 1', VISITNUM: '1' },
    { AVISIT: 'Week 2', AVISITN: '4', VISIT: 'WEEK 2', VISITNUM: '4' },
    { AVISIT: 'Week 26', AVISITN: '13', VISIT: 'WEEK 26', VISITNUM: '13' },
    { AVISIT: 'Unscheduled 4.1', AVISITN: '4.1', VISIT: 'UNSCHEDULED 4.1', VISITNUM: '4.1' },
    { AVISIT: 'Unscheduled 1.1', AVISITN: '1.1', VISIT: 'UNSCHEDULED 1.1', VISITNUM: '1.1' }
  ];
  const number = visitNumberer(labs);

  it('renumbers a scheduled visit from its label, whatever the domain numbered it (#366)', () => {
    expect(number(labs[1])).toBe(2);
    expect(number(labs[2])).toBe(26);
  });

  it('puts an unscheduled visit 0.1 after the visit it follows (#366)', () => {
    expect(number(labs[3])).toBe(2.1);
    // SDTM visit 1 is where the labs' baseline was drawn.
    expect(number(labs[4])).toBe(0.1);
  });

  it('refuses a visit it cannot place, rather than guessing (#366)', () => {
    expect(() => number({ AVISIT: 'Follow-up', AVISITN: '99', VISIT: '', VISITNUM: '' })).toThrow(
      /Follow-up/
    );
  });
});

describe('syntheticStudyDay', () => {
  it('gives the synthetic cohorts a planned study day: Baseline day 1, Week N day 7N + 1 (#366)', () => {
    expect(syntheticStudyDay('Baseline')).toBe(1);
    expect(syntheticStudyDay('Week 4')).toBe(29);
    expect(syntheticStudyDay('Week 26')).toBe(183);
  });
});

describe('demoDataContract', () => {
  const header = 'USUBJID,VISIT,VISITNUM,TEST,STRESN,DY,ABLFL';
  const ok = `${header}\nA,Baseline,0,ALT,10,-3,Y\nA,Week 2,2,ALT,12,15,\n`;
  const egOk = 'USUBJID,VISIT,VISITNUM,TEST,STRESN,ABLFL,DY\nA,Baseline,0,QTcF,400,Y,1\n';
  const pjeOk = 'USUBJID,LBTEST,LBDY,VISIT,VISITNUM\nA,ALT,-3,Baseline,0\n';

  it('passes extracts that carry the visit, the study day and the baseline flag (#365)', () => {
    expect(demoDataContract({ 'adbds.csv': ok, 'adeg.csv': egOk, 'pje-lb.csv': pjeOk })).toEqual(
      []
    );
  });

  it('fails a lab row with no study day, naming the file and row (#365)', () => {
    const missing = `${header}\nA,Baseline,0,ALT,10,-3,Y\nA,Week 2,2,ALT,12,,\n`;
    const problems = demoDataContract({ 'adbds.csv': missing });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/adbds\.csv row 3.*DY/);
  });

  it('fails an extract that lacks a required column (#365)', () => {
    const problems = demoDataContract({
      'adbds.csv': 'USUBJID,VISIT,VISITNUM,TEST\nA,Baseline,0,ALT\n'
    });
    expect(problems.join('\n')).toMatch(/adbds\.csv.*DY/);
    expect(problems.join('\n')).toMatch(/adbds\.csv.*ABLFL/);
  });

  it('fails one visit label numbered two ways across the extracts (#366)', () => {
    const vs = `${header}\nA,Week 26,26,Pulse,70,183,\n`;
    const lb = `${header}\nA,Week 26,13,ALT,12,183,\n`;
    const problems = demoDataContract({ 'adbds.csv': vs + lb.split('\n').slice(1).join('\n') });
    expect(problems.join('\n')).toMatch(/Week 26.*13.*26|Week 26.*26.*13/);
  });
});

describe('analysisVisit', () => {
  it('shows a flagged baseline with no analysis visit as Baseline, numbered 0 (#366)', () => {
    const rec = { AVISIT: 'NA', AVISITN: 'NA', VISIT: 'SCREENING 1', VISITNUM: '1', ABLFL: 'Y' };
    expect(analysisVisit(rec)).toBe('Baseline');
    expect(visitNumberer([rec])(rec)).toBe(0);
    expect(analysisVisit({ ...rec, ABLFL: 'NA' })).toBe('SCREENING 1');
  });
});
