// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHeader } from '../../../src/participant-profile/header.js';

const participant = (overrides = {}) => ({
  id: 'P1',
  details: [
    { label: 'Sex', value: 'F' },
    { label: 'Age', value: 62 }
  ],
  rRatio: 4 / 1.2,
  pAlt: null,
  ...overrides
});

describe('renderHeader (PPRF-2, PPRF-HDR-001)', () => {
  it('renders the participant id and a label/value entry per detail', () => {
    const header = renderHeader(participant(), {});
    expect(header.querySelector('.sv-profile-id').textContent).toContain('P1');
    const labels = [...header.querySelectorAll('.sv-profile-detail-label')].map(
      (el) => el.textContent
    );
    const values = [...header.querySelectorAll('.sv-profile-detail-value')].map(
      (el) => el.textContent
    );
    expect(labels.slice(0, 2)).toEqual(['Sex', 'Age']);
    expect(values.slice(0, 2)).toEqual(['F', '62']);
  });

  it('shows the computed R Ratio to two decimals, blank when not computable', () => {
    const header = renderHeader(participant(), {});
    const items = [...header.querySelectorAll('li')];
    const rratio = items.find((li) => li.textContent.includes('R Ratio'));
    expect(rratio.querySelector('.sv-profile-detail-value').textContent).toBe('3.33');

    const blank = renderHeader(participant({ rRatio: NaN }), {});
    const blankItem = [...blank.querySelectorAll('li')].find((li) =>
      li.textContent.includes('R Ratio')
    );
    expect(blankItem.querySelector('.sv-profile-detail-value').textContent).toBe('');
  });

  it('renders P_ALT only when the pass-through yields a value', () => {
    const none = renderHeader(participant(), {});
    expect(none.querySelector('.sv-profile-palt')).toBeNull();

    const withValue = renderHeader(participant({ pAlt: '0.87' }), {});
    const palt = withValue.querySelector('.sv-profile-palt');
    expect(palt).not.toBeNull();
    expect(palt.querySelector('.sv-profile-detail-value').textContent).toBe('0.87');
  });

  it("supports the original's {text_value, note} P_ALT shape with click-to-footnote", () => {
    const header = renderHeader(
      participant({ pAlt: { text_value: '<0.01', note: 'P_ALT computed externally.' } }),
      {}
    );
    const value = header.querySelector('.sv-profile-palt .sv-profile-detail-value');
    expect(value.textContent).toBe('<0.01');
    expect(header.querySelector('.sv-profile-footnote').textContent).toBe('');
    value.click();
    expect(header.querySelector('.sv-profile-footnote').textContent).toBe(
      'P_ALT computed externally.'
    );
  });

  it('templates the link-out href by {id}, and omits the link without a URL (closes #53)', () => {
    const linked = renderHeader(participant(), {
      participantProfileURL: 'https://x.test/{id}/profile'
    });
    const anchor = linked.querySelector('a.sv-profile-link');
    expect(anchor.getAttribute('href')).toBe('https://x.test/P1/profile');

    const bare = renderHeader(participant(), {});
    expect(bare.querySelector('a.sv-profile-link')).toBeNull();
  });

  it('invokes the Clear handler from a real button, dispatching no selection event (PPRF-6)', () => {
    const onClear = vi.fn();
    const dispatched = vi.spyOn(document, 'dispatchEvent');
    const header = renderHeader(participant(), {}, { onClear });
    const button = header.querySelector('button.sv-profile-clear');
    expect(button.type).toBe('button');
    button.click();
    expect(onClear).toHaveBeenCalledTimes(1);
    const selectionEvents = dispatched.mock.calls.filter(
      ([event]) => event.type === 'participantsSelected'
    );
    expect(selectionEvents).toEqual([]);
    dispatched.mockRestore();
  });
});
