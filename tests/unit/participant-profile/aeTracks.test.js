// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { syncAeSettings, cleanAeRecords, participantEvents } from '../../../src/participant-profile/ae.js';
import { renderAeTracks } from '../../../src/participant-profile/aeTracks.js';
import { makeAeRecords } from './fixture.js';

const settings = syncAeSettings({});
const { events } = cleanAeRecords(makeAeRecords(), settings);
const mine = participantEvents(events, 'P1');

let host;
beforeEach(() => {
  host = document.createElement('div');
  document.body.innerHTML = '';
  document.body.append(host);
});

describe('renderAeTracks — the summary block (PPRF-AESUM-001)', () => {
  it('renders the four headline figures with their labels', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const labels = [...host.querySelectorAll('.sv-profile-ae-tile-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Events', 'Highest severity', 'Serious', 'No end date']);
    const values = [...host.querySelectorAll('.sv-profile-ae-tile-value')].map((n) =>
      n.textContent.trim()
    );
    expect(values).toEqual(['8', 'Severe', '1', '3']);
  });

  it('names every severity level in the mix legend, so hue never carries it alone', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const legend = [...host.querySelectorAll('.sv-profile-ae-legend-item')].map(
      (n) => n.textContent
    );
    expect(legend).toEqual(['Severe 1', 'Moderate 2', 'Mild 4', 'Not recorded 1']);
  });

  it('gives the mix bar a text alternative', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    expect(host.querySelector('.sv-profile-ae-mix').getAttribute('aria-label')).toContain(
      'Severe 1'
    );
  });

  it('lists body systems most-first with counts', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const first = host.querySelector('.sv-profile-ae-soc li');
    expect(first.textContent).toContain('Gastrointestinal disorders');
    expect(first.querySelector('.sv-profile-ae-soc-count').textContent).toBe('3');
  });
});

describe('renderAeTracks — the timeline (PPRF-AETL-001)', () => {
  it('draws one row per placeable event, capped at max_rows', () => {
    host.append(renderAeTracks(mine, [2, 90], syncAeSettings({ max_rows: 3 })));
    expect(host.querySelectorAll('.sv-profile-ae-row')).toHaveLength(3);
    expect(host.querySelector('.sv-profile-ae-more').textContent).toContain('4 more events');
  });

  it('places bars as percentages of the shared domain', () => {
    host.append(renderAeTracks(mine, [0, 100], settings));
    const bar = host.querySelector('.sv-profile-ae-row .sv-profile-ae-bar');
    // Worst-first: the severe hepatic failure, day 30 to 45.
    expect(bar.style.left).toBe('30%');
    expect(bar.style.width).toBe('15%');
  });

  it('marks open-ended events in the label as well as the bar', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const openRow = [...host.querySelectorAll('.sv-profile-ae-row')].find((row) =>
      row.textContent.includes('fatigue')
    );
    expect(openRow.querySelector('.sv-profile-ae-bar').classList.contains('is-open-ended')).toBe(
      true
    );
    expect(openRow.textContent).toContain('no end date');
  });

  it('marks serious events in the label as well as the bar', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const row = [...host.querySelectorAll('.sv-profile-ae-row')].find((r) =>
      r.textContent.includes('hepatic failure')
    );
    expect(row.querySelector('.sv-profile-ae-bar').classList.contains('is-serious')).toBe(true);
    expect(row.textContent).toContain('serious');
  });

  it('gives every bar a text alternative naming days and severity', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const label = host.querySelector('.sv-profile-ae-bar').getAttribute('aria-label');
    expect(label).toContain('Severe');
    expect(label).toContain('day 30 to day 45');
  });

  it('names events with no start day instead of dropping them silently', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    expect(host.querySelector('.sv-profile-ae-unplaceable').textContent).toContain('no start day');
  });

  it('pads the plot to the labs chart gutters so the two axes line up', () => {
    host.append(renderAeTracks(mine, [2, 90], settings));
    const area = host.querySelector('.sv-profile-ae-plotarea');
    expect(area.style.paddingLeft).toBe('56px');
    expect(area.style.paddingRight).toBe('12px');
  });

  it('draws a day ruler under the rows', () => {
    host.append(renderAeTracks(mine, [0, 100], settings));
    const labels = [...host.querySelectorAll('.sv-profile-ae-tick')];
    const values = labels.map((n) => Number(n.textContent));
    expect(values.length).toBeGreaterThan(1);
    expect(values[0]).toBe(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
    // Evenly spaced, and positioned as percentages of the same domain the bars use.
    expect(values[1] - values[0]).toBe(values[2] - values[1]);
    expect(labels[0].style.left).toBe('0%');
  });
});

describe('renderAeTracks — the states that are not a happy path', () => {
  it('says so, once, when the participant has no events', () => {
    host.append(renderAeTracks([], [0, 100], settings));
    expect(host.querySelector('.sv-profile-ae-empty').textContent).toBe(
      'No adverse events recorded for this participant.'
    );
    expect(host.querySelectorAll('.sv-profile-ae-row')).toHaveLength(0);
  });

  it('keeps the summary but suppresses the timeline when no study day resolves (D7)', () => {
    host.append(renderAeTracks(mine, null, settings));
    expect(host.querySelectorAll('.sv-profile-ae-tile')).toHaveLength(4);
    expect(host.querySelectorAll('.sv-profile-ae-row')).toHaveLength(0);
    expect(host.querySelector('.sv-profile-ae-empty').textContent).toContain(
      'the event timeline is not drawn'
    );
  });
});
