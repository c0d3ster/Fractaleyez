# Tempo

## Context

The Beat HUD's BPM was read afresh twice a second from the last 12 s of detected beats (`estimateTempo` in `tempo.ts`). It jumped about 10 times a minute and was within 4% of the right tempo 59% of the time on clean audio. Three causes: the beats it reads are sparse (at most one per 250 ms, from the bass and hi bands only), nothing carries over from one reading to the next, and nothing prefers the tempos music is usually counted at, so a 128 BPM track could read 96 or 176.

`TempoTracker` (`src/audioanalysis/tempo-tracker.ts`) replaces it for the BPM shown. `estimateTempo` still names the rhythm pattern and gives the consistency figure, and the section tracker still uses it to confirm a song is playing.

## How it works

1. Every frame, how much each onset band rose in dB over its own level of the last 20 ms (a follower), times the frame's length, each band scaled by its own running average (so a band that is empty on this input, like the bass on laptop speakers, neither dominates nor vanishes) and weighted toward the kick (bass 2, lo 1, mid 0.5, hi 0.5, air 0.25).
2. Every 500 ms, that onset strength over the last 12 s on a 10 ms grid (each frame's share spread over the time it covers), and its autocorrelation. A beat period scores its correlation plus half of its correlation at two and four periods (bars), plus 1.5 times its correlation at half a period (subdivision), times a log-normal prior around 145 BPM half an octave wide. Not three periods: that made dotted patterns win.
3. The scores are blended into a running score (8 s memory). The shown tempo follows small drifts of the same peak smoothly, and moves to a different peak only when it scores 15% higher for four readings in a row (2 s). With no onsets (a breakdown) it holds the last tempo for 30 s, then shows none.

About a millisecond of work every 500 ms.

## Measured

The GiantSteps tempo set (Knees et al. 2015, corrected tempos from Schreiber and Müller 2018): 664 two-minute EDM excerpts with labelled tempo and genre. The options were tuned on 116 of them; the numbers are on the other 546. "Laptop" is laptop speakers into the laptop mic (`levels.py --mic laptop`). A reading is right within 4% (the usual tolerance); "octave" also accepts half, double, a third or three times.

| | Old, clean | New, clean | Old, laptop | New, laptop |
| --- | --- | --- | --- | --- |
| Readings within 4% | 59% | 80% | 66% | 83% |
| Within 4% up to octave | 66% | 87% | 73% | 90% |
| Tracks whose usual reading is right | 76% | 84% | 82% | 85% |
| Visible jumps (over 4%) per minute | 10.8 | 0.6 | 9.5 | 0.4 |

At 60 fps. The app runs from 30 fps (Saver) to 144 and more, and the result holds across that: readings within 4% are 79% at 30 fps and 80% at 144 (the old estimator: 55% and 60%).

By genre (new, clean, readings within 4%): psy-trance 99%, breaks 97%, deep house 93%, techno 91%, trance 91%, tech-house 89%, electro-house 81%, dubstep 78%, house 78%, drum and bass 72%, electronica 71%, glitch-hop 62%, chill-out 62%. Drum and bass was the weak spot before the subdivision term (its two-step kick spaces kicks a beat and a half apart, read as 116 for 174); that term was added after seeing those errors on the test excerpts, but its weight was tuned on the 116 only.

Two bugs the frame-rate check caught, both now fixed and covered by the 30, 60 and 144 fps test: sampling one frame per 10 ms bin dropped a third of the frames at 144 fps (35% right there), and rises from one frame to the next counted every jitter as an onset, more of them the faster the frames.

### Tuning on all of it

To use every labelled excerpt without losing an honest score, the options were tuned again by 2-fold cross-validation: a coordinate search on one half of the 661, scored on the other half, then the other way round. Both halves chose a bass weight of 2 instead of 3, and each gained about 2 points on its unseen half (80.3% to 82.6% of readings right, and 79.3% to 81.7%). The other changes each half picked (a narrower prior, different bar weights) disagreed, so they were left out. With that one change, over all 661: 82% of readings right at 60 fps (81% at 30, 82% at 144), 85% of tracks usually right, 0.4 visible jumps a minute; on the laptop mic 83%, 85% and 0.3. Those are on excerpts the bass weight was chosen with, so the cross-validated 82% is the honest figure.

### The BPM loop (overnight stage 4)

An automated loop (`docs/experiments/bpm-loop.md`) proposed one change at a time to `TempoTracker` and kept it only if the tuning score
rose by at least 0.005 without the check score falling, with the tests, 30 and 144 fps and the noise files as guards. The GiantSteps
excerpts were split by a hash of the id: 60% tune, 20% check, 20% hidden (`docs/experiments/bpm-loop-split.json`, scored by
`scripts/section-eval/bpm-loop-eval.py`). Score: readings right + 0.5 x tracks usually right - 0.05 x jumps a minute, the mean of clean
and the laptop mic. 40 iterations; kept: the four-beat (bar) term from 0.5 to 0.75, the air band from 0.25 to 0.5, and each period's score
scaled to the total weight of its terms (3.5), because the larger bar term had lifted noise past `minStrength` (the fan showed a tempo).

| Hidden 122 excerpts, 60 fps | Before | After |
| --- | --- | --- |
| Readings within 4%, clean / laptop | 82.1% / 81.9% | 82.7% / 82.8% |
| Tracks usually right, clean / laptop | 82.8% / 82.0% | 82.8% / 82.8% |
| Jumps a minute, clean / laptop | 0.05 / 0.05 | 0.05 / 0.05 |
| Score (30 / 60 / 144 fps) | 1.216 / 1.230 / 1.223 | 1.234 / 1.239 / 1.236 |

The tuning score rose 1.259 to 1.295 and the check score 1.194 to 1.230, but the hidden set gained a quarter of that: most of the gain was
fitting the tuning excerpts, and what is left (under a point of readings, one excerpt's worth of tracks) is near the noise of 122 excerpts.
Did not help, or broke something: a narrower or wider prior, a different centre (135, 150), a stronger subdivision (2, 2.5: past the
margin together with a 12 s memory, but a synthetic 124 to 174 BPM test track then reads at 1.5 times), the hi band at 1 and the bar term
at 1 (both past the margin, both broke the synthetic tests: claps on 2 and 4 pull to half tempo), longer memory or window, other switch
and follow settings, lower strength and confidence gates, a penalty at three beats. The errors left on the tuning part are mostly slow
tracks (70 to 90 BPM, chill-out, nu-disco, glitch-hop) read at double, where the prior around 145 decides and where GiantSteps itself
labels some drum and bass 87 and some 174; dotted patterns read at 4/3 (127 as 168); and two-step drum and bass read at 2/3 (174 as 116).

## Noise (a fan, room hiss)

Checked with synthetic noise through the app's band filters (`scripts/section-eval/noise.py`: white, pink, brown, and a fan: hiss, rumble, motor hum and a blade whoosh).

- **The tempo tracker showed a tempo on pure noise** 86% of the time (140 to 167 BPM on the fan): its old test was only how much the best tempo stood out from the others, and on noise something always stands out a little. Now it also needs real periodicity: the best period's running score (`TempoReading.strength`) at 0.6 or more to keep a tempo, and 0.7 for six readings in a row (3 s) to show a first one. Noise never got past 0.53 once settled. Result: no tempo on any of the noise files, clean or through the laptop mic; on music 81 to 83% of readings right, the first tempo after a median 11 s, 25 of 661 excerpts with none.
- That needed a fix to how the per-band normalisation starts (a running average from the first frame instead of from a made-up value): before it, early readings were weak and the first tempo took a median 18 s.
- **The onset detector fired on noise**: a fan 39 bass "hits" a minute (16 on the laptop mic), white and pink noise about 10, brown 32. The bass band is 110 Hz wide and read over 46 ms, so noise in it swings a few dB on its own, and a hit only had to rise 3 dB over the last 150 ms. Two gates now apply while the tempo tracker hears no rhythm (`OnsetParams.rhythm`, `OnsetDetectorOptions`): a hit must stand 6 dB over the band's own floor (a running 20th percentile), and a bass hit needs the lo band to rise at the same moment (a kick's boom comes with its body; a swing of rumble does not). Fan: 7 a minute (2 on the laptop mic), white and pink 0, brown 1. With music they stay off once the tempo locks, so real hits are kept: EDM 109 hits a minute against 112 (the difference is the first seconds of a song). Left on all the time they would cost a third of the bass hits on EDM, which is why they are gated on rhythm.

## Cost

Measured with `scripts/section-eval/bench-cpu.mts` (Node 22, the same V8 as Chrome) on 95 minutes of songs at 60 fps: 1.0 ms of CPU per second of audio, 0.1% of each frame's 16.7 ms. The work happens on the frame that makes a reading, every 500 ms: about 0.9 ms (p99) there, most of it the autocorrelation (about 400 lags over 1,200 samples). The old estimator cost 0.7 ms per second, and only while the Beat HUD was open; the tracker runs whenever audio does, since the sections and the bar grid will read it.

## Rhythm pattern names

The line under the BPM in the Beat HUD names the rhythm: four on the floor, half time, double time, sixteenths, dembow or syncopated. It came from `estimateTempo` (`tempo.ts`) reading the app's beats, the merged bass and hi band onsets with the Ignore Time (250 ms) between them. That input cannot say much: a beat does not say whether it was the kick or a hat, and 250 ms of dead time drops every eighth note at dance tempos, so double time, sixteenths and dembow almost never fire.

### How it was scored

No dataset labels drum patterns, so the labels are a proxy from each track's genre (`scripts/section-eval/pattern-labels.py`, which writes the mapping and its weaknesses down): techno, house, trance and their kin to four on the floor; dubstep to half time; drum and bass and breaks to breakbeat (named "syncopated" by the app, which has no breakbeat name). Other genres are left out. The weak points: the label is per track while the name is per reading, so a breakdown without a kick counts against a techno track; genres come from a store, not from listening to the drums. Raveform's sections help with the first: its drop sections are where the full pattern plays, so they are scored separately ("drops").

`pattern-eval.mts` replays band levels exactly as `AudioFeed` runs them and records both names every 500 ms; `pattern-score.py` prints the confusion matrix. "Right" is the share of readings named as the proxy says (an unnamed reading counts as wrong). Everything was tuned on half the tracks (Raveform folds 0 to 3, GiantSteps by a hash of the id) and the numbers below are the other half.

### What the old names did

On Raveform (all 1,370 tracks, current code), four on the floor genres were named four on the floor in 43% of readings (52% in drops), "syncopated" 32% and nothing 23%; drum and bass was "syncopated" 48%. On GiantSteps, four on the floor 21%, drum and bass and breaks "syncopated" 48%, and dubstep was never "half time" (0.3%: "syncopated" 40%, nothing 55%). On Ballroom every dance was mostly "syncopated" or nothing. So "syncopated" was a catch-all, and on EDM the most common name for a techno track was wrong almost half the time.

### Naming from each band's own onsets

`nameRhythm` (`rhythm-pattern.ts`) reads each onset band's own hits over the last 12 s (`BeatMonitor.getBandOnsets`, from the rising edge every band already computes, 100 ms dead time per band) at the tempo tracker's beat:

- **Four on the floor**: the bass band's hits repeat one, two and four beats later (on average at least half of them, within 40 ms), and come at least 0.3 a beat. Repeats rather than gaps between neighbours, so a bass note between two kicks does not break it.
- **Syncopated**: otherwise, while the bass or hi band hits at least 0.4 a beat (the drums play, but the kick does not keep the beat: breakbeats, two-step, half time).
- **Nothing** without a tempo, or with fewer hits (a breakdown, silence).

Measured on the held-out half (readings right, and in brackets the share of tracks whose most common name is right):

| | Old | New |
| --- | --- | --- |
| Raveform drops: four on the floor | 52% (60%) | 84% (84%) |
| Raveform drops: drum and bass named syncopated | 50% (86%) | 77% (93%) |
| Raveform drops: drum and bass called four on the floor | 18% | 1% |
| Raveform drops: four on the floor called syncopated | 27% | 16% |
| Raveform, all readings: four on the floor / drum and bass | 43% / 48% | 74% / 65% |
| GiantSteps: four on the floor | 19% (27%) | 50% (60%) |
| GiantSteps: drum and bass and breaks | 47% (87%) | 59% (91%) |
| GiantSteps through a laptop mic: four on the floor | 16% (16%) | 55% (68%) |
| GiantSteps through a laptop mic: drum and bass and breaks | 49% (92%) | 57% (70%) |
| Dubstep named half time | 0% | 0% (it says syncopated) |

With the HUD's hold (a new name shows after six readings in a row) the numbers move by a point or two. Raveform scores higher than GiantSteps because its tracks are whole songs with sections to score drops on, while GiantSteps excerpts are two-minute store previews scored throughout, breakdowns included.

Where it is weaker: through the laptop mic, drum and bass is called four on the floor 27% of the time (7% on a clean feed), so the majority name of a drum and bass track is right 70% of the time instead of 92%. In Raveform's breakdowns of four on the floor tracks, it says four on the floor 37% of the time against 18%; those readings have about one bass hit a beat, regularly spaced, so the kick is still playing there and the name is mostly right. On Ballroom (not EDM), the dances with a bass note on every beat (cha-cha, jive, quickstep, samba, tango) are now called four on the floor 53 to 61% of the time (5 to 15% before): the bass band cannot tell a kick from a walking bass. Waltzes stay unnamed (0 to 7%).

What did not help:

- **Looser thresholds for the old names** (`estimateTempo`'s `PatternOptions`, now overridable for this). Naming at an alignment of 0.5 to 0.65 instead of 0.75 lifts drum and bass from 50% to 71 to 78% on Raveform's held-out drops, but only by saying the catch-all "syncopated" more often: four on the floor moves from 52% to 55%, and in breakdowns "syncopated" goes from 47% to 67%. Fewer beats needed on the beat (0.6 or 0.7 instead of 0.8) trades drum and bass for four on the floor. The defaults are unchanged.
- **Half time, two-step, breakbeat or shuffle as names.** Dubstep and drum and bass look the same in every band at these settings (how often each band's hits repeat at a half, one, one and a half, two, three and four beats), so nothing tells half time from a two-step but the tempo (140 against 174). A small decision tree using the tempo separates them (dubstep half time 72% on GiantSteps), but that is guessing the genre from the BPM, not hearing the drums, so it is not used. No refined name is added.
- **The grid's bar positions** (`BeatGrid`): the share of the grid's beats with a kick on them, at any threshold, named four on the floor in at most 67% of Raveform drop readings against 86% for the repeats (at the same drum and bass rate). Measured against Raveform's own marked beats the kick is on 92% of beats but only 71% of the grid's, because the grid's phase is off often enough; the repeats need no phase.
- **The lo band as the kick** (for a laptop mic): it raises four on the floor but makes drum and bass look regular (6% to 30% of readings).
- **Requiring the kick to stand alone in the bass band** (an electronic kick has no hit in the other bands at the same moment; a band's bass note comes with the rest of the instrument: 25% of EDM kicks coincide with a lo, mid or hi hit, 50 to 73% of Ballroom's bass notes). It cut Ballroom's four on the floor to 6 to 31%, but it cost real four on the floor: Raveform drops 87% to 73% at the loosest setting tried, the laptop mic 56% to 26%.

### Wiring

`window.getRhythmPattern()` returns the new name (main.ts). The Beat HUD still reads `estimateTempo`'s: switching it is one line in `BeatHud.tsx` (`estimate?.pattern` to `source.getRhythmPattern?.() ?? null`), left for the HUD work going on in parallel. Cost: `BeatMonitor` keeps five short lists of onset times; `nameRhythm` walks them three times, every 500 ms.

## Next

- Show the band-based rhythm name in the Beat HUD (above).
- Beat phase: where the beats fall, not only how far apart. That and a downbeat give the bar and phrase grid the section tracker can use (see `song-sections.md`).
- Tempo through a real mic session, and on non-EDM music (untested).

## Verification

- `tempo-tracker.test.ts`: the right tempo at 30, 60 and 144 fps, dotted hats not taken for the beat, steady on a steady track, one clean switch on a real tempo change, held through a breakdown, nothing in silence, the same at a tenth of the level.
- `scripts/section-eval/bpm-eval.mts` and `bpm-score.py` against the GiantSteps labels.
- `rhythm-pattern.test.ts`: four on the floor with and without off-beat hats and with a stray bass note, a two-step and a broken kick syncopated, nothing without a tempo or hits, the same at 100 to 174 BPM. `beat.test.ts`: each band's onsets kept, 100 ms dead time, trimmed to 12 s.
- `scripts/section-eval/pattern-eval.mts`, `pattern-rename.mts`, `pattern-labels.py` and `pattern-score.py` against the genre proxies (Raveform, GiantSteps clean and laptop, Ballroom).
