# Overnight status

Append-only log. Newest at the bottom; the morning summary goes at the top when stage 3 ends.

- 2026-11-07T07:49Z: pipeline set up (docs/overnight/pipeline.md). Stage 1 waits for the Raveform levels release asset.
- 2026-11-07T07:50Z: stage 1 started. Raveform levels release asset not found (404). Wait 1 of 10, retrying in 30 minutes.
- 2026-11-07T08:02Z: Raveform levels on Google Drive (data-source.txt), checked from the cloud: 296 MB zip, 1,370 tracks, Windows-style paths (extract with Python zipfile).
- 2026-11-07T08:02Z: Raveform data source arrived (docs/overnight/data-source.txt); stage 1 running, downloading levels and labels.
- 2026-11-07T08:06Z: stage 1 checkpoint 1 (baseline BeatGrid on all 1,370 Raveform tracks, scripts/section-eval/grid-score-raveform.py): beat F 0.801 (any level 0.821), median offset -3 ms, downbeat F 0.435, 8-bar F 0.230, bar right 0.39, phrase right 0.14; section starts on the grid's 8-bar line 24% (Raveform's own marked lines: 73%). Weakest: drum and bass beats (F 0.63), trance and mainstage phrases (8-bar F 0.14 to 0.15).
- 2026-11-07T09:20Z: stage 1 checkpoint 2 (tuned BeatGrid: downbeat and phrase cues fitted on Raveform folds 0-5 by grid-train.py, 16-bar downbeat memory, 4 s re-anchor). Held-out folds 6-7, before -> after: beat F 0.806 -> 0.810, downbeat F 0.421 -> 0.577, 8-bar F 0.228 -> 0.367, bar right 40% -> 63%, phrase right 13% -> 34%, section starts on the grid's 8-bar line 23% -> 40% (Raveform's own lines: 75%). Ballroom (523 in 4/4) unchanged: beat F 0.59, downbeat F 0.22. beat-grid.test.ts and all 398 tests pass. Left: drum and bass tempo (beat F 0.59, a tempo tracker issue), intros, breakdowns. bar-grid.md updated.
