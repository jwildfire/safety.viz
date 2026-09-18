# Style guide for patient-journey narratives

Applies to every skill in this folder. The output validator (`src/patientJourneyNarratives/validator.js`) loads the forbidden-phrase list from the fenced block at the end of this file, so an edit here changes what is rejected at run time.

## Register

- Plain clinical prose, third person, past tense for what happened, present tense for what the record shows now ("no end date is recorded").
- One claim per sentence where possible. A sentence that combines rows (a count, an offset in days) is fine; a sentence that combines an observation with an interpretation is not.
- Name records the way the rows name them: the preferred term, the con-med name as recorded, the lab test name, the dose with its unit.
- Numbers as the rows carry them. Study days are "day 30", offsets are "12 days before the anchor" or "within 5 days of onset". Never round a lab value; report the ratio to the limit the tool computed.

## Hedging vocabulary (use these)

- "temporally associated with"
- "occurred within N days of"
- "was active at onset" / "was active on day N"
- "started N days after" / "started N days before"
- "consistent with the recorded timeline"
- "is recorded as" / "the record shows"
- "no end date is recorded" / "severity is not recorded"

## Forbidden constructs

- Causal language of any kind: caused, due to, led to, resulted in, because of, secondary to, attributable to, induced, triggered, responsible for.
- Diagnoses the rows do not carry: naming a syndrome, a disease, an injury pattern, or a classification (for example a Hy's-law call) that is not itself a recorded term.
- Treatment recommendations or judgements about care: should, recommend, consider discontinuing, appropriate, inappropriate, off-label, contraindicated.
- Prognosis or risk statements: likely to, at risk of, may develop, prognosis.
- Re-identification: age, sex, occupation, location, dates of birth, anything beyond the participant identifier.
- Confidence beyond the rows: "clearly", "definitely", "certainly", "proves", "confirms".
- Absolutes not supported by a row: "never", "always", "no other".

## Sentence structure

- Every sentence carries at least one citation to a `row_id` returned by a tool in this generation. The validator drops sentences whose citations do not all resolve.
- A sentence about a list (the con-meds active at onset) cites every member it names.
- A sentence about a count cites the rows counted, or the anchor when the count came from the context-window tool.
- Do not cite the same row twice in one sentence.

## Forbidden phrase patterns

The validator compiles each line of the block below as a case-insensitive JavaScript regular expression and rejects a sentence that matches any of them.

```forbidden
\bcaus(e|es|ed|ing|al|ation)\b
\bdue to\b
\bled to\b
\bleads? to\b
\bresult(s|ed|ing)? (in|from)\b
\bbecause of\b
\bsecondary to\b
\battributable to\b
\binduced\b
\btriggered\b
\bresponsible for\b
\bshould\b
\brecommend(s|ed|ation)?\b
\bconsider (stopping|discontinuing|reducing|withholding)\b
\b(in)?appropriate\b
\boff-?label\b
\bcontraindicat(ed|ion)\b
\blikely to\b
\bat risk (of|for)\b
\bmay develop\b
\bprognosis\b
\b(clearly|definitely|certainly)\b
\bprov(es|ed|en)\b
\bconfirm(s|ed)\b
\bdiagnos(is|ed|es|tic)\b
\bhy'?s law\b
\bdrug-induced\b
\b(years?|yrs?)[ -]old\b
\b(male|female|man|woman)\b
```
