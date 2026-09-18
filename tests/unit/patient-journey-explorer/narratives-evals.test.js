import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  CASE_BUDGET,
  GOLDEN_DIR,
  SKILL_ORDER,
  buildGolden
} from '../../evals/patient-journey-narratives/build-golden.mjs';
import {
  GATED,
  METRICS,
  THRESHOLDS,
  capitalisedNames,
  factPresent,
  loadGolden,
  runEvals
} from '../../evals/patient-journey-narratives/lib.mjs';
import { createStubAdapter } from '../../../src/patientJourneyNarratives/adapters/stub.js';

// The eval harness of the AI narrative layer (#146, design §11): the golden set
// is derived from the demo data mechanically, the offline stub clears every
// threshold under the rules judge, and the graders actually bite — a draft that
// invents a name, a number, a citation or a causal claim must fail the gate it
// is meant to fail. PJE-NARR-015.

// The golden set is derived from 254 participants of the vendored extracts.
const BUILD_TIMEOUT = 180_000;

describe('patient-journey narrative evals', () => {
  test('PJE-NARR-015: the golden set holds at least 30 cases across the five skills and the stub adapter clears every threshold under the rules judge (#146)', async () => {
    const cases = loadGolden();
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map((entry) => entry.skill))).toEqual(new Set(SKILL_ORDER));
    for (const slug of SKILL_ORDER) {
      expect(cases.filter((entry) => entry.skill === slug).length).toBe(CASE_BUDGET[slug]);
    }
    // Every case carries its provenance caveat and its own scope.
    for (const entry of cases) {
      expect(entry.notes).toContain('unreviewed by a clinician');
      expect(entry.reference).toHaveProperty('scope_row_ids');
      if (!entry.reference.refusal) expect(entry.reference.scope_row_ids.length).toBeGreaterThan(0);
    }

    const result = await runEvals({ adapter: 'stub', judge: 'rules' });
    expect(result.cases.length).toBe(cases.length);
    expect(result.adapter).toMatch(/^stub:/);
    expect(result.judge).toBe('rules');
    for (const slug of SKILL_ORDER) {
      const entry = result.bySkill[slug];
      expect(entry, `no result for ${slug}`).toBeTruthy();
      for (const metric of GATED) {
        const limit = THRESHOLDS[slug][metric];
        if (metric === 'hallucination') expect(entry[metric]).toBeLessThanOrEqual(limit);
        else expect(entry[metric], `${slug}.${metric}`).toBeGreaterThanOrEqual(limit);
      }
      // Every row the golden set requires is cited by some sentence.
      expect(entry.citation_recall, `${slug}.citation_recall`).toBe(1);
    }
    expect(result.passed).toBe(true);
  });

  test(
    'PJE-NARR-015: build-golden derives the committed case files deterministically (#146)',
    () => {
      const { files, cases } = buildGolden();
      expect(cases.length).toBe(30);
      for (const [file, text] of Object.entries(files)) {
        if (!file.startsWith(GOLDEN_DIR)) continue;
        expect(text, `${file} drifted from the committed golden set`).toBe(
          readFileSync(file, 'utf8')
        );
      }
      // A second derivation over the same data is byte-identical.
      const again = buildGolden();
      expect(again.files).toEqual(files);
    },
    BUILD_TIMEOUT
  );

  test('PJE-NARR-015: the graders fail a draft that invents a name, a number, a citation or a causal claim (#146)', async () => {
    const liar = (mutate) => {
      const stub = createStubAdapter();
      return {
        name: 'liar',
        model: 'liar-1',
        async messages(request) {
          const response = await stub.messages(request);
          const submit = (response.content || []).find(
            (block) => block.type === 'tool_use' && block.name === 'submit_draft'
          );
          if (submit) mutate(submit.input);
          return response;
        }
      };
    };
    const run = (mutate) =>
      runEvals({ adapter: liar(mutate), judge: 'rules', skills: ['event-context'], limit: 3 });

    const invented = await run((draft) => {
      draft.sentences[0].text = draft.sentences[0].text.replace(
        /\.$/,
        ', with TYLENOL PM and Ibuprofen also recorded.'
      );
    });
    expect(invented.bySkill['event-context'].hallucination).toBeGreaterThan(0);
    expect(invented.passed).toBe(false);

    const wrongNumber = await run((draft) => {
      draft.sentences[0].text = draft.sentences[0].text.replace(/\.$/, ', 4321 days later.');
    });
    expect(wrongNumber.bySkill['event-context'].faithfulness).toBeLessThan(1);
    expect(wrongNumber.passed).toBe(false);

    // The runtime drops a sentence whose citation no tool returned; the drop
    // still counts against faithfulness, so the cleanup cannot hide it.
    const outOfScope = await run((draft) => {
      draft.sentences[0].citations = ['AE-424242'];
    });
    expect(outOfScope.bySkill['event-context'].faithfulness).toBeLessThan(1);
    expect(outOfScope.passed).toBe(false);

    const causal = await run((draft) => {
      draft.sentences[0].text = 'The event was caused by the study drug.';
    });
    expect(causal.bySkill['event-context'].refusals_correct).toBeLessThan(1);
    expect(causal.passed).toBe(false);

    const silent = await run((draft) => {
      draft.summary = 'Nothing to report.';
      draft.sentences = draft.sentences.slice(0, 1);
      draft.sentences[0].text = 'A record exists.';
    });
    expect(silent.bySkill['event-context'].coverage).toBeLessThan(0.9);
    expect(silent.passed).toBe(false);
  });

  test('PJE-NARR-015: the fact matcher and the name check hold at their edges (#146)', () => {
    expect(factPresent('the event is recorded on day 184', 'day 1')).toBe(false);
    expect(factPresent('the last adverse event is CHEST PAIN on day 111.', 'day 111')).toBe(true);
    expect(factPresent('7 con-meds were active at onset', '7 con-med')).toBe(true);
    expect(factPresent('the ratio is 1.06 x ULN', '1')).toBe(false);
    expect(factPresent('the value is 136 U/L', '36 U/L')).toBe(false);
    expect(capitalisedNames('ERYTHEMA is recorded from day 30.')).toEqual(['ERYTHEMA']);
    expect(capitalisedNames('The dose changed on day 17.')).toEqual([]);
    expect(capitalisedNames('No end date is recorded. Tylenol was active.')).toEqual([]);
    expect(capitalisedNames('the con-med Tylenol was active')).toEqual(['TYLENOL']);
  });

  test('PJE-NARR-015: every metric the report prints is gated or explicitly not (#146)', () => {
    for (const metric of GATED) expect(METRICS).toContain(metric);
    for (const slug of SKILL_ORDER) {
      expect(Object.keys(THRESHOLDS[slug]).sort()).toEqual([...GATED].sort());
    }
    expect(THRESHOLDS._comment).toMatch(/version bump/i);
  });
});
