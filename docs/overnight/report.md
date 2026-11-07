# Overnight report

One section per stage, each written by that stage at its end (see "Report" in `pipeline.md`). The final summary will go at the top.

## Stage 0: the interactive session before the pipeline

**What changed**: replaced the rule-based section tracker with a model trained on expert labels (#267), a steady tempo tracker (#268), the
beat grid and the noise gates (#268, #269), the evaluation and training tools in `scripts/section-eval/`, and this pipeline.

**Before and after** (out of fold, from `song-sections.md` and `tempo.md`):

| | Before | After |
| --- | --- | --- |
| Section drop F1 / buildup F1 / break F1 (SSME, clean) | 0.20 / 0.09 / 0.28 | 0.39 / 0.44 / 0.52 |
| False song-clock resets per song | 0.41 | 0.06 |
| BPM readings within 4% (GiantSteps, cross-validated) | 59% | about 82% |
| Visible BPM jumps per minute | 10.5 | under 0.5 |
| False hits a minute on a fan (clean / laptop mic) | 39 / 16 | 7 / 2 |

**Cost** (session `session_01D1Q35feAxbgydgMeXfVb4u`, read at 2026-11-07T08:12Z, before the pipeline started and still open): $58.35;
264,016 input, 505,034 output, 174,148,853 cache read and 1,882,736 cache write tokens; about 9 h 50 min of wall time.
