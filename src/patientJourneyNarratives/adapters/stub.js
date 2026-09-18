// The stub adapter (#146, design §12): deterministic, offline, and honest.
// It behaves like a model that reads the grounding rows, makes one tool call
// (so the runtime's tool loop, scope collection and validator are exercised
// on every run), and submits a draft templated from the REAL rows — so every
// citation resolves and every number is the chart's own. The open-source
// demo site ships with this adapter; the tests and the CI eval gate run
// against it. Its sentences obey the style guide by construction.

import { parseFirstMessage } from '../index.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const were = (n) => (n === 1 ? 'was' : 'were');
const is = (n) => (n === 1 ? 'is' : 'are');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const unitText = (unit) => (unit ? ` ${unit}` : '');
const names = (rows) => rows.map((row) => row.label).join(', ');
const cite = (rows) => [...new Set(rows.map((row) => row.row_id))].slice(0, 12);

const offsetPhrase = (dfa) => {
  if (!finite(dfa)) return 'at an unplaceable day';
  if (dfa === 0) return 'on the anchor day';
  return dfa < 0
    ? `${plural(-dfa, 'day')} before the anchor`
    : `${plural(dfa, 'day')} after the anchor`;
};

const spanText = (row) => {
  if (!finite(row.start_day)) return 'with no usable start day';
  if (finite(row.end_day))
    return row.end_day === row.start_day
      ? `on day ${row.start_day}`
      : `from day ${row.start_day} to day ${row.end_day}`;
  if (row.end_state === 'ongoing') return `from day ${row.start_day}, recorded as ongoing`;
  return `from day ${row.start_day}, with no end date recorded`;
};

const ratioText = (row) =>
  row.ratio_to_limit
    ? `${row.ratio_to_limit.ratio} × ${row.ratio_to_limit.limit}`
    : 'within the reference range';

const sentence = (text, rows, confidence = 'high') => ({
  text,
  citations: Array.isArray(rows) ? cite(rows) : cite([rows]),
  confidence
});

function eventContext(inputs, g, extra) {
  const a = g.anchor;
  const sentences = [];
  const flags = [];
  const severity = a.severity ? a.severity.toLowerCase() : 'severity not recorded';
  sentences.push(
    sentence(
      `${a.label} is recorded ${spanText(a)}, ${severity}${a.serious ? ', serious' : ''}${a.outcome ? `, outcome ${a.outcome.toLowerCase()}` : ''}.`,
      a
    )
  );
  if (a.serious) flags.push('sae');
  const cm = g.con_meds_active || [];
  if (cm.length) {
    const unrecorded = g.not_evaluated?.con_meds_end_unrecorded ?? 0;
    let text = `${plural(cm.length, 'con-med')} ${were(cm.length)} active at onset: ${names(cm)}.`;
    if (unrecorded > 0) {
      text +=
        unrecorded === cm.length
          ? ' No end date is recorded for any of them.'
          : ` No end date is recorded for ${unrecorded} of them.`;
      flags.push('ends-unrecorded');
    }
    sentences.push(sentence(text, cm, unrecorded > 0 ? 'low' : 'high'));
  } else {
    sentences.push(sentence('No con-meds were active at onset.', a));
  }
  const labs = g.abnormal_labs || [];
  for (const lab of labs.slice(0, 2)) {
    const change = lab.abnormal_reason !== 'flag' && finite(lab.x_baseline);
    if (change) flags.push('labs:change-rule');
    sentences.push(
      sentence(
        `${lab.test} was ${lab.value}${unitText(lab.unit)} on day ${lab.start_day} (${ratioText(lab)}${change ? `, ${lab.x_baseline} × baseline` : ''}), ${offsetPhrase(lab.days_from_anchor)}.`,
        lab,
        'medium'
      )
    );
  }
  const doses = g.dose_changes || [];
  if (doses.length) {
    const d = doses[0];
    sentences.push(
      sentence(
        `The dose changed from ${d.dose_from} to ${d.dose_to}${unitText(d.unit)} on day ${d.start_day} (${d.direction || 'change'}), ${offsetPhrase(d.days_from_anchor)}${doses.length > 1 ? `; ${plural(doses.length - 1, 'further dose change')} ${is(doses.length - 1)} in the window` : ''}.`,
        doses,
        'medium'
      )
    );
  }
  const prior = g.prior_same_term_events || [];
  if (prior.length) {
    const recent = prior[0];
    const when =
      recent.days_before_anchor === 0
        ? 'recorded on the same day'
        : `started ${plural(recent.days_before_anchor, 'day')} before the anchor`;
    sentences.push(
      sentence(
        `${plural(prior.length, 'earlier or same-day event')} with the same preferred term ${is(prior.length)} recorded; the most recent ${when}.`,
        prior,
        'medium'
      )
    );
  }
  const later = g.con_meds_started_later || [];
  if (later.length && sentences.length < 6) {
    sentences.push(
      sentence(
        `${names(later)} started later in the window, ${offsetPhrase(later[0].days_from_anchor)}.`,
        later,
        'medium'
      )
    );
  }
  const c = g.counts || {};
  if (!cm.length && !labs.length && !doses.length && !prior.length && !later.length)
    flags.push('context:empty');
  return {
    kind: 'event-context',
    subject: inputs.subject,
    anchor: { domain: a.domain, row_id: a.row_id, term: a.label, start_day: a.start_day },
    window_days: g.window.days,
    summary: `${a.label} on day ${a.start_day}: ${plural(c.conMeds ?? cm.length, 'con-med')} active, ${plural(c.abnormalLabs ?? labs.length, 'abnormal lab')}, ${plural(c.doseChanges ?? doses.length, 'dose change')} within ±${g.window.days} days.`,
    sentences: sentences.slice(0, 6),
    flags,
    __extraUsed: Boolean(extra)
  };
}

function subjectSummary(inputs, g, extra) {
  const sentences = [];
  const flags = [];
  const counts = g.counts || {};
  const dose = extra && extra.records ? extra : null;
  if (dose && dose.records.length) {
    const range = g.dose_range;
    sentences.push(
      sentence(
        `Exposure to ${g.treatments.join(' and ')} is recorded from day ${g.exposure_extent.first_day} to day ${g.exposure_extent.last_day}${range ? ` at ${range.min === range.max ? range.min : `${range.min}–${range.max}`}${unitText(range.unit)}` : ''}, with ${plural(dose.changes.length, 'dose change')}.`,
        dose.records
      )
    );
  }
  const terms = g.adverse_event_terms || [];
  if (counts.AE > 0 && terms.length) {
    const top = terms.slice(0, 3);
    sentences.push(
      sentence(
        `${plural(counts.AE, 'adverse event')} ${is(counts.AE)} recorded across ${plural(terms.length, 'preferred term')}; the most frequent ${is(top.length)} ${top.map((t) => `${t.term} (${t.count})`).join(', ')}.`,
        top.flatMap((t) => t.row_ids.map((row_id) => ({ row_id }))),
        'medium'
      )
    );
  }
  const sae = g.serious_adverse_events || [];
  if (sae.length) {
    flags.push('sae');
    sentences.push(
      sentence(
        `${plural(sae.length, 'serious adverse event')} ${is(sae.length)} recorded: ${sae.map((e) => `${e.label} on day ${e.start_day}`).join('; ')}.`,
        sae
      )
    );
  }
  const dispo = (g.disposition || []).filter((row) => row.reference);
  if (dispo.length) {
    sentences.push(
      sentence(
        `The disposition event is ${dispo.map((d) => `${d.label} on day ${d.start_day}`).join('; ')}.`,
        dispo
      )
    );
  }
  if (g.last_adverse_event) {
    sentences.push(
      sentence(
        `The last adverse event recorded is ${g.last_adverse_event.label} on day ${g.last_adverse_event.start_day}.`,
        g.last_adverse_event
      )
    );
  }
  const unplaceable = Object.values(g.unplaceable || {}).reduce((sum, n) => sum + n, 0);
  if (unplaceable > 0) flags.push('data:unplaceable');
  return {
    kind: 'subject-summary',
    subject: inputs.subject,
    summary: `${plural(counts.AE || 0, 'adverse event')} (${sae.length} serious), ${plural(counts.LB || 0, 'lab result')} and ${plural(counts.CM || 0, 'con-med record')}${g.extent ? ` over days ${g.extent.first_day} to ${g.extent.last_day}` : ''}${dispo.length ? `; ${dispo[0].label.toLowerCase()} on day ${dispo[0].start_day}` : ''}.`,
    sentences: sentences.slice(0, 8),
    flags
  };
}

function labTrajectory(inputs, g) {
  const points = g.points || [];
  const sentences = [];
  const flags = [];
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) flags.push('series:single-point');
  sentences.push(
    sentence(
      `${g.test} was measured ${plural(points.length, 'time')} between day ${first.start_day} and day ${last.start_day}${g.unit ? ` (${g.unit}` : ''}${finite(g.lln) && finite(g.uln) ? `${g.unit ? '; ' : '('}reference ${g.lln}–${g.uln})` : g.unit ? ')' : ''}.`,
      [first, last]
    )
  );
  if (g.baseline && g.baseline.row_id) {
    sentences.push(
      sentence(
        `Baseline is ${g.baseline.value}${unitText(g.unit)} on day ${g.baseline.day} (${g.baseline.rule === 'flag' ? 'the flagged baseline record' : g.baseline.rule === 'day' ? 'the last value on or before the baseline day' : 'the earliest value'}).`,
        { row_id: g.baseline.row_id }
      )
    );
  }
  if (g.peak) {
    const peakRow = points.find((p) => p.row_id === g.peak.row_id) || { row_id: g.peak.row_id };
    sentences.push(
      sentence(
        `The highest value, ${g.peak.value}${unitText(g.unit)} on day ${g.peak.day}, is ${ratioText(peakRow)}${finite(peakRow.x_baseline) ? ` and ${peakRow.x_baseline} × baseline` : ''}.`,
        peakRow,
        'medium'
      )
    );
  }
  const abnormal = points.filter((p) => p.abnormal_by_flag || p.abnormal_by_change);
  if (abnormal.length) {
    if (abnormal.some((p) => p.abnormal_by_change)) flags.push('labs:change-rule');
    const flagged = abnormal.filter((p) => p.abnormal_flag).map((p) => p.abnormal_flag);
    sentences.push(
      sentence(
        `${abnormal.length} of ${points.length} values ${is(abnormal.length)} abnormal${flagged.length ? ` (flagged ${[...new Set(flagged)].join(', ')})` : ' by the change-from-baseline rule'}.`,
        abnormal,
        'medium'
      )
    );
  } else {
    sentences.push(
      sentence(
        'No value is flagged abnormal and none crosses the change-from-baseline rule.',
        points,
        'medium'
      )
    );
  }
  if (last !== first) {
    sentences.push(
      sentence(
        `The last value, ${last.value}${unitText(g.unit)} on day ${last.start_day}, is ${ratioText(last)}.`,
        last
      )
    );
  }
  return {
    kind: 'lab-trajectory',
    subject: inputs.subject,
    test: g.test,
    summary: `${g.test}: ${plural(points.length, 'value')}, ${abnormal.length} abnormal; peak ${g.peak ? `${g.peak.value}${unitText(g.unit)} on day ${g.peak.day}` : 'not available'}.`,
    sentences: sentences.slice(0, 5),
    flags
  };
}

function doseJourney(inputs, g, extra) {
  const sentences = [];
  const flags = [];
  const records = g.records || [];
  const changes = g.changes || [];
  const first = records[0];
  const last = records[records.length - 1];
  sentences.push(
    sentence(
      `${g.treatments.join(' and ')} exposure is recorded across ${plural(records.length, 'record')}, from day ${first.start_day}${finite(last.end_day) ? ` to day ${last.end_day}` : last.end_state === 'unrecorded' ? ', with no end date recorded for the last record' : ''}.`,
      records
    )
  );
  if (changes.length) {
    for (const change of changes.slice(0, 3)) {
      sentences.push(
        sentence(
          `On day ${change.start_day} the dose changed from ${change.dose_from} to ${change.dose_to}${unitText(change.unit)} (${change.direction || 'change'}).`,
          [change, { row_id: change.source_row_id }],
          'medium'
        )
      );
    }
    if (changes.length > 3) flags.push('dose:more-changes');
  } else {
    sentences.push(
      sentence(
        `No dose change is recorded; the dose stayed at ${first.dose}${unitText(first.unit)} throughout.`,
        records
      )
    );
  }
  const sae = extra && Array.isArray(extra.rows) ? extra.rows : [];
  if (sae.length && sentences.length < 5) {
    flags.push('sae');
    sentences.push(
      sentence(
        `${plural(sae.length, 'serious adverse event')} ${is(sae.length)} recorded during the study: ${sae.map((e) => `${e.label} on day ${e.start_day}`).join('; ')}.`,
        sae
      )
    );
  }
  return {
    kind: 'dose-journey',
    subject: inputs.subject,
    summary: `${g.treatments.join(' and ')}: ${plural(records.length, 'exposure record')}, ${plural(changes.length, 'dose change')}${
      changes.length
        ? ` (${changes
            .map((c) => c.direction)
            .filter(Boolean)
            .join(', ')})`
        : ''
    }.`,
    sentences: sentences.slice(0, 5),
    flags
  };
}

function disposition(inputs, g, extra) {
  const rows = g.rows || [];
  const sentences = [];
  const flags = [];
  const reference = rows.filter((row) => row.reference);
  const milestones = rows.filter((row) => !row.reference);
  if (reference.length) {
    sentences.push(
      sentence(
        `The disposition event is ${reference.map((d) => `${d.label} on day ${d.start_day}${d.detail && d.detail !== d.label ? ` (the record reads "${d.detail}")` : ''}`).join('; ')}.`,
        reference
      )
    );
  }
  if (milestones.length) {
    sentences.push(
      sentence(
        `${plural(milestones.length, 'other disposition record')} ${is(milestones.length)} recorded: ${milestones.map((d) => `${d.label} on day ${d.start_day}`).join(', ')}.`,
        milestones,
        'medium'
      )
    );
  }
  const overview = extra && extra.exposure_extent ? extra : null;
  if (overview) {
    const ext = overview.exposure_extent;
    sentences.push(
      sentence(
        `Exposure is recorded from day ${ext.first_day} to day ${ext.last_day}${ext.last_end_state === 'unrecorded' ? ' (end not recorded)' : ''}.`,
        [{ row_id: ext.first_row_id }, { row_id: ext.last_row_id }]
      )
    );
    if (overview.last_adverse_event) {
      const lastAe = overview.last_adverse_event;
      sentences.push(
        sentence(
          `The last adverse event recorded is ${lastAe.label} on day ${lastAe.start_day}${lastAe.serious ? ', serious' : ''}.`,
          lastAe
        )
      );
      if (lastAe.serious) flags.push('sae');
    }
  }
  return {
    kind: 'disposition',
    subject: inputs.subject,
    summary: reference.length
      ? `${reference[0].label} on day ${reference[0].start_day}; ${plural(rows.length, 'disposition record')} in total.`
      : `${plural(rows.length, 'disposition record')}, none marked as the disposition event.`,
    sentences: sentences.slice(0, 4),
    flags
  };
}

const COMPOSERS = {
  'event-context': eventContext,
  'subject-summary': subjectSummary,
  'lab-trajectory': labTrajectory,
  'dose-journey': doseJourney,
  disposition
};

/**
 * The one extra tool call the stub makes per skill, so the runtime's loop
 * is exercised and the composer has the rows it needs.
 * @private
 */
function extraCall(skill, inputs, grounding) {
  switch (skill) {
    case 'event-context':
      return {
        name: 'get_source_row',
        input: { row_id: grounding.anchor.row_id, usubjid: inputs.subject }
      };
    case 'subject-summary':
      return { name: 'get_dose_history', input: { usubjid: inputs.subject } };
    case 'lab-trajectory':
      return grounding.peak
        ? {
            name: 'get_source_row',
            input: { row_id: grounding.peak.row_id, usubjid: inputs.subject }
          }
        : null;
    case 'dose-journey':
      return {
        name: 'get_events',
        input: { usubjid: inputs.subject, domain: 'AE', filters: { serious: true } }
      };
    case 'disposition':
      return { name: 'get_subject_overview', input: { usubjid: inputs.subject } };
    default:
      return null;
  }
}

/**
 * Create the stub adapter.
 * @param {Object} [options] `model` (default `stub-1`), `delay` ms per call (demo realism), `extraCall` (false to skip the tool call).
 * @returns {{name: string, model: string, messages: Function}} The adapter.
 */
export function createStubAdapter({
  model = 'stub-1',
  delay = 0,
  extraCall: useExtra = true
} = {}) {
  return {
    name: 'stub',
    model,
    async messages({ messages }) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const first = messages[0];
      const firstText = (first?.content || []).find((block) => block.type === 'text')?.text;
      const payload = parseFirstMessage(firstText);
      if (!payload) {
        return {
          content: [{ type: 'text', text: 'stub: cannot read the request' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
          model
        };
      }
      const { skill, inputs, grounding } = payload;
      const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
      const call = useExtra ? extraCall(skill, inputs, grounding) : null;
      if (assistantTurns === 0 && call) {
        return {
          content: [{ type: 'tool_use', id: 'stub-call-1', name: call.name, input: call.input }],
          stop_reason: 'tool_use',
          usage: { input_tokens: 0, output_tokens: 0 },
          model
        };
      }
      let extra = null;
      if (call) {
        const results = messages
          .filter((m) => m.role === 'user')
          .flatMap((m) => m.content || [])
          .filter((block) => block.type === 'tool_result' && block.tool_use_id === 'stub-call-1');
        if (results.length) {
          try {
            extra = JSON.parse(results[0].content);
          } catch {
            extra = null;
          }
          if (extra && extra.error) extra = null;
        }
      }
      const compose = COMPOSERS[skill];
      if (!compose) {
        return {
          content: [{ type: 'text', text: `stub: no composer for ${skill}` }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
          model
        };
      }
      const draft = compose(inputs, grounding, extra);
      delete draft.__extraUsed;
      return {
        content: [{ type: 'tool_use', id: 'stub-submit', name: 'submit_draft', input: draft }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
        model
      };
    }
  };
}
