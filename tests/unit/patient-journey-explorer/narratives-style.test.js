import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { canonicalJson, inputHash, sha256Hex } from '../../../src/patientJourneyNarratives/hash.js';
import { forbiddenMatch } from '../../../src/patientJourneyNarratives/validator.js';

// Two things the narrative layer is only as good as (#146): the style guide's
// forbidden block, which is the single place a causal claim, a diagnosis, a
// treatment judgement or a re-identifying detail is stopped — edit
// skills/patient-journey-narratives/shared/style-guide.md and this is what
// changes — and the deterministic hash the cache and the renderer's staleness
// check are keyed by. PJE-NARR-017.

describe('the forbidden block rejects the claims this tool does not make (PJE-NARR-017)', () => {
  // Canonical bad sentences, one per family the style guide names.
  const REJECTED = [
    ['The rash was caused by the drug.', 'causal'],
    ['ALT elevation due to acetaminophen.', 'causal'],
    ['The dose should be reduced.', 'a treatment judgement'],
    ['Consistent with drug-induced liver injury.', 'a diagnosis'],
    ['A 54-year-old male participant.', 're-identification'],
    ['This confirms hepatotoxicity.', 'confidence beyond the rows'],
    ['Likely to recur.', 'prognosis']
  ];

  // The same facts, hedged the way the guide asks for them.
  const ACCEPTED = [
    'The rash is temporally associated with the con-med.',
    'ALT rose to 2.25 × ULN on day 25, 5 days before the anchor.',
    'No end date is recorded for MAALOX.',
    'The dose changed from 54 to 81 mg on day 17.'
  ];

  test('PJE-NARR-017: every canonical forbidden sentence is matched, and the match names the construct that fired (#146)', () => {
    for (const [text, family] of REJECTED) {
      const hit = forbiddenMatch(text);
      expect(hit, `${family}: ${text}`).not.toBeNull();
      expect(text.toLowerCase(), `${family}: ${text}`).toContain(hit.toLowerCase());
    }
  });

  test('PJE-NARR-017: every hedged sentence the style guide asks for passes (#146)', () => {
    for (const text of ACCEPTED) {
      expect(forbiddenMatch(text), text).toBeNull();
    }
  });

  test('PJE-NARR-017: the block matches whole words only, so ordinary safety prose is not caught by a substring (#146)', () => {
    // "man" must not fire on "woman"'s tail, "should" not on "shoulder",
    // "prov(es|ed|en)" not on "provided", "caus*" not on "because" alone.
    expect(forbiddenMatch('The shoulder pain is recorded from day 12.')).toBeNull();
    expect(forbiddenMatch('The site provided the source row.')).toBeNull();
    expect(forbiddenMatch('MAALOX was active at onset, per the recorded start day.')).toBeNull();
    // ...but the constructs themselves still fire, whatever the casing.
    expect(forbiddenMatch('The event was DUE TO the infusion.')).toBe('DUE TO');
    expect(forbiddenMatch('Consider discontinuing the study drug.')).toBe('Consider discontinuing');
    expect(forbiddenMatch('The participant is at risk of recurrence.')).toBe('at risk of');
  });
});

describe('deterministic hashing (PJE-NARR-017)', () => {
  test('PJE-NARR-017: sha256Hex matches the published digests for "abc" and the empty string (#146)', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('PJE-NARR-017: sha256Hex agrees with node:crypto across block boundaries and on non-ASCII input (#146)', () => {
    const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
    const inputs = [
      'a'.repeat(100), // two 64-byte blocks: the padding and length words matter
      'a'.repeat(55), // the last byte that still fits one block
      'a'.repeat(56), // the first length that forces a second
      'a'.repeat(64),
      '01-716-1447|event-context@1.0.0',
      'ALT rose to 2.25 × ULN on day 25 — 5 days before the anchor'
    ];
    for (const text of inputs) {
      expect(sha256Hex(text), `${text.length} chars`).toBe(digest(text));
    }
    expect(sha256Hex('a'.repeat(100))).toHaveLength(64);
  });

  test('PJE-NARR-017: canonicalJson sorts object keys at every level and keeps array order (#146)', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: { y: 1, x: { w: 2, v: 3 } }, a: [3, 1, 2] })).toBe(
      '{"a":[3,1,2],"z":{"x":{"v":3,"w":2},"y":1}}'
    );
    // Order of the arrays' members is data, not presentation: it is preserved,
    // and two orders are two different hashes.
    expect(canonicalJson([{ b: 1, a: 2 }, { a: 1 }])).toBe('[{"a":2,"b":1},{"a":1}]');
    expect(inputHash({ rows: ['AE-1', 'AE-2'] })).not.toBe(inputHash({ rows: ['AE-2', 'AE-1'] }));
    // The same object written two ways hashes the same.
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(
      canonicalJson({ b: { d: 3, c: 2 }, a: 1 })
    );
    // undefined, functions and non-finite numbers are dropped or nulled, so a
    // tool result can be hashed as it stands.
    expect(canonicalJson({ a: undefined, b: () => 1, c: NaN, d: Infinity, e: null })).toBe(
      '{"c":null,"d":null,"e":null}'
    );
  });

  test('PJE-NARR-017: inputHash is sha256: plus the digest of the canonical JSON (#146)', () => {
    const value = { skill: 'event-context', version: '1.0.0', inputs: { subject: 'S1' } };
    expect(inputHash(value)).toBe(`sha256:${sha256Hex(canonicalJson(value))}`);
    expect(inputHash(value)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(inputHash(value)).toBe(
      inputHash({ inputs: { subject: 'S1' }, version: '1.0.0', skill: 'event-context' })
    );
  });
});
