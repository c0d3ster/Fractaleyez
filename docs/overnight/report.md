# Live music structure for Fractaleyez: report

How the visualizer learned to hear song structure live from a microphone (buildups, drops, breaks, song changes, a steady tempo and a beat
grid), what was measured at each step, and what it cost. Stage 0 is the interactive session that did the groundwork; stages 1 to 6 ran
unattended overnight (see `pipeline.md`), each adding its own section below. The final summary goes at the top when the last stage ends.
The raw log of every checkpoint is `status.md`; this file is the story.

## Stage 0: from hand-tuned rules to measured models (interactive session)

### Where it started

A previous agent had built a section tracker (intro, groove, buildup, break, drop, outro) as about 80 hand-set thresholds, tuned by
reading charts of 11 songs. It had never been scored against labels. The user reported that it was poor at transitions and reset the song
clock between drops.

### How it was measured

Everything here is judged against human labels on audio the model never saw, through the real TypeScript code the app runs:

- **Sections**: the Socially Significant Music Events set (Yadati et al. 2018): 402 Creative Commons EDM tracks, 339 with expert drop,
  build and break labels. Scored out of fold (5 folds by track; each track scored by a model that never trained on it).
- **Tempo**: the GiantSteps tempo set: 664 two-minute EDM excerpts with human-corrected tempos and genres. Tuned on one part, scored on
  another, and finally cross-validated over all of it.
- **Beats and bars**: Ballroom (hand-marked beats and bars) and, overnight, Raveform (1,423 expert-annotated EDM tracks, beats, downbeats and
  sections).
- **A real microphone**: every dataset also run through a simulated room and a simulated laptop (laptop speakers into the laptop mic, which
  lose almost all bass), and synthetic noise (white, pink, brown, a fan).

### What changed, and what it bought (against the baseline, same data and scoring)

The baseline is what existed when this work started: the hand-tuned section tracker on `feat/song-sections-auto-mode` (#266) and the old
BPM estimator (`estimateTempo` over the last 12 s of detected beats). Every row below is measured, out of sample, on the same data for both.

**Sections** (339 expert-labelled SSME tracks, out of fold; F1 is the balance of precision and recall, 1 is perfect):

| | Baseline | Now (clean) | Now (room mic) | Now (laptop mic) | Baseline (laptop mic) |
| --- | --- | --- | --- | --- | --- |
| Drop F1 | 0.20 | 0.39 | 0.41 | 0.35 | 0.06 |
| Drops fired per real drop | 1.88 | 0.85 | 0.83 | 0.73 | 1.80 |
| Buildup F1 | 0.09 | 0.44 | 0.43 | 0.39 | 0.09 |
| Break F1 | 0.28 | 0.52 | 0.53 | 0.53 | 0.16 |
| A buildup shown before a drop | 22% | 84% | 83% | 81% | 22% |
| False song-clock resets per song | 0.41 | 0.06 | 0.03 | 0.03 | 0.39 |
| Median drop latency | 1.0 s | 1.0 s | 1.0 s | 0.75 s | 1.1 s |

**Song changes** (playlists of 5 songs; found within 25 s, and invented changes per hour):

| | Baseline | Now |
| --- | --- | --- |
| Back to back | 80% found, 3.9 invented an hour | 78%, 0.7 |
| 2 s gap | 82%, 6.7 | 98%, 0.5 |
| 6 s crossfade | 63%, 6.4 | **38%, 0.3 (a regression in what is found)** |

**Tempo** (GiantSteps, 661 excerpts; tuned and scored on separate halves, then cross-validated):

| | Baseline | Now |
| --- | --- | --- |
| Readings within 4% of the true tempo | 59% | about 82% |
| Tracks whose usual reading is right | 76% | 84 to 85% |
| Visible jumps (over 4%) per minute | 10.5 | under 0.5 |
| Laptop mic, readings within 4% | 66% | 83% |
| 30 fps / 144 fps, readings within 4% | 55% / 60% | 81% / 82% |
| A tempo shown on pure noise | 86% of the time | never |
| First tempo after (median) | under 12 s | 11 s |
| Excerpts that never get a tempo | about 3% | about 4% |

**Noise** (synthetic, through the app's own filters; every hit is false):

| | Baseline | Now |
| --- | --- | --- |
| Fan, clean / laptop mic (hits a minute) | 39 / 16 | 7 / 2 |
| White and pink noise | about 10 | 0 |
| Brown noise | 32 | 1 |
| EDM kicks and claps detected a minute (should not drop) | 112 | 109 |

**New, with no baseline to compare against**: the beat grid (beats F 0.69 on Ballroom at the marked rate, 0.82 at any level; on Raveform's
real EDM, stage 1's first run: beat F 0.80, downbeat F 0.44, 8-bar F 0.23); the turnaround section (about 1 in 4 is followed by a drop,
with about 2 s of warning); grid features in the section model (+0.025 drop F1 in a first test). And the cost of all of it: 1.8 ms of CPU
per second of audio for the sections (baseline 1.5 ms) and 1.0 ms for the tempo (baseline 0.7 ms, which only ran while the Beat HUD was
open).

The pieces:

1. **Section model** (#267). 85 features every 250 ms from the five band levels the app already measures, all relative to the song's own
   levels; gradient-boosted trees (about 100 KB) for buildup, break, drop and song change; a decoder whose thresholds were tuned on
   out-of-fold output. Trained on clean, room and laptop audio together. A "turnaround" section (the music cutting out during a buildup).
2. **Tempo tracker** (#268). Reads onset strength from all five bands every frame instead of sparse beat events, scores periods by
   autocorrelation with bar and subdivision terms under a tempo prior, and holds the shown tempo until a new one clearly wins.
3. **Noise gates** (#268). Steady noise in the narrow bass band swings a few dB on its own, which the old onset test read as kicks. While
   no rhythm is heard, a hit must stand over the band's own floor and a bass hit needs the kick's body to rise with it.
4. **Beat grid** (#269). A beat clock locked to the onsets, beat 1 of the bar, and the 8-bar phrase line. Raveform's labels show why it
   matters: 73% of EDM sections start on an 8-bar line. A first test gave the section model +0.025 drop F1.

### What was tried and did not help

Spectral features from the app's FFT; more model capacity; lagged copies of the features; waiting 1 to 3 s before calling a drop (real
drops and false alarms look the same afterwards); a looser drop threshold around a turnaround. Each is written up in `song-sections.md`.

### Bugs the measurements caught before they shipped

- The section tracker was fed the onset detector's smoothed levels, not the raw ones it was trained on.
- The session recording held 14.7 MB of objects after 45 minutes (now a fixed 1.4 MB).
- The tempo tracker dropped a third of the frames at 144 fps, and read frame-to-frame jitter as onsets.
- The tempo tracker showed a tempo on pure noise; its first tempo took 18 s because of how its normalisation started.
- The beat grid skipped a beat now and then, which moved every bar line after it by one.

### What is left (going into the night)

Downbeats and 8-bar lines are the weak part of the grid on real EDM (stage 1's first numbers: downbeat F 0.44, 8-bar F 0.23). Crossfaded
song changes are mostly missed (38%). Nothing has been checked on a real microphone session yet, or on music other than electronic and
ballroom.

### Cost

Session `session_01D1Q35feAxbgydgMeXfVb4u`, read at 2026-11-07T08:12Z (before the pipeline started; the session stayed open afterwards):
$58.35. Tokens: 264,016 input, 505,034 output, 174,148,853 cache read, 1,882,736 cache write. About 9 h 50 min of wall time, much of it
waiting on downloads, feature extraction and training.

## Stage 1: the beat grid on real EDM

### What changed

The beat grid (`BeatGrid`, which says where beat 1 of the bar and the 8-bar phrase line fall) was scored for the first time on real EDM:
Raveform's 1,370 fetchable tracks, against beats marked by experts. The beat itself was already good, but beat 1 and the phrase line were
often wrong. The hand-weighted cues that picked beat 1 were replaced by small models fitted on Raveform's marked beats, and the grid now
keeps a longer memory and waits longer before re-anchoring the beat clock. Commits `3b72124` (the Raveform scorer and baseline), `c8aa641`
(the fitted cues), `f92c045` (memory and re-anchor, docs). Details: `docs/implementation-plans/bar-grid.md`, "Measured on Raveform".

### Before and after

Raveform folds 6 and 7 (343 tracks, held out of every fit and tuning step), within 70 ms, from 10 s into each track:

| | Before | After |
| --- | --- | --- |
| Beat F (1 is perfect) | 0.806 | 0.810 |
| Downbeat F | 0.421 | 0.577 |
| 8-bar line F | 0.228 | 0.367 |
| Tracks with the bar right most of the time | 40% | 63% |
| Tracks with the phrase right too | 13% | 34% |
| Section starts on the grid's 8-bar line (ceiling: 75%, Raveform's own phrasing) | 23% | 40% |
| Ballroom (523 excerpts in 4/4): beat F, downbeat F | 0.59, 0.22 | 0.59, 0.22 |

Why it was weak: the old clap cue scored beat 1 and beat 3 the same, so telling them apart was left to one weak cue. At Raveform's own
beats the old cues picked beat 1 in 56% of 8-bar windows; the fitted ones in 66% (and 83% over 32 bars). Folds 0 to 5, step by step
(downbeat F): fitted cues 0.440 to 0.552, a 16-bar memory 0.568, re-anchoring after 4 s instead of 1 s 0.582.

Tried and not kept: a 32-bar downbeat memory, a 48-bar phrase memory, slower switching, gentler phase correction, a different latency
constant (none helped); a 12 s phase window (helped Raveform by 0.006 but cost Ballroom 0.01 beat F); re-anchoring after 8 s (+0.009, but
it would re-lock slowly after a song change in a DJ set, which single tracks do not measure).

Left: drum and bass did not improve (beat F 0.59: its tempo is wrong, a tempo tracker problem), the first minute of a track (no evidence
yet), and breakdowns (the beat right 63% of the time). New tools: `scripts/section-eval/grid-score-raveform.py`, `grid-train.py`.

### Cost

Session `session_01D1Q35fX2qXdaHm8xqch76R`, wall time 07:49 to 09:22 UTC (1 h 33 min, of which about 12 min waiting for the data).
`get_session` `external_metadata.usage`: cost_usd 0.96, input 525, output 2,567, cache read 901,005, cache write 90,995 tokens. These
figures look like the latest turn only, not the whole session; the session's own page has the full cost.

## Stage 2: the section model with the grid and Raveform's tracks

### What changed

Nothing in the shipped model. Three ideas for making the section tracker better at drops were built and measured: the beat grid as model
features, a rule that drops land on 8-bar lines, and Raveform's 1,370 tracks added to the training labels. None of them beat the
current model on SSME's expert labels without losing on the laptop mic, which was the rule for shipping, so `section-model.json` is
unchanged and the grid is not wired into `AudioFeed` yet. The plumbing stays, off by default, so a better grid can be retried in
minutes: `SectionFeatures` reads a `GridState`, `SectionTuning` has the phrase-line prior, and the training tools take Raveform. Commits
`28e9c20` (plumbing), the stage 2 status and docs commits after it. Details: `docs/implementation-plans/song-sections.md`, "Beat grid and
Raveform".

### Before and after

First the current model was rebuilt from scratch and scored again, to check the measurement before changing anything. It reproduces the
documented numbers within noise (laptop drop F1 came out 0.04 higher than documented; the simulated mic's random seeds differ).

SSME's 339 tracks, out of fold (each track scored by a model that never saw it), through the TypeScript tracker the app runs. F1 balances
precision and recall, 1 is perfect:

| | Current model (clean / room / laptop) | With the grid as features |
| --- | --- | --- |
| Drop F1 | 0.407 / 0.412 / 0.394 | 0.393 / 0.390 / 0.366 |
| Buildup F1 | 0.435 / 0.426 / 0.392 | 0.432 / 0.425 / 0.397 |
| Break F1 | 0.523 / 0.524 / 0.522 | 0.526 / 0.525 / 0.522 |

Adding Raveform (its sections mapped: buildup to build, breakdown and cooldown to break, a drop after a non-drop to a drop), out of fold
on both sets (Python decoder for SSME, TypeScript tracker for Raveform; Raveform has clean levels only, so no laptop column):

| | SSME mean F1 | SSME laptop drop F1 | SSME buildup F1 | Raveform mean F1 (drop F1) |
| --- | --- | --- | --- | --- |
| Current model (SSME only) | 0.463 | 0.386 | 0.427 | 0.254 (0.328) |
| Trained on both | 0.410 | 0.339 | 0.319 | 0.624 (0.679) |
| Raveform for drops only | 0.455 | 0.327 | 0.427 | 0.383 (0.666), Python |
| Raveform at a tenth of the weight | 0.449 | 0.368 | 0.403 | 0.506 (0.527), Python |

What the numbers say:

- **The grid as features** helps a model trained on the clean feed alone (drop F1 0.367 to 0.394), which is what the first test in stage
  0 saw. But the shipped model trains on clean, room and laptop audio together and is already at 0.40 without the grid; on top of that,
  the grid costs drops, most on the laptop mic (0.394 to 0.366). The grid finds the 8-bar line only part of the time (stage 1's 8-bar F
  is 0.37), less with the bass gone, so what the trees learn about line positions does not carry to new songs.
- **A drop prior on the 8-bar line** (a lower threshold near the line, a higher one elsewhere), tuned on SSME folds 0 to 2: no setting of
  36 helped. 40% of SSME's drops fall within 2 beats of the grid's line, 3.8 times chance, but the other 60% are lost when the threshold
  rises off the line.
- **Raveform** labels the same music differently. It calls most of the rise before a drop a breakdown and marks a drop at every return to
  full energy; SSME's experts mark a build and a drop only where the music builds to a moment. Trained on both, the model gets much better
  at Raveform's labels and worse at SSME's, mostly buildups (shown before 66% of drops instead of 84%). Which convention the visuals
  should follow is a design choice for you, not something the data can settle; SSME's is closer to what Auto mode needs (a warning before
  the drop).

Left: the grid needs to find the 8-bar line much more reliably, on a laptop mic too, before it can help the sections; Raveform's labels
would need a closer mapping (its breakdowns split into break and build by how the level moves) before they can be pooled with SSME's.

### Cost

Session `session_01D1Q35iqnHvET3EWnJGkpaE`, wall time 09:20 to about 12:05 UTC (2 h 45 min, most of it computing levels, features and
models). `get_session` `external_metadata.usage` read at 12:03: cost_usd 6.15, input 3,210, output 54,120, cache read 17,756,372, cache
write 187,114 tokens.
