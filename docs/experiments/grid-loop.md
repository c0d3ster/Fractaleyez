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
