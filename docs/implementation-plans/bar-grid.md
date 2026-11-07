# Bar Grid

## Context

The section tracker reacts to the sound alone, so it cannot tell a drop from the music coming back to full at the end of a fill: two seconds later they look the same (see `song-sections.md`, "waiting before calling a drop"). What separates them is where they fall in the song's phrasing. EDM is built on a strict grid, so knowing the beat, beat 1 of the bar and the 8-bar line says when a section can change.

Code: `src/audioanalysis/beat-grid.ts` (`BeatGrid`), on top of `TempoTracker`. Not wired into the app yet: it waits for an evaluation on real EDM (below). Evaluation: `scripts/section-eval/grid-eval.mts` and `grid-score.py`.

## What the grid is worth (Raveform)

Raveform (Kim et al., TISMIR 2026, labels CC BY 4.0, https://huggingface.co/datasets/taejunkim/raveform): 1,423 EDM tracks (techno 547, trance 175, drum and bass 171, tech house 143, mainstage 126) with every beat, its place in the bar and its section marked by experts.

- All 1,423 are in 4/4, and every section starts on a downbeat.
- Counted in bars from the first downbeat, sections start on a 4-bar line 83% of the time, an 8-bar line 73%, a 16-bar line 47% and a 32-bar line 24% (chance: 25, 12.5, 6 and 3%).
- 83 to 93% of sections last a multiple of 8 bars. Drops last a median of 24 bars (16 to 48), breakdowns, buildups, intros and outros 16 (8 to 32 or 40).
- Half of all drops start on a 16-bar line. Before a drop comes a breakdown (2,780), another drop (1,201), a buildup (521) or the intro (241).

So with a working grid, a drop is only expected about once every 8 bars (about 15 s at 128 BPM) instead of at any of the 60 or so 250 ms slots in between.

## How it works

1. **Beat clock.** The tempo tracker gives the period. Every 250 ms the last 8 s of its onset strength (5 ms bins, lightly smoothed) is scored against every phase of that period, leaving out the newest 60 ms where a beat's onset is still arriving. The clock moves 30% of the way to a small error each time; an error over 15% of a beat has to persist for four updates (1 s) before the clock re-anchors. Beats are scheduled from the last one that fired, so a correction can neither skip a beat nor fire one twice, and beats a re-anchor jumps over are still counted, so the place in the bar stays aligned with the music. A constant 25 ms is taken off for the band filters' and level windows' own lag (measured on Ballroom: the median offset went from +25 ms to -1 ms).
2. **Downbeat.** Each beat is judged from a window around it once it is past (a quarter beat before to half a beat after): the clap or snare rise (beats 2 and 4 in dance music), the kick rise, and how much the band levels changed from the beat before to the beat after (bar lines change most). Kept per position in the bar with an 8-bar memory; the downbeat is the position whose evidence wins, decided on a bar's last beat and changed only after another position has led for 2 bars.
3. **Phrase.** At each bar line, how much the bar's band levels differ from the bar before, kept per position in an 8-bar cycle with a 24-bar memory; the phrase line is the position with the most change.

`GridState`: `beat`, `beatInBar` (1 to 4), `barInPhrase` (1 to 8), `periodMs`, `lastBeatMs`, `nextBeatMs`, `downbeatConfidence`, `phraseConfidence`.

## Measured so far

On synthetic dance music (`beat-grid.test.ts`: a kick on every beat, claps on 2 and 4, a new bass note each bar, a crash and a pad change every 8 bars): beats within 35 ms, beat 1 right over 90% of the time, the 8-bar line right over 90%.

On Ballroom (Gouyon et al. 2006, 698 30 s excerpts of ballroom dances with hand-marked beats and bars, annotations by Krebs et al.; the 436 in 4/4 that have levels): beats F 0.69 at the marked rate and 0.82 allowing double, half or off-beat (the usual 70 ms window), median offset -1 ms. Downbeats are weak there: F 0.24 to 0.28 (chance is about 0.17). Ballroom does not follow dance music's conventions: the clap on 2 and 4 cue alone gives 0.22, the change across the bar line alone 0.28. The real test is EDM.

Two bugs the evaluation caught: beats were judged from the interval after them, so a slightly late clock credited a beat's hit to the beat before; and a correction on the frame a beat was due skipped it, which shifted every bar position after it by one (the downbeat was right 4% of the time on the synthetic test before the fix, over 90% after).

## Next

1. **EDM evaluation on Raveform.** Its audio is only on YouTube, which refuses downloads from the cloud session. `scripts/section-eval/raveform-fetch.py` fetches it on a machine where YouTube works and keeps only the band levels (about 350 MB for all 1,423 tracks). Then: beats, downbeats and 8-bar lines against Raveform's marks, and the section model retrained on Raveform's sections.
2. **The section model reads the grid.** Bar in phrase, beats to the next 8-bar line and the grid's confidence as features, and a prior in the decoder that a drop lands on a phrase line. Scored out of fold on the 339 labelled tracks, the same way as everything else.
3. Wire `BeatGrid` into `AudioFeed` and expose it (`window.getBeatGrid`) once 1 and 2 show it helps.
