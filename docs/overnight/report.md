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
