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
