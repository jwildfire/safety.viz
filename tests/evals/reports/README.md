# Eval reports

Every `node tests/evals/patient-journey-narratives/run.mjs` writes a timestamped `<ISO>-<adapter>-<judge>.json` and `.md` here: the per-skill table, the cases below a threshold, and the reasons.

The reports themselves are gitignored (only this file and `.gitignore` are tracked) — they are run output, and a live-adapter run costs money to reproduce but never belongs in the history.

Run the offline gate with `npm run eval:narratives`, or a live one with `node tests/evals/patient-journey-narratives/run.mjs --adapter claude --judge claude` (needs `ANTHROPIC_API_KEY`).
