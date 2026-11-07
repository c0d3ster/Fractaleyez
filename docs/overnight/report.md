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

## Stage 3: rhythm pattern names

### What changed

The name under the BPM in the Beat HUD (four on the floor, half time, syncopated and so on) was scored for the first time, and it was
mostly wrong on dance music: it read the app's merged beats, which mix the kick with the hats and drop anything inside the 250 ms Ignore
Time, so a techno track got "four on the floor" in only about half its readings and "syncopated" served as a catch-all. A new namer,
`nameRhythm` (`src/audioanalysis/rhythm-pattern.ts`), reads each frequency band's own onsets instead, at the tempo tracker's beat: four on
the floor when the bass band's hits repeat one, two and four beats later; syncopated when the drums play but the kick does not keep the
beat; nothing without a tempo or hits. The onset detector now marks each band's own rising edge, `BeatMonitor` keeps those onsets for
12 s, and `window.getRhythmPattern()` returns the new name. **The HUD does not show it yet**: the pipeline kept this stage out of the HUD
files (another session is working on them), and switching is one line in `BeatHud.tsx` (`estimate?.pattern` to
`source.getRhythmPattern?.() ?? null`). Commits `2625d18` (scoring tools, checkpoint 1) and `03b0402` (namer and plumbing), then the docs
commit after them. Details: `docs/implementation-plans/tempo.md`, "Rhythm pattern names".

### How it was scored

No dataset labels drum patterns, so the labels are a proxy from genre (`scripts/section-eval/pattern-labels.py` writes the mapping and
its weaknesses down): techno, house, trance and their kin should read four on the floor; dubstep half time; drum and bass and breaks a
breakbeat, which the app calls "syncopated". Three sets: Raveform (1,370 whole EDM tracks with sections, so drops, where the full drum
pattern plays, can be scored on their own), GiantSteps (664 two-minute EDM previews, clean and through a simulated laptop mic) and
Ballroom (698 dance excerpts, not EDM, to see what happens on other music). Everything was replayed exactly as the app runs it, tuned on
half the tracks (Raveform folds 0 to 3, half of GiantSteps by a hash of the id), and the numbers below are on the other half.

### Before and after

Share of readings (every 500 ms) named as the genre says; in brackets, the share of tracks whose most common name is right:

| Held-out half | Before | After |
| --- | --- | --- |
| Raveform drops: four on the floor | 52% (60%) | 84% (84%) |
| Raveform drops: drum and bass named syncopated | 50% (86%) | 77% (93%) |
| Raveform drops: drum and bass called four on the floor | 18% | 1% |
| Raveform, whole tracks: four on the floor / drum and bass | 43% / 48% | 74% / 65% |
| GiantSteps: four on the floor / drum and bass and breaks | 19% / 47% | 50% / 59% |
| GiantSteps, laptop mic: four on the floor / drum and bass and breaks | 16% / 49% | 55% / 57% |
| Dubstep named half time | 0% | 0% |

What got worse: through the laptop mic, drum and bass is now called four on the floor 27% of the time (7% clean), so a drum and bass
track's usual name is right 70% of the time there instead of 92%. On Ballroom, dances with a bass note on every beat (cha-cha, jive,
quickstep, samba, tango) are called four on the floor 53 to 61% of the time instead of 5 to 15%: the bass band cannot tell a kick from a
walking bass. Waltzes stay unnamed.

What was tried and did not help:

- **Half time, two-step, breakbeat or shuffle as names.** Dubstep and drum and bass look the same in every band's onsets at these settings;
  only the tempo (140 against 174) separates them, and naming from the BPM is guessing the genre, not hearing the drums. So no refined name
  was added, and the new namer never says half time.
- **The beat grid's bar positions.** Counting kicks on the grid's beats named four on the floor at most 67% of the time against 86%: the
  grid's phase is off often enough (against Raveform's own marked beats the kick is on 92% of beats, on only 71% of the grid's).
- **Looser thresholds for the old namer.** They raise drum and bass only by saying "syncopated" more often (in breakdowns too: 47% to
  67%), while four on the floor moves 3 points. Defaults unchanged.
- **The lo band as the kick** (for laptop mics): drum and bass then looks regular too (6% to 30%).
- **Requiring the kick to stand alone** (EDM kicks rarely coincide with hits in other bands, a band's bass notes do): it fixed Ballroom
  but cost real four on the floor (Raveform 87% to 73%, laptop 56% to 26%).

To review: the one-line HUD switch, and whether the Ballroom behaviour (a walking bass reads as four on the floor) matters for the music
you play.

### Cost

Session `session_01D1Q35eSPGqxCgJVMvRQgGL`, wall time 12:25 to about 14:15 UTC (1 h 50 min, most of it replaying 2,700 tracks through
the onset detector). `get_session` did not return `external_metadata.usage` for this session: cost: see the session.

## Stage 4: the BPM loop

### What changed

An automated loop tuned `TempoTracker` (the BPM the Beat HUD shows) on the GiantSteps tempo set. It made 40 attempts and kept three
changes: the bar term in each candidate tempo's score went from 0.5 to 0.75, the air band (cymbals and hats) went from 0.25 to 0.5, and
each score is now scaled to the total weight of its terms. That last one was needed because the bigger bar term had let a fan's noise show a
tempo. The hidden set improved slightly at 30, 60 and 144 fps, so `exp/bpm-loop` is merged into feat/bar-grid. Commits: bc80374, db9ae78 and 639f82a on `exp/bpm-loop`, merged in
4b446df. Every attempt is logged in
[`docs/experiments/bpm-loop.md`](../experiments/bpm-loop.md), and the method and what failed are in
[`tempo.md`](../implementation-plans/tempo.md#the-bpm-loop-overnight-stage-4).

How it was run: the 664 excerpts were split by a hash of the id into 60% tune, 20% check and 20% hidden
(`docs/experiments/bpm-loop-split.json`). The evaluation (`scripts/section-eval/bpm-loop-eval.py`) was committed before the first
attempt and never changed. The score is readings right + 0.5 x tracks usually right - 0.05 x jumps a minute, averaged over a clean feed
and a simulated laptop mic. A change was kept only if the tuning score rose by 0.005 or more, the check score did not fall and the tests
still passed. Every 10 attempts the loop also checked 30 and 144 fps and the noise files.

### Before and after (hidden 122 excerpts, never seen by the loop)

| | Before | After |
| --- | --- | --- |
| Score at 60 fps (30 / 144 fps) | 1.230 (1.216 / 1.223) | 1.239 (1.234 / 1.236) |
| Readings within 4% of the right tempo, clean / laptop mic | 82.1% / 81.9% | 82.7% / 82.8% |
| Tracks whose usual reading is right, clean / laptop mic | 82.8% / 82.0% | 82.8% / 82.8% |
| Visible jumps a minute, clean / laptop mic | 0.05 / 0.05 | 0.05 / 0.05 |
| Noise files (white, pink, brown, fan) showing a tempo | none | none |

This is a small gain. The tuning score rose by 0.036 and the check score by 0.036, but the hidden set rose by only 0.010. Most of what the
loop found was fitting the tuning excerpts. What is left is under one point of readings and about one excerpt out of 122, which is close
to the noise of a set this size. It is still better at every frame rate and on both inputs, and nothing got worse.

What did not help, or broke something:

- A wider or narrower tempo prior, or a different centre (135, 150).
- A stronger subdivision term (2, 2.5). Combined with a 12 s memory it passed the margin, but a synthetic test track then read at 1.5 times
  its tempo.
- The hi band at 1, and the bar term at 1. Both passed the margin and both broke the synthetic tests (claps on 2 and 4 pull to half
  tempo), so they were rejected.
- A longer memory or window, other switch and follow settings, lower strength and confidence gates, and a penalty at three beats.

The noise check caught a real problem: after attempt 13 the fan read a tempo 82% of the time. The fix was attempt 25, the score scale.
Attempts 13 and 21 were judged again together with it, against the start.

The errors left are mostly of three kinds. Slow tracks (70 to 90 BPM: chill-out, nu-disco, glitch-hop) read at double, because the prior
around 145 decides those and GiantSteps itself labels some drum and bass 87 and some 174. Dotted patterns read at 4/3 (127 as 168). Two-step
drum and bass reads at 2/3 (174 as 116). Fixing these needs a new kind of evidence, such as kick against snare placement, not more
tuning of these weights.

### Cost

Session `session_01D1Q35hKdYvB3hTYCjT8Ks7`, wall time 14:10 to about 15:20 UTC (1 h 10 min: about 20 min downloading and computing
levels, then the 40 attempts at 40 s each). `get_session` `external_metadata.usage` read at 15:14: cost_usd 1.72, input 557, output 15,352,
cache read 3,596,607, cache write 85,873 tokens. Like stage 1's figure, this looks lower than the full session would cost; the session's
own page has the full cost.

## Stage 5: the beat grid loop

### What changed

An automated loop tuned `BeatGrid`, which says where beat 1 of each bar and the 8-bar phrase line fall, on Raveform's expert-marked EDM
tracks. Out of 40 attempts it kept five changes, all to the beat clock and to how long the downbeat evidence lasts:

- The clock re-anchors after a large phase error has lasted 6 s instead of 4 s, and 18 s when the new phase is near the off-beat.
  About a third of re-anchors went there: hi-hats between the kicks pull the phase score, especially in breakdowns.
- Up to 20% of a beat counts as a small error (was 15%), and the clock follows small errors 40% of the way each update (was 30%).
- The downbeat evidence is remembered for 24 bars instead of 16.

The hidden folds improved, so `exp/grid-loop` is merged into feat/bar-grid. The kept commits are on `exp/grid-loop` (the merge is
953a3e6). Every attempt is logged in [`docs/experiments/grid-loop.md`](../experiments/grid-loop.md), and the method and what failed are
in [`bar-grid.md`](../implementation-plans/bar-grid.md#the-grid-loop-overnight-stage-5).

How it was run: Raveform's own folds, 0 to 4 for tuning (855 tracks), 5 for the check (172) and 6 and 7 hidden (343). The evaluation
(`scripts/section-eval/grid-loop-eval.py`) was committed before the first attempt and never changed. The score is downbeat F + 8-bar
line F + 0.5 x beat F. A change was kept only if the tuning score rose by 0.005 or more, the check score did not fall and Ballroom beat
F (non-EDM, as a guard) stayed within 0.002 of its start. After attempt 16 a second guard was added, because longer re-anchor waits kept
winning: 160 pairs of tracks spliced together, timing how fast the grid locks onto the second song, as in a DJ set. A change that cut
the share re-locking within 20 s by more than 0.02 was not taken.

### Before and after (hidden folds 6 and 7, 343 tracks, scored once at the end)

| | Before | After |
| --- | --- | --- |
| Score | 1.332 | 1.415 |
| Beat F | 0.800 | 0.811 |
| Downbeat F | 0.569 | 0.606 |
| 8-bar line F | 0.363 | 0.404 |
| Tracks with the bar right (and the phrase too) | 58% (33%) | 64% (39%) |
| Section starts on the grid's 8-bar line (ceiling 75%) | 39% | 43% |
| Ballroom beat F, downbeat F | 0.609, 0.221 | 0.616, 0.226 |
| Song change: re-locked within 20 s (median) | 81% (12 s) | 76% (12 s) |

Unlike stage 4, this generalizes: tuning rose by 0.075, the check by 0.086, the hidden folds by 0.083. Every genre with more than 15
hidden tracks gained downbeat F (techno 0.61 to 0.65, trance 0.52 to 0.56, mainstage 0.64 to 0.69). The "before" here is stage 1's
grid with stage 4's tempo tracker, which is why it is a little below stage 1's 0.577 and 0.367.

The price is a slightly slower recovery after a song change: 5 more pairs in 100 take longer than 20 s, because a wrong phase is now
given 6 to 18 s before the clock drops it. Two settings that scored higher on Raveform (a wider off-beat zone, or waiting 8 to 12 s for
every re-anchor) cost more re-lock and were not taken. A real DJ-set test would settle the trade better than spliced tracks.

What did not help: faster or slower downbeat and phrase switching (including a separate switch time for the phrase, now an option), a
16 or 32-bar phrase memory, a 32-bar downbeat memory, a 10 s phase window, a 20 or 30 ms latency, requiring the large errors to agree
before a re-anchor, weighting the phrase evidence by the downbeat confidence, and dropping downbeat evidence while a re-anchor is
pending. Nothing on the phrase side moved, so the 8-bar line gained only through a better bar. Getting it from 40% to Raveform's 75%
probably needs new phrase cues, not tuning. Drum and bass is still the weakest (beat F 0.74, its tempo).

### Cost

Session `session_01D1Q35fDbr1DsFqQ1gbXzHQ`, wall time 15:15 to about 17:45 UTC (2 h 30 min: about 25 min downloading and making
Ballroom levels, 1 h 45 min for the 40 attempts at about 2.5 min each, then the hidden scoring and write-up). `get_session`
`external_metadata.usage` read at 17:40: cost_usd 3.14, input 1,619, output 32,341, cache read 7,902,863, cache write 112,412 tokens.
Like stages 1 and 4, this probably undercounts; the session's own page has the full cost.
