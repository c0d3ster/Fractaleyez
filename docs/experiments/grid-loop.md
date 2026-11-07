# Beat grid loop (stage 5)

Automated improvement loop on `BeatGrid` (`src/audioanalysis/beat-grid.ts`), stage 5 of `docs/overnight/pipeline.md`.

- Data: Raveform band levels (1,370 tracks, 60 fps, made by `raveform-fetch.py`) and its marked beats; Ballroom (523 excerpts in 4/4,
  levels from `levels.py`) as the guard.
- Split (`grid-loop-split.json`): Raveform's own folds, 0 to 4 tune (855 tracks scored), 5 check (172), 6 and 7 hidden (343). The loop
  never looks at the hidden folds until the end. The fitted cue weights (`beat-grid-model.json`, from stage 1) were fitted on folds 0 to
  5, so the check fold already shaped them; the hidden folds did not.
- Frozen evaluation: `scripts/section-eval/grid-loop-eval.py` (runs `grid-eval.mts`, scores with `grid-score-raveform.py`'s and
  `grid-score.py`'s definitions, from 10 s in, 70 ms). Metric: downbeat F + 8-bar F + 0.5 x beat F, mean over the tuning tracks.
- Keep a change only if the tuning metric rises by at least 0.005, the check metric does not fall below the current kept code's, and
  Ballroom beat F does not fall more than 0.002 below the start's (0.6088; a guard against drift, not a target).
- Added after iteration 16 (a side check, not the metric): re-lock after a song change. 160 pairs of tuning-fold tracks (not drum and
  bass), track A's first 90 s then track B from 60 s in; the time until the grid's beats score F 0.8 against B's marks over a 4 s window.
  At the start, 81% re-lock within 20 s (median 12 s, most of it the tempo tracker's own re-lock). Slower re-anchoring wins on single
  tracks but costs this, so a change that lowers it more than 0.02 below the kept code's is not taken. Script: `relock.mts`/`relock.py`
  in the session's scratch, described here; not part of the frozen evaluation.
- Edit surface: `beat-grid.ts` only (not `GridState`, not the fitted weights). The grid and the tempo tracker are deterministic, so there
  is no seed to fix.

| Iteration | Change | Tune metric | Check metric | Ballroom beat F | Kept |
| --- | --- | --- | --- | --- | --- |
| 0 | Start (feat/bar-grid at 856dc39): downbeat F 0.567, 8-bar F 0.344, beat F 0.784 on tune | 1.3036 | 1.2956 | 0.6088 | start |
| 1 | switchBars 2 to 1 | 1.2997 | 1.3014 | 0.6088 | no (downbeat F up 0.003, 8-bar F down 0.007) |
| 2 | switchBars 1, phrase switch kept at 2 (new phraseSwitchBars option) | 1.3043 | | | no (+0.0007) |
| 3 | switchBars 1, phraseSwitchBars 3 | 1.3003 | | | no |
| 4 | phraseSwitchBars 2 to 3 | 1.2994 | | | no |
| 5 | downbeatMemoryBars 16 to 24 | 1.3049 | | | no (+0.0013) |
| 6 | phraseMemoryBars 24 to 32 | 1.3039 | | | no (+0.0003) |
| 7 | phaseJumpUpdates 16 to 24 (re-anchor after 6 s instead of 4 s) | 1.3243 | 1.3246 | 0.6101 | yes |
| 8 | phaseJumpUpdates 24 to 32 | 1.3349 | 1.3302 | 0.6078 | passed, not taken (waiting longer for every re-anchor slows the re-lock after a song change in a DJ set; tried a targeted version below) |
| 9 | phaseJumpUpdates 24 to 48 | 1.3606 | | | not taken (as 8) |
| 10 | phaseJump 0.15 to 0.2 | 1.3309 | | | passed the margin, not checked yet (tried again on top of 14) |
| 11 | phaseFollow 0.3 to 0.2 | 1.3083 | | | no |
| 12 | a re-anchor counts only large errors that keep pointing at the same phase | 1.3256 | | | no (+0.0013) |
| 13 | as 12, phaseJumpUpdates 16 | 1.3095 | | | no |
| 14 | a re-anchor to near the off-beat (error over 0.4 beat) waits 3x as long (18 s); 31% of re-anchors on 120 fold-0 tracks were there | 1.3568 | 1.3643 | 0.6097 | yes |
| 15 | as 14, phaseJumpUpdates 16 | 1.3444 | | | no (below 14) |
| 16 | as 14, scale 5 | 1.3616 | | | no (+0.0048 over 14) |
| 17 | as 14, off-beat threshold 0.4 to 0.35 | 1.3667 | 1.3682 | 0.6095 | passed, not taken (re-lock within 20 s 0.73 to 0.71, never re-locked 4% to 6%; tried again on top of 19) |
| 18 | as 14, off-beat threshold 0.3 | 1.3755 | | | not taken (re-lock within 20 s 0.69) |
| 19 | phaseJump 0.15 to 0.2 (on 14) | 1.3638 | 1.3669 | 0.6148 | yes (re-lock within 20 s 0.73 to 0.76) |
| 20 | phaseJump 0.2 to 0.25 | 1.3647 | | | no (+0.0009) |
| 21 | off-beat threshold 0.4 to 0.35 (on 19) | 1.3756 | 1.3677 | 0.6143 | passed, not taken (re-lock within 20 s 0.76 to 0.74, at the limit; 25 passed with no cost; tried again on top of 25) |
| 22 | phaseWindowMs 8000 to 10000 | 1.3612 | | | no |
| 23 | latencyMs 25 to 20 | 1.3622 | | | no |
| 24 | latencyMs 25 to 30 | 1.3527 | | | no |
| 25 | downbeatMemoryBars 16 to 24 | 1.3710 | 1.3738 | 0.6148 | yes (re-lock unchanged, 0.76) |
| 26 | switchBars 2 to 1 (on 19) | 1.3614 | | | no |
| 27 | off-beat threshold 0.4 to 0.35 (on 25) | 1.3841 | 1.3765 | 0.6143 | passed, not taken (re-lock within 20 s 0.74, at the limit; 32 passed with no cost; tried again on top of 32) |
| 28 | downbeatMemoryBars 24 to 32 | 1.3731 | | | no (+0.0021) |
| 29 | phraseMemoryBars 24 to 32 | 1.3716 | | | no |
| 30 | phraseMemoryBars 24 to 16 | 1.3703 | | | no |
| 31 | phraseSwitchBars 2 to 1 | 1.3629 | | | no |
| 32 | phaseFollow 0.3 to 0.4 | 1.3782 | 1.3818 | 0.6157 | yes (re-lock within 20 s 0.76, median 12 s) |
| 33 | off-beat threshold 0.4 to 0.35 (on 32) | 1.3925 | 1.3802 | 0.6153 | no (check fell from 1.3818) |
| 34 | phaseFollow 0.4 to 0.5 | 1.3823 | | | no (+0.0041) |
| 35 | offbeatJumpScale 3 to 2 | 1.3725 | | | no |
| 36 | phaseJumpUpdates 24 to 20 | 1.3686 | | | no |
| 37 | phrase cues of a bar weighted by the downbeat confidence (fully) | 1.3766 | | | no |
| 38 | as 37, half weight | 1.3782 | | | no (+0.0000) |
| 39 | downbeat cues left out while a re-anchor is pending | 1.3596 | | | no |
| 40 | phase scoring leaves out the newest 40 ms instead of 60 ms (GUARD_BINS 12 to 8) | 1.3777 | | | no |

## Result

Stopped after 40 iterations (15:45 to 17:30 UTC, 1 h 45 min). Kept, in order: re-anchor after 6 s instead of 4 s (7), a re-anchor to
near the off-beat waits 3x as long (14), phaseJump 0.2 (19), a 24-bar downbeat memory (25), phaseFollow 0.4 (32). All five are about
the beat clock and how long the downbeat evidence lasts; nothing on the phrase side (memory, switching, confidence weighting) helped.

Hidden folds 6 and 7 (343 tracks), scored once each at the end:

| Hidden | Start (856dc39) | Final |
| --- | --- | --- |
| Metric | 1.3324 | 1.4154 |
| Beat F | 0.800 | 0.811 |
| Downbeat F | 0.569 | 0.606 |
| 8-bar F | 0.363 | 0.404 |
| Bar right / phrase right | 58% / 33% | 64% / 39% |
| Section starts on the grid's 8-bar line | 39% | 43% |

Tune moved +0.075 and hidden +0.083, so the gain is not fitting to the tuning folds. Ballroom beat F 0.6088 to 0.6157, downbeat F
0.221 to 0.226. The cost: after a song change, 76% of pairs re-lock within 20 s against 81% at the start (median 12 s both, 4% never
within 90 s both), because a wrong phase now persists 6 s, or 18 s near the off-beat, before the clock gives it up.
