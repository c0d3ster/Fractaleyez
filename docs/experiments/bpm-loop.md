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
| 0 | Start (feat/bar-grid at 8af07ef) | 1.2591 | 1.1943 | start |
| 1 | priorOctaves 0.5 to 0.6 | 1.2448 | 1.1848 | no |
| 2 | priorBpm 145 to 135 | 1.2208 | 1.1792 | no |
| 3 | priorOctaves 0.5 to 0.4 | 1.2722 | 1.1889 | no (check fell) |
| 4 | subdivision 1.5 to 2 | 1.2623 | 1.2138 | no (+0.003, under the margin) |
| 5 | subdivision 1.5 to 1 | 1.2515 | 1.1767 | no |
| 6 | memoryMs 8000 to 12000 | 1.2621 | 1.1946 | no (+0.003) |
| 7 | onsetTauMs 20 to 30 | 1.2465 | 1.1826 | no |
| 8 | subdivision 1.5 to 2.5 | 1.2631 | 1.2117 | no (+0.004) |
| 9 | memoryMs 8000 to 16000 | 1.2563 | 1.1992 | no |
| 10 | switchReadings 4 to 6 | 1.2592 | 1.1979 | no (+0.0001) |
