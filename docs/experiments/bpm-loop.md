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
| 11 | subdivision 2 and memoryMs 12000 together | 1.2647 | 1.2111 | no (passes the margin, but subdivision 2 breaks tempo-tracker.test.ts: a synthetic 124 to 174 BPM track read at 1.5x) |
| 12 | harmonics: two beats 0.5 to 0.75 | 1.2614 | 1.1978 | no |
| 13 | harmonics: four beats 0.5 to 0.75 | 1.2858 | 1.2194 | yes |
| 14 | harmonics: two beats 0.5 to 0.25 | 1.2567 | 1.1842 | no |
| 15 | bandWeights: hi 0.5 to 1 | 1.2786 | 1.2248 | passed, not taken (13 was better; tried again on top of 13) |
| 16 | bandWeights: air 0.25 to 0.5 | 1.2804 | 1.2193 | passed, not taken (as 15) |
| 17 | bandWeights: lo 1 to 1.5 | 1.2643 | 1.2059 | passed (+0.0052), not taken (as 15) |
| 18 | switchRatio 1.15 to 1.25 | 1.2618 | 1.2012 | no (+0.003) |
| 19 | windowMs 12000 to 15000 | 1.2591 | 1.1813 | no |
| 20 | bandWeights: hi 0.5 to 1 (on 13) | 1.2953 | 1.2527 | no (passes the margin, but breaks tempo-tracker.test.ts: claps on 2 and 4 pull a synthetic track to half tempo) |
| 21 | bandWeights: air 0.25 to 0.5 (on 13) | 1.2944 | 1.2383 | yes |
| 22 | bandWeights: lo 1 to 1.5 (on 13) | 1.2936 | 1.2204 | passed, not taken (21 was better) |
| 23 | harmonics: four beats 0.75 to 1 (on 13) | 1.2953 | 1.2359 | no (passes the margin, but breaks tempo-tracker.test.ts) |
| 24 | memoryMs 8000 to 12000 (on 13) | 1.2818 | 1.2169 | no |
