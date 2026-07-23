// The participant-profile header block (#98, PPRF-2): the participant id, an
// optional {id}-templated link-out, a Clear affordance, and a details list of
// demographics + the computed R Ratio + P_ALT (where the pass-through yields a
// value). Parity target: the original renderer's participantHeader/
// makeParticipantHeader.js. Plain DOM via shell.createElement (house idiom, see
// src/histogram/listing.js); no Chart.js. The block never dispatches a
// selection event — Clear is a callback (PPRF-6).

import { createElement } from '../shell.js';
import { templateProfileURL } from './configure.js';

/** Format a number to two decimals, '' when not finite (parity: d3.format('0.2f')). */
function format2(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

/**
 * Append a labelled detail item (label over value) to a list.
 * @param {HTMLElement} list The `<ul>` to append to.
 * @param {string} label The item label.
 * @param {string} value The item value (already stringified).
 * @param {string} [className] Optional class for the `<li>`.
 * @returns {HTMLElement} The value element, for interactive P_ALT wiring.
 * @private
 */
function appendDetail(list, label, value, className) {
  const li = createElement('li', className || null);
  li.append(createElement('div', 'sv-profile-detail-label', label));
  const valueEl = createElement('div', 'sv-profile-detail-value', value);
  li.append(valueEl);
  list.append(li);
  return valueEl;
}

/**
 * Render the participant-profile header (PPRF-2).
 * @param {Object} participant The header model ({ id, details, rRatio, pAlt }).
 * @param {Object} settings Normalized settings ({ participantProfileURL }).
 * @param {Object} [handlers] Optional handlers ({ onClear }).
 * @returns {HTMLElement} The header element.
 */
export function renderHeader(participant, settings, { onClear } = {}) {
  const header = createElement('div', 'sv-profile-header');

  const titleRow = createElement('div', 'sv-profile-titlerow');
  titleRow.append(createElement('h3', 'sv-profile-id', `Participant ${participant.id}`));

  const url = templateProfileURL(settings.participantProfileURL, participant.id);
  if (url) {
    const link = createElement('a', 'sv-profile-link', 'Full Participant Profile');
    link.setAttribute('href', url);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
    titleRow.append(link);
  }

  const clear = createElement('button', 'sv-profile-clear', 'Clear');
  clear.type = 'button';
  clear.setAttribute('data-sv-focus', 'clear');
  clear.onclick = () => {
    if (onClear) onClear();
  };
  titleRow.append(clear);
  header.append(titleRow);

  const list = createElement('ul', 'sv-profile-details');
  (participant.details || []).forEach((detail) => {
    const value = detail.value === undefined || detail.value === null ? '' : String(detail.value);
    appendDetail(list, detail.label, value);
  });
  appendDetail(list, 'R Ratio', format2(participant.rRatio));

  // The footnote the interactive P_ALT note writes into (parity: the original's
  // click-to-footnote behaviour).
  const footnote = createElement('p', 'sv-profile-footnote', '');

  if (participant.pAlt !== undefined && participant.pAlt !== null && participant.pAlt !== '') {
    const isNote = typeof participant.pAlt === 'object';
    const text = isNote ? String(participant.pAlt.text_value) : String(participant.pAlt);
    const valueEl = appendDetail(list, 'P_ALT', text, 'sv-profile-palt');
    if (isNote && participant.pAlt.note) {
      valueEl.setAttribute('role', 'button');
      valueEl.setAttribute('tabindex', '0');
      const show = () => {
        footnote.textContent = participant.pAlt.note;
      };
      valueEl.onclick = show;
      valueEl.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          show();
        }
      };
    }
  }

  header.append(list, footnote);
  return header;
}
