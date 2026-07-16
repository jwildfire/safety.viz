// Hand-computed ae-explorer test data (#60): two arms, seven participants,
// six adverse-event records, and one placeholder row per arm for a
// participant with no adverse events (blank and 'NA' System Organ Class —
// both spellings the placeholder default must catch, AE-DATA-001).
//
// Expected numbers, participant mode (denominators include placeholders):
//   Group A: n = 4 participants (A1..A4), 4 event rows
//     Cardiac disorders           2/4 = 50.0%  (A1, A2)
//       Palpitations              1/4 = 25.0%  (A1 — twice, still one participant)
//       Arrhythmia                1/4 = 25.0%  (A2)
//     Gastrointestinal disorders  1/4 = 25.0%  (A3)
//     Any adverse event           3/4 = 75.0%
//   Group B: n = 3 participants (B1..B3), 2 event rows
//     Cardiac disorders           1/3 = 33.3%  (B1)
//       Palpitations              1/3 = 33.3%
//       Arrhythmia                0/3 =  0.0%  (zero-shell cell)
//     Gastrointestinal disorders  1/3 = 33.3%  (B3)
//     Any adverse event           2/3 = 66.7%
// Event mode (denominators are the arm's event totals):
//   Cardiac A = 3/4 = 75.0%, Palpitations A = 2/4 = 50.0%, Cardiac B = 1/2 = 50.0%

const row = (usubjid, arm, sex, soc, pt, sev, ser) => ({
  USUBJID: usubjid,
  ARM: arm,
  SEX: sex,
  AEBODSYS: soc,
  AEDECOD: pt,
  AESEV: sev,
  AESER: ser
});

export const AE_ROWS = [
  row('A1', 'A', 'F', 'Cardiac disorders', 'Palpitations', 'MILD', 'N'),
  row('A1', 'A', 'F', 'Cardiac disorders', 'Palpitations', 'MODERATE', 'Y'),
  row('A2', 'A', 'M', 'Cardiac disorders', 'Arrhythmia', 'SEVERE', 'N'),
  row('A3', 'A', 'F', 'Gastrointestinal disorders', 'Nausea', 'MILD', 'N'),
  row('A4', 'A', 'M', '', '', '', ''), // placeholder: no adverse events
  row('B1', 'B', 'F', 'Cardiac disorders', 'Palpitations', 'MILD', 'N'),
  row('B2', 'B', 'F', 'NA', 'NA', 'NA', 'NA'), // placeholder, R-style NA
  row('B3', 'B', 'M', 'Gastrointestinal disorders', 'Nausea', 'MODERATE', 'Y')
];

export const GROUPS = ['A', 'B'];
