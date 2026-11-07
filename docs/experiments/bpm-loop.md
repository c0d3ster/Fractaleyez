# BPM loop (stage 4)

Automated improvement loop on `TempoTracker` (`src/audioanalysis/tempo-tracker.ts`), stage 4 of `docs/overnight/pipeline.md`.

- Data: the GiantSteps tempo set (664 two-minute EDM excerpts, v2 tempo labels), band levels from `levels.py`, clean and `--mic laptop`
  (seed: crc32 of the id mod 1,000,000).
- Split (`bpm-loop-split.json`): sha1 of the id, mod 100: 60% tune (389 excerpts, 387 scored), 20% check (153, 152 scored), 20% hidden
  (122). The loop never looks at the hidden part until the end.
- Frozen evaluation: `scripts/section-eval/bpm-loop-eval.py` (runs `bpm-eval.mts`, scores like `bpm-score.py`). Metric per condition:
  acc1 + 0.5 x track - 0.05 x jumps per minute; the loop's number is the mean of clean and laptop at 60 fps.
- Keep a change only if the tuning metric rises by at least 0.005 and the check metric does not fall. Every 10 iterations: the tuning
  metric at 30 and 144 fps must not be below the start's, and the noise files (`noise.py`: white, pink, brown, fan; clean and laptop) must
  show no tempo.
- The tracker is deterministic, so a run has no seed to fix beyond the laptop mic simulation's.

| Iteration | Change | Tune metric | Check metric | Kept |
| --- | --- | --- | --- | --- |
