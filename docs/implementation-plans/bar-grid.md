# Bar Grid

## Context

The section tracker reacts to the sound alone, so it cannot tell a drop from the music coming back to full at the end of a fill: two seconds later they look the same (see `song-sections.md`, "waiting before calling a drop"). What separates them is where they fall in the song's phrasing. EDM is built on a strict grid, so knowing the beat, beat 1 of the bar and the 8-bar line says when a section can change.

Code: `src/audioanalysis/beat-grid.ts` (`BeatGrid`), on top of `TempoTracker`, with its cue weights in `beat-grid-model.json` (fitted by `scripts/section-eval/grid-train.py`). Not wired into the app yet. Evaluation: `scripts/section-eval/grid-eval.mts`, then `grid-score-raveform.py` (Raveform) or `grid-score.py` (Ballroom).

## What the grid is worth (Raveform)

Raveform (Kim et al., TISMIR 2026, labels CC BY 4.0, https://huggingface.co/datasets/taejunkim/raveform): 1,423 EDM tracks (techno 547, trance 175, drum and bass 171, tech house 143, mainstage 126) with every beat, its place in the bar and its section marked by experts.

- All 1,423 are in 4/4, and every section starts on a downbeat.
- Counted in bars from the first downbeat, sections start on a 4-bar line 83% of the time, an 8-bar line 73%, a 16-bar line 47% and a 32-bar line 24% (chance: 25, 12.5, 6 and 3%).
- 83 to 93% of sections last a multiple of 8 bars. Drops last a median of 24 bars (16 to 48), breakdowns, buildups, intros and outros 16 (8 to 32 or 40).
- Half of all drops start on a 16-bar line. Before a drop comes a breakdown (2,780), another drop (1,201), a buildup (521) or the intro (241).

So with a working grid, a drop is only expected about once every 8 bars (about 15 s at 128 BPM) instead of at any of the 60 or so 250 ms slots in between.

## How it works

1. **Beat clock.** The tempo tracker gives the period. Every 250 ms the last 8 s of its onset strength (5 ms bins, lightly smoothed) is scored against every phase of that period, leaving out the newest 60 ms where a beat's onset is still arriving. The clock moves 40% of the way to a small error each time; an error over 20% of a beat has to persist for 24 updates (6 s) before the clock re-anchors, and three times as long (18 s) when it points near the off-beat (over 0.4 of a beat), where hi-hats pull the phase score. Beats are scheduled from the last one that fired, so a correction can neither skip a beat nor fire one twice, and beats a re-anchor jumps over are still counted, so the place in the bar stays aligned with the music. A constant 25 ms is taken off for the band filters' and level windows' own lag (measured on Ballroom: the median offset went from +25 ms to -1 ms).
2. **Downbeat.** Once a beat is two beats past, 15 cues: each band's largest rise from a quarter beat before it to half a beat after (kick, clap, crash), and how much each band's level changed across it, over one beat and over two (bar lines change most). Kept per position in the bar with a 24-bar memory. Each hypothesis "position d is beat 1" weighs every position's cues (each relative to its mean over the four positions) by where that position sits from d, with weights fitted on Raveform (below): claps count for beats 2 and 4, the changes and the kick for beat 1. The downbeat is the hypothesis that wins, decided on a bar's last beat and changed only after another has led for 2 bars.
3. **Phrase.** The same one level up, four bars after each bar line: the rise on its first beat and each band's change across it over one, two and four bars (20 cues), kept per position in an 8-bar cycle with a 24-bar memory and weighed per hypothesis with fitted weights.

`downbeatConfidence` and `phraseConfidence` are how far the leader's softmax share of the hypotheses is above chance (0 to 1).

`GridState`: `beat`, `beatInBar` (1 to 4), `barInPhrase` (1 to 8), `periodMs`, `lastBeatMs`, `nextBeatMs`, `downbeatConfidence`, `phraseConfidence`.

## Measured on Raveform

All 1,370 tracks whose band levels could be fetched (`raveform-fetch.py`; 53 videos were gone), against the marked beats, scored from 10 s in (`grid-score-raveform.py`). Weights fitted and options tuned on Raveform's folds 0 to 5 (1,027 tracks); the numbers below are folds 6 and 7 (343 tracks), which nothing was fitted or tuned on. Within 70 ms; the 8-bar line is every 8th marked downbeat from the first.

| Folds 6 and 7 | Before | After |
| --- | --- | --- |
| Beat F (any level) | 0.806 (0.817) | 0.810 (0.821) |
| Median beat offset | -3 ms | -3 ms |
| Downbeat F | 0.421 | 0.577 |
| 8-bar line F | 0.228 | 0.367 |
| Tracks with the bar right (beat F > 0.7, downbeat F > 0.5) | 40% | 63% |
| Tracks with the phrase right too (8-bar F > 0.5) | 13% | 34% |
| Section starts on the grid's 8-bar line (within a beat) | 23% (27%) | 40% (45%) |

The ceiling for the last row is Raveform's own phrasing: 75% of these section starts sit on a marked 8-bar line. The tuning folds moved the same way (downbeat F 0.440 to 0.582, 8-bar F 0.231 to 0.354, section starts 24% to 39%).

By genre (folds 6 and 7, after): techno downbeat F 0.64, 8-bar F 0.45, section starts on the line 50%; tech house 0.63, 0.44, 44%; mainstage 0.66, 0.38, 39%; trance 0.54, 0.28, 37%. Drum and bass did not move (beat F 0.59, downbeat F 0.42): its beat is wrong at every level (any-level F 0.60), so the fault is the tempo tracker at 170+ BPM, not the grid.

What the baseline got wrong. When the beat was right, the bar position was right only 58% of the time even in drops, and the phrase about 60% of that. Per track, the majority place in the bar was right in 68% of tracks, so the grid mostly drifted rather than settling wrong. The clap cue cannot tell beat 1 from beat 3 (it scores them the same), which left that to the change cue. Measured at Raveform's own beats, the old hand-weighted cues pick beat 1 in 56% of 8-bar windows (60% over 16 bars, 65% over 32); the fitted cues 66%, 74% and 83%. For the phrase over 32 bars: the old rule 61%, fitted 65%.

What changed, each measured on folds 0 to 5 (downbeat F, 8-bar F): fitted cues instead of the hand weights (0.440 to 0.552, 0.231 to 0.327); a 16-bar downbeat memory instead of 8 (0.568, 0.340); a re-anchor only after 4 s instead of 1 s, so a breakdown's weak onsets do not pull the clock off and lose the bar count (0.582, 0.354).

What did not help: a 32-bar downbeat memory (0.564), a 48-bar phrase memory (0.552 against 0.552), switching after 4 bars instead of 2 (0.547), following small errors at 15% instead of 30% (0.564), a 20 ms latency instead of 25 (no change; the offset is already -3 ms). Two that helped a little but are not taken: a 12 s phase window (+0.006 downbeat F on Raveform, but Ballroom beat F fell by 0.01 on its 30 s excerpts), and re-anchoring after 8 s (+0.009, but a slower re-lock after a song change in a DJ set, which single tracks do not measure).

Where it is still weak: intros (the bar right only 43% of the time when the beat is, because there is no evidence yet), breakdowns (the beat itself right 63% of the time) and drum and bass.

## The grid loop (overnight stage 5)

An automated loop (`docs/experiments/grid-loop.md`) tried 40 changes to `beat-grid.ts` against a frozen evaluation (downbeat F + 8-bar F
+ 0.5 x beat F on Raveform folds 0 to 4, fold 5 as the check, Ballroom beat F and a song-change re-lock test as guards) and kept five:
re-anchoring after 6 s, off-beat re-anchors waiting 3x as long, phaseJump 0.2, a 24-bar downbeat memory and phaseFollow 0.4. On folds 6
and 7, scored once at the end: downbeat F 0.569 to 0.606, 8-bar F 0.363 to 0.404, beat F 0.800 to 0.811, section starts on the grid's
8-bar line 39% to 43% (the start here is stage 1's grid with stage 4's tempo tracker, so it differs slightly from the table above).

The trade: on 160 spliced pairs of tracks, 76% re-lock within 20 s of a song change against 81% before (median 12 s either way). Two
changes that scored higher on Raveform (off-beat threshold 0.35 or 0.3, re-anchoring after 8 or 12 s) cost more re-lock and were not
taken. What did not help: faster or slower downbeat and phrase switching, phrase memory 16 or 32 bars, a 32-bar downbeat memory, a 10 s
phase window, latency 20 or 30 ms, requiring the large errors to agree before a re-anchor, weighting the phrase cues by the downbeat
confidence, and leaving the downbeat cues out while a re-anchor is pending.

## Measured so far

On synthetic dance music (`beat-grid.test.ts`: a kick on every beat, claps on 2 and 4, a new bass note each bar, a crash and a pad change every 8 bars): beats within 35 ms, beat 1 right over 90% of the time, the 8-bar line right over 90%.

On Ballroom, before the Raveform work (Gouyon et al. 2006, 698 30 s excerpts of ballroom dances with hand-marked beats and bars, annotations by Krebs et al.; the 436 in 4/4 that have levels): beats F 0.69 at the marked rate and 0.82 allowing double, half or off-beat (the usual 70 ms window), median offset -1 ms. Downbeats are weak there: F 0.24 to 0.28 (chance is about 0.17). Ballroom does not follow dance music's conventions: the clap on 2 and 4 cue alone gives 0.22, the change across the bar line alone 0.28. The real test is EDM.

Ballroom after the Raveform changes, against the grid before them on the same set (all 523 excerpts in 4/4, levels made with `levels.py`; the 436 above were an earlier subset): beat F 0.59 and 0.59, any level 0.70 and 0.71, downbeat F 0.22 and 0.22, bar right 0.14 and 0.14. Not worse.

Two bugs the evaluation caught: beats were judged from the interval after them, so a slightly late clock credited a beat's hit to the beat before; and a correction on the frame a beat was due skipped it, which shifted every bar position after it by one (the downbeat was right 4% of the time on the synthetic test before the fix, over 90% after).

## First check of what the grid gives the sections

`grid-dump.mts` writes the grid's state every 250 ms (place in bar and phrase, beats to and since the 8-bar line, confidences) and `exp_grid.py` adds it to the section features, out of fold on the 339 labelled songs (clean feed, same decoder for both):

| | Without the grid | With it |
| --- | --- | --- |
| Drop F1 (precision / recall) | 0.36 (0.42 / 0.32) | 0.385 (0.44 / 0.34) |
| Buildup F1 / break F1 | 0.45 / 0.58 | 0.44 / 0.58 |
| Mean F1 | 0.462 | 0.470 |

34% of labelled drops land within a second of the grid's 8-bar line, against 6% of the time: 5.7 times chance. But Raveform says 73% of section starts are on an 8-bar line, so the grid's phrase position is often wrong. That is where the headroom is, and Raveform's marked beats are what will measure it. Not in the shipped model yet.

After the Raveform tuning (overnight stage 2, see `song-sections.md`, "Beat grid and Raveform"), the grid columns were scored on the shipped setup, a model trained on clean, room and laptop audio together, through the TypeScript tracker. There they do not help: drop F1 0.407 / 0.412 / 0.394 without them (clean / room / laptop) and 0.393 / 0.390 / 0.366 with them. A decoder prior that a drop lands near the 8-bar line did not help either (40% of SSME's labelled drops fall within 2 beats of the grid's line). So the grid is not wired into `AudioFeed` yet.

## Next

1. **Done: EDM evaluation on Raveform** (above). Left: the tempo tracker on drum and bass, and the bar and phrase in the first minute of a track.
2. **Tried: the section model reads the grid** (features and a phrase-line drop prior). No gain on the shipped multi-condition model; the plumbing is in (`SectionFeatures` takes a `GridState`, `SectionTuning.phraseLine*`), so a better grid can be tried again in minutes.
3. Wire `BeatGrid` into `AudioFeed` and expose it (`window.getBeatGrid`) once the grid finds the 8-bar line reliably enough for 2 to help.
