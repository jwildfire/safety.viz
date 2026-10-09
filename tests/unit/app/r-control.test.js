// @vitest-environment jsdom
// The R control (#276, #277, obot.roadmap#404): one control for every tab that
// starts R, in four states, and the contract a tab gives it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlState } from '../../../src/app/libraries.js';
import { R_PHASES, rControl, secondsSince } from '../../../src/app/r-control.js';
import {
  browserSaid,
  megabytesSaid,
  rWords,
  startedSaid,
  versionSaid,
  waitSaid,
  whereSaid
} from '../../../src/app/r-words.js';

const stateOf = (said) => controlState({ state: () => said });
const draw = (said, options) => {
  const control = rControl(stateOf(said), options);
  document.body.replaceChildren(control.row, ...(control.panel ? [control.panel] : []));
  return control;
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the R control', () => {
  it('APP-R-039: before a press the control is a few words for why R is needed, what starting it costs and one button, with the whole sentence on hover; once R is ready it is a quiet chip and no button is left behind (#276)', () => {
    expect(R_PHASES).toEqual(['off', 'starting', 'ready', 'failed']);
    const onPress = vi.fn();
    draw(
      {
        phase: 'off',
        say: 'Statistics need R',
        meta: '13 MB, once',
        title: 'Statistics need R. Start R to compute them.',
        label: 'Start R'
      },
      { onPress }
    );
    expect($('.sva-r').dataset.phase).toBe('off');
    expect($$('.sva-r-row > *').map((part) => [part.className, part.textContent])).toEqual([
      ['sva-r-say', 'Statistics need R'],
      ['sva-r-meta', '13 MB, once'],
      ['sva-action', 'Start R']
    ]);
    expect($('.sva-action').title).toBe('Statistics need R. Start R to compute them.');
    expect($('.sva-r-row').title).toBe('Statistics need R. Start R to compute them.');
    $('.sva-action').click();
    expect(onPress).toHaveBeenCalledTimes(1);

    const onToggle = vi.fn();
    const ready = draw(
      {
        phase: 'ready',
        say: 'R ready',
        title: 'R is running in this browser',
        details: { heading: 'R is running in this browser', rows: [['Version', 'R 4.6.0']] }
      },
      { onToggle }
    );
    expect($('.sva-r').dataset.phase).toBe('ready');
    // A chip, and no button: nothing greyed is left in the row.
    expect($('.sva-action')).toBeNull();
    expect($$('.sva-r button')).toHaveLength(1);
    const chip = $('.sva-chip.sva-r-ready');
    expect(chip.textContent).toBe('R ready▾');
    expect(chip.disabled).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.getAttribute('aria-label')).toBe('R is running in this browser. Show details');
    // Closed until asked for.
    expect(ready.panel).toBeNull();
    chip.click();
    expect(onToggle).toHaveBeenCalledWith(true);
    // A chip with nothing behind it cannot be opened.
    draw({ phase: 'ready', say: 'R ready' });
    expect($('.sva-chip').disabled).toBe(true);
  });

  it('APP-R-040: while R starts the control is a spinner, the words and a count of seconds that runs by itself, and no button; a tab whose start is long names the step it is on with a segment for each step (#276)', () => {
    vi.useFakeTimers();
    let clock = 5000;
    const control = draw(
      { phase: 'starting', say: 'Starting R', meta: '13 MB', since: 5000 },
      { now: () => clock }
    );
    expect($('.sva-r').dataset.phase).toBe('starting');
    expect($('.sva-r-row').getAttribute('role')).toBe('status');
    expect($('.sva-spin').getAttribute('aria-hidden')).toBe('true');
    expect($('.sva-r-say').textContent).toBe('Starting R');
    expect($('.sva-r-meta').textContent).toBe('13 MB · 0 s');
    expect($$('.sva-r button')).toEqual([]);
    expect($('.sva-segs')).toBeNull();
    clock = 8400;
    vi.advanceTimersByTime(1000);
    expect($('.sva-r-meta').textContent).toBe('13 MB · 3 s');
    // Its clock stops with it.
    control.destroy();
    clock = 60000;
    vi.advanceTimersByTime(5000);
    expect($('.sva-r-meta').textContent).toBe('13 MB · 3 s');
    expect(vi.getTimerCount()).toBe(0);
    // A control taken off the page stops counting by itself.
    draw({ phase: 'starting', say: 'Starting R', since: 0 }, { now: () => clock });
    expect(vi.getTimerCount()).toBe(1);
    document.body.innerHTML = '';
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
    // With no moment to count from there is no count, and nothing ticks.
    draw({ phase: 'starting', say: 'Starting R', meta: '13 MB' });
    expect($('.sva-r-meta').textContent).toBe('13 MB');
    expect(vi.getTimerCount()).toBe(0);
    expect(secondsSince(1000, 400)).toBe(0);
    expect(secondsSince(1000, 2999)).toBe(1);

    // The step, counted.
    draw(
      {
        phase: 'starting',
        say: 'Starting R',
        since: 0,
        step: { say: 'Installing packages', index: 2, of: 6 }
      },
      { now: () => 21000 }
    );
    expect($('.sva-r-say').textContent).toBe('Installing packages');
    expect($('.sva-segs').getAttribute('aria-label')).toBe('Step 2 of 6');
    expect($$('.sva-segs i').map((segment) => segment.className)).toEqual([
      'sva-done',
      'sva-now',
      '',
      '',
      '',
      ''
    ]);
    expect($('.sva-r-meta').textContent).toBe('21 s');
  });

  it('APP-R-041: when R did not start the control says so in words, in the alarm colour, with Try again beside it and the reason one click away; what the browser said is behind a disclosure inside that, never in the first line (#276, #277)', () => {
    const onPress = vi.fn();
    const onToggle = vi.fn();
    const failed = {
      phase: 'failed',
      say: 'R did not start',
      label: 'Try again',
      details: {
        heading: 'R did not start',
        text: ['The browser could not download R from webr.r-wasm.org.'],
        more: ['The browser said: Failed to fetch.'],
        moreTitle: 'What the browser said'
      }
    };
    const closed = draw(failed, { onPress, onToggle });
    expect($('.sva-r').dataset.phase).toBe('failed');
    expect($('.sva-r-row').getAttribute('role')).toBe('alert');
    expect($$('.sva-r-row > *').map((part) => part.textContent)).toEqual([
      'R did not start',
      'Try again',
      'Why▾'
    ]);
    expect($('.sva-r-say').classList.contains('sva-bad')).toBe(true);
    expect($('.sva-r-row').textContent).not.toContain('Failed to fetch');
    expect(closed.panel).toBeNull();
    $('.sva-action').click();
    expect(onPress).toHaveBeenCalledTimes(1);
    $('.sva-r-why').click();
    expect(onToggle).toHaveBeenLastCalledWith(true);

    const open = draw(failed, { open: true, onToggle });
    expect($('.sva-r-why').getAttribute('aria-expanded')).toBe('true');
    expect(open.panel.getAttribute('role')).toBe('dialog');
    expect(open.panel.getAttribute('aria-label')).toBe('R did not start');
    expect($('.sva-r-heading').textContent).toBe('R did not start');
    expect($('.sva-r-panel > .sva-r-text').textContent).toBe(
      'The browser could not download R from webr.r-wasm.org.'
    );
    const more = $('details.sva-r-more');
    expect(more.open).toBe(false);
    expect(more.querySelector('summary').textContent).toBe('What the browser said');
    expect(more.querySelector('.sva-r-text').textContent).toBe(
      'The browser said: Failed to fetch.'
    );
    // The chip closes it again, and so do the cross and Escape.
    $('.sva-r-why').click();
    expect(onToggle).toHaveBeenLastCalledWith(false);
    onToggle.mockClear();
    $('.sva-r-x').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onToggle.mock.calls).toEqual([[false], [false]]);
    // A control that is gone no longer listens.
    open.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onToggle).toHaveBeenCalledTimes(2);

    // The details of a ready control: terms, what is said of each, and what a tab adds.
    const press = vi.fn();
    draw(
      {
        phase: 'ready',
        say: 'R ready',
        details: {
          heading: 'R is running in this browser',
          rows: [
            ['Version', 'R 4.6.0, on webR 0.6.0'],
            ['Started', null],
            ['Downloaded', '13 MB, once, from webr.r-wasm.org']
          ],
          actions: [{ label: 'Run again', press }, { label: 'No press' }]
        }
      },
      { open: true }
    );
    // A line with nothing known is left out.
    expect($$('.sva-r-list dt').map((term) => term.textContent)).toEqual(['Version', 'Downloaded']);
    expect($$('.sva-r-list dd').map((said) => said.textContent)).toEqual([
      'R 4.6.0, on webR 0.6.0',
      '13 MB, once, from webr.r-wasm.org'
    ]);
    expect($('details.sva-r-more')).toBeNull();
    expect($$('.sva-r-actions button').map((button) => button.textContent)).toEqual(['Run again']);
    $('.sva-r-actions button').click();
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('APP-R-042: a tab gives the control a contract: its phase, the step it is on when starting takes long, and what its details hold; a control written before it is drawn as it was, and one that cannot be read is no control (#276)', () => {
    // Every member is present and of its kind, whatever was handed.
    expect(stateOf({})).toEqual({
      phase: 'off',
      say: '',
      meta: null,
      title: null,
      label: null,
      disabled: false,
      since: null,
      step: null,
      details: null,
      why: 'Why'
    });
    expect(stateOf({ phase: 'melting' }).phase).toBe('off');
    for (const phase of R_PHASES) expect(stateOf({ phase }).phase).toBe(phase);
    // The step: read only when it is whole.
    const step = { say: 'Installing packages', index: 2, of: 6 };
    expect(stateOf({ phase: 'starting', step, since: 12 })).toMatchObject({ step, since: 12 });
    for (const broken of [
      { ...step, index: 0 },
      { ...step, index: 7 },
      { ...step, index: 1.5 },
      { ...step, say: '' },
      { say: 'x', index: 1 },
      'packages'
    ]) {
      expect(stateOf({ phase: 'starting', step: broken }).step, JSON.stringify(broken)).toBeNull();
    }
    expect(stateOf({ since: 'yesterday' }).since).toBeNull();
    // The details: kept only with a heading, and each part only where it can be drawn.
    expect(stateOf({ details: { rows: [['a', 'b']] } }).details).toBeNull();
    const press = () => {};
    expect(
      stateOf({
        details: {
          heading: 'R is running in this browser',
          rows: [['Version', 'R 4.6.0'], ['Started', null], 'no', ['', 'x']],
          text: ['One sentence.', '', 4],
          more: ['Said.', null],
          actions: [{ label: 'Run again', press }, { label: 'x' }, null]
        }
      }).details
    ).toEqual({
      heading: 'R is running in this browser',
      rows: [['Version', 'R 4.6.0']],
      text: ['One sentence.'],
      more: ['Said.'],
      moreTitle: 'More',
      actions: [{ label: 'Run again', press }]
    });
    // The control of #183: a label, whether it is done, a note and a hint.
    expect(
      stateOf({ label: 'Start R', done: false, note: 'Starting R downloads it.', hint: '13 MB' })
    ).toMatchObject({
      phase: 'off',
      label: 'Start R',
      disabled: false,
      title: 'Starting R downloads it.',
      meta: '13 MB'
    });
    expect(stateOf({ label: 'R started', done: true }).disabled).toBe(true);
    draw({ label: 'Start R', hint: 'About 13 MB, once' });
    expect($$('.sva-r-row > *').map((part) => part.textContent)).toEqual([
      'About 13 MB, once',
      'Start R'
    ]);
    // No control, or one that cannot say its state.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(controlState(null)).toBeNull();
    expect(controlState({})).toBeNull();
    expect(controlState({ state: () => 'ready' })).toBeNull();
    expect(
      controlState({
        state() {
          throw new Error('no');
        }
      })
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('what is said wherever R is started (#277)', () => {
  const biomarkers = rWords({
    needs: 'Statistics',
    verb: 'compute them',
    megabytes: 13,
    from: 'webr.r-wasm.org',
    appears: 'The test',
    missing: 'there is no test',
    still: 'The charts still draw; only the statistics are missing.'
  });
  const metrics = rWords({
    needs: 'Site metrics',
    verb: 'run them',
    megabytes: 55,
    from: 'webr.r-wasm.org and repo.r-wasm.org',
    appears: 'The metrics',
    missing: 'no metric was run',
    still: 'No metric was run.'
  });

  it('APP-R-049: there is one set of sentences for R being off, starting, ready and not started; a tab brings only what needs R, what starting it downloads and what a failure leaves standing (#277)', () => {
    // Said the same by both.
    for (const key of ['start', 'starting', 'ready', 'readyHeading', 'failed', 'again', 'why']) {
      expect(metrics[key], key).toBe(biomarkers[key]);
    }
    expect(biomarkers).toMatchObject({
      start: 'Start R',
      starting: 'Starting R',
      ready: 'R ready',
      readyHeading: 'R is running in this browser',
      failed: 'R did not start',
      again: 'Try again',
      why: 'Why',
      stopped: 'R stopped answering'
    });
    // Said in the same frame, with what the tab brought.
    expect(biomarkers.need).toBe('Statistics need R');
    expect(metrics.need).toBe('Site metrics need R');
    expect(biomarkers.cost).toBe('13 MB, once');
    expect(metrics.cost).toBe('55 MB, once');
    expect(biomarkers.needTitle).toBe(
      'Statistics need R. Start R to compute them: about 13 MB, downloaded once from webr.r-wasm.org. The study’s data stays in this browser.'
    );
    expect(metrics.needTitle).toBe(
      'Site metrics need R. Start R to run them: about 55 MB, downloaded once from webr.r-wasm.org and repo.r-wasm.org. The study’s data stays in this browser.'
    );
    expect(biomarkers.startingMeta(3)).toBe('13 MB · 3 s');
    expect(biomarkers.failedReason()).toBe(
      'The browser could not download R from webr.r-wasm.org. Check the connection, or whether this network blocks that address, and try again. The charts still draw; only the statistics are missing.'
    );
    expect(metrics.failedReason('R’s packages', 'repo.r-wasm.org')).toBe(
      'The browser could not download R’s packages from repo.r-wasm.org. Check the connection, or whether this network blocks that address, and try again. No metric was run.'
    );
    expect(metrics.failedOther).toBe(
      'R could not be started on this page. Try again; if it fails again, reload the page. No metric was run.'
    );
    expect(metrics.stoppedReason('5 minutes', 'it was running the workflows')).toBe(
      'R gave no answer for 5 minutes while it was running the workflows, so it was closed. Try again; if it stops again, reload the page. No metric was run.'
    );
    // The one short line in the view points at the control, where it is.
    expect(biomarkers.viewNeed()).toBe('Statistics need R. Start R, at the top right.');
    expect(biomarkers.viewStarting).toBe('R is starting. The test appears here when it is ready.');
    expect(biomarkers.viewFailed()).toBe(
      'R did not start, so there is no test. Try again, at the top right.'
    );
    expect(metrics.viewFailed()).toBe(
      'R did not start, so no metric was run. Try again, at the top right.'
    );
    // On a phone the control is first in the row, above the chart.
    const matchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === '(max-width:760px)' });
    expect(whereSaid()).toBe('above');
    expect(biomarkers.viewNeed()).toBe('Statistics need R. Start R, above.');
    window.matchMedia = matchMedia;
    expect(whereSaid()).toBe('at the top right');
  });

  it('APP-R-050: what the browser or R said is a sentence of its own, R’s version and the runtime’s are said together with what is not known left out, and times are said in words (#276, #277)', () => {
    expect(browserSaid('Failed to fetch')).toBe('The browser said: Failed to fetch.');
    expect(browserSaid('  It stopped.  ')).toBe('The browser said: It stopped.');
    expect(browserSaid('Why?')).toBe('The browser said: Why?');
    expect(browserSaid(null)).toBe('The browser gave no reason.');
    expect(browserSaid('', 'R')).toBe('R gave no reason.');
    expect(browserSaid('there is no package called ‘duckdb’', 'R')).toBe(
      'R said: there is no package called ‘duckdb’.'
    );
    expect(versionSaid({ r: '4.6.0', webr: '0.6.0' })).toBe('R 4.6.0, on webR 0.6.0');
    expect(versionSaid({ r: '4.6.0' })).toBe('R 4.6.0');
    expect(versionSaid({ webr: '0.6.0' })).toBe('webR 0.6.0');
    expect(versionSaid()).toBeNull();
    expect(megabytesSaid(13)).toBe('13 MB');
    expect(startedSaid(1540)).toBe('in 1.5 seconds');
    expect(startedSaid(1000)).toBe('in 1 second');
    expect(startedSaid(4)).toBe('in 0.1 seconds');
    expect(waitSaid(600)).toBe('10 minutes');
    expect(waitSaid(180)).toBe('3 minutes');
    expect(waitSaid(90)).toBe('90 seconds');
    expect(waitSaid(1)).toBe('1 second');
  });
});
