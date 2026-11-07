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

The line under the BPM in the Beat HUD names the rhythm. It now shows four on the floor, breakbeat or two-step with a tempo range, only when confident (see "Confidence, tempo ranges, breakbeat and two-step" below). It used to show four on the floor, half time, double time, sixteenths, dembow or syncopated, from `estimateTempo` (`tempo.ts`) reading the app's beats, the merged bass and hi band onsets with the Ignore Time (250 ms) between them. That input cannot say much: a beat does not say whether it was the kick or a hat, and 250 ms of dead time drops every eighth note at dance tempos, so double time, sixteenths and dembow almost never fire.

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

### Confidence, tempo ranges, breakbeat and two-step

The names above were shown whenever the drums played, so "syncopated" fired in every four on the floor breakdown: on the held-out half, a shown "syncopated" was right 31% of the time on Raveform and 35% on GiantSteps. The Beat HUD now shows a name only when the model behind it is confident, holds it so it does not flicker, and adds the tempo range it is played at.

- **Model.** `readRhythm` (`rhythm-pattern.ts`) is a multinomial logistic regression (`rhythm-model.json`, fitted by `scripts/section-eval/rhythm-fit.py`) over 61 features of the last 12 s: per band, hits per beat and how often its hits repeat 1/4, 1/3, 1/2, 3/4, 1, 1.5, 2, 2.5, 3 and 4 beats later (40 ms tolerance), and where the hats fall after the kick. Classes four on the floor, breakbeat (drum and bass, breaks) and half time (dubstep). The BPM is not a feature, so the name says what the drums do, not what the tempo suggests. Half time is never shown; it is there so dubstep-like readings have somewhere to go.
- **Names and thresholds.** Four on the floor at confidence 0.7 (chosen on the tune half for at least 90% precision on every set), breakbeat at 0.85 (about 80% precision, chosen for coverage), two-step at 0.95 (a breakbeat read that surely is nearly always drum and bass, whose kick plays 1 and the "and" of 3).
- **Hold.** `RhythmLabeler` reads every 500 ms however often it is asked. A name shows after 4 confident readings in a row (2 s), and clears after 6 readings without it (3 s), so a fill or a dropped kick does not blank it.
- **Tempo ranges.** Four on the floor at 115 to 130 BPM is "house & techno tempo", at 137 to 150 "trance tempo"; breakbeat and two-step at 160 to 185 "drum & bass tempo". Nothing between ranges: at 130 to 137 techno, trance and mainstage overlap too much to say. The ranges come from the labelled tempos per genre in GiantSteps and Raveform (techno median 126, house 122 to 125, trance 132 to 139, psy trance 147, drum and bass 172 to 174). "House tempo" alone was tried first: the readings it labelled were house genres only 34 to 50% of the time, because techno sits at the same tempo.

Held-out half (Raveform folds 4 to 7, the odd md5 half of GiantSteps), as the Beat HUD shows it (the old line with its 6-reading hold). Precision: right among readings with a name. Coverage: share of readings of tracks with a genre proxy that show a name.

| | Before precision | Before coverage | After precision | After coverage |
| --- | --- | --- | --- | --- |
| Raveform | 80% | 92% | 99% | 75% |
| Raveform drops | 86% | 98% | 99.5% | 83% |
| GiantSteps clean | 59% | 78% | 93% | 38% |
| GiantSteps laptop mic | 56% | 86% | 93% | 36% |

Per name (Raveform / GiantSteps clean / laptop):

| Name | Before | After |
| --- | --- | --- |
| four on the floor | 99% / 91% / 79% | 100% / 95% / 94% |
| syncopated, now breakbeat | 31% / 35% / 34% | 86% / 78% / 84% |
| two-step (new) | | 97% / 96% / 98% |

Tempo ranges, share of readings whose track's genre the range is typical of (Raveform / GiantSteps clean / laptop): house & techno tempo 93% / 93% / 92%, trance tempo 88% / 83% / 77%, drum & bass tempo 93% / 76% / 76% (on GiantSteps most of the rest are breaks and dubstep tracks at drum and bass tempo).

Through the laptop mic, drum and bass was called four on the floor 27% of the time; now 3% (clean 6% to 2%, Raveform 3% to 2%). On Ballroom the old names named most dances (four on the floor 51 to 66% on cha-cha, jive, quickstep, samba and tango; "syncopated" 22 to 46%); now four on the floor shows 8 to 29% on those (samba 45%: its surdo plays every beat), breakbeat and two-step 0 to 8%, and waltzes stay blank.

The price is coverage: a GiantSteps excerpt (a two-minute store preview, breakdowns included) shows a name in 38% of readings instead of 78%. Dubstep is now mostly blank (10% named) instead of mostly wrong.

What did not make the bar, and why:

- **Half time.** Held-out precision about 30% (13 to 33% by set and threshold), with or without the BPM as a feature: dubstep's onsets look like breaks at the same 140 BPM. Dubstep's kick does not sit on 1 and 3 of the 140 beat either (repeats 2 beats later: 7% of kicks), it lands once a bar.
- **Shuffle or swing.** The share of hats late after the kick (two thirds of a beat against a half) does not separate Ballroom's swing dances from straight ones: jive 0.41, quickstep 0.33, samba (straight sixteenths) 0.55, waltz 0.48. No EDM set labels swing.
- **Triplet hats.** The hi band's onsets repeat a third of a beat later for about 2% of hits on every genre: hat rolls rarely make separate rising edges at that rate, so there is nothing to read.
- **Dembow ("reggaeton tempo").** No set has reggaeton, so it could not be measured, and the model has no class for it.
- **The BPM as a feature.** It lifts breakbeat coverage (drum and bass is the only common genre at 174) but then the name guesses the genre from the tempo; hardcore at 170 and breaks at 140 are the cases that would go wrong. Left out.
- **Two-step against breaks.** Two-step is right 96 to 98% of the time it shows, but only 13 held-out GiantSteps tracks are breaks, too few to show it never calls a breaks track two-step.

### Second pass: no tempo range on the label, longer hold, wobble bass, half time

- **Label.** The Beat HUD shows the name alone. `RhythmLabel.tempoRange` is still computed (now with "dubstep tempo" for half time at 130 to 150) for anything that wants it, but it is not shown: it matched the track's genre only 76 to 93% of the time.
- **More data.** The GiantSteps MTG key set (1,486 more two-minute Beatport previews, about 94 per genre, none shared with the tempo set) joined the fit and the scoring, clean and through the laptop mic, split by the same md5 half. It brings 94 dubstep, 94 breaks and 93 drum and bass tracks, which the tempo set had too few of (76, 26, 139).
- **Level features** (`rhythm-levels.ts`, from the monitor's last 5 s of band levels): for the bass, lo and mid bands, how much of the time the band sits near its peak (a wobble bass holds it, a kick spikes), its peak against its mean, and the envelope's autocorrelation at a sixteenth, a triplet, an eighth, a beat and two beats (the wobble rates). The main model reads them alongside the onset features. At the same thresholds they raised breakbeat precision from about 80% to 91% and four on the floor coverage by 4 to 7 points.
- **Half time.** A second, binary model (dubstep against every other genre with a proxy) only over readings at 130 to 150 BPM, where dubstep plays; outside that range half time is never named, and a confident four on the floor wins over it. The drums alone still cannot tell it from breaks there, so it is the least precise name: about 3 times in 5.
- **Hold and thresholds.** A sweep over thresholds and holds (`hold` in `RhythmLabeler`, scored for precision, coverage and how often the shown name changes) found a longer hold gives more coverage and fewer changes: a name now shows after 3 s and clears after 5 s. Four on the floor at 0.6, breakbeat 0.85, two-step 0.95, half time 0.8. Breakbeat and two-step need the kick or hats to hit at least 0.4 times a beat (below that a shown breakbeat was right 75% of the time), and nothing is named under 0.5 hits a beat over all bands (silence with the tempo still held).

Held-out halves, as the HUD shows them. MTG key is new, so it has no first-pass numbers.

| | First pass precision / coverage / changes per min | Second pass |
| --- | --- | --- |
| Raveform | 99.1% / 75% / 1.32 | 98.8% / 80% / 0.94 |
| Raveform drops | 99.5% / 83% / 0.78 | 99.5% / 86% / 0.39 |
| GiantSteps clean | 92.8% / 38% / 1.69 | 90.6% / 49% / 1.51 |
| GiantSteps laptop | 92.8% / 36% / 1.57 | 91.3% / 45% / 1.54 |
| MTG key clean | | 94.6% / 65% / 1.66 |
| MTG key laptop | | 94.6% / 60% / 1.70 |

Per name, precision (GiantSteps clean / laptop / MTG key clean / laptop / Raveform): four on the floor 96 / 96 / 98 / 97 / 100%, breakbeat 94 / 90 / 85 / 97 / 89%, two-step 100 / 100 / 97 / 98 / 99%, half time 53 / 56 / 61 / 66% (and wrong on Raveform's 0.5% of readings that get it: it has no dubstep).

Dubstep readings named half time: 20% and 17% on GiantSteps, 35% and 38% on MTG key; the rest mostly blank (53 to 75%), four on the floor 6 to 9%. The usual half time mistake is breaks (19 to 38% of GiantSteps breaks readings, 6 to 9% on MTG key), then trance breakdowns. Laptop-mic drum and bass called four on the floor: 2 to 3%. Ballroom: four on the floor 19 to 25% on cha-cha, jive, quickstep and tango, 56% on samba; half time 6 to 9% on samba and tango; waltzes blank.

What did not help: half time from the main model's own class, with or without the BPM as a feature (31 to 40% before the hold, against 52 to 74% for the gated model); a gradient-boosted model for half time (65 to 89% at 0.8 to 0.9 on MTG key but 60 to 70% on GiantSteps, and it is not shippable as a few numbers); a kick-count guard on four on the floor (the readings it would drop were still 97.5% right).

### Wiring

`window.getRhythmLabel()` (main.ts) returns the held label (`{ pattern, tempoRange, confidence, text }`) and the Beat HUD shows its `text`. `window.getRhythmPattern()` returns the unheld name. Both pass the monitor's last 5 s of samples for the level features. Cost: every 500 ms the labeler walks each band's onset list 10 times, resamples three bands' 5 s of levels onto a 20 ms grid with five autocorrelations each, and does an 82 by 3 and an 82 by 1 dot product.

## Next

- Half time: about 3 in 5 right; breaks at 140 are the confusion. A feature for the snare on beat 3 of the 140 bar (needs the grid's phase) is the next thing to try.
- Beat phase: where the beats fall, not only how far apart. That and a downbeat give the bar and phrase grid the section tracker can use (see `song-sections.md`).
- Tempo through a real mic session, and on non-EDM music (untested).

## Verification

- `tempo-tracker.test.ts`: the right tempo at 30, 60 and 144 fps, dotted hats not taken for the beat, steady on a steady track, one clean switch on a real tempo change, held through a breakdown, nothing in silence, the same at a tenth of the level.
- `scripts/section-eval/bpm-eval.mts` and `bpm-score.py` against the GiantSteps labels.
- `rhythm-pattern.test.ts`: four on the floor with and without the rest of the kit, with a stray bass note and at 124 to 174 BPM, a two-step read as breakbeat (and as two-step without eighth hats), nothing without a tempo or hits, the tempo ranges, and the labeler's 2 s hold, 3 s release and fixed step. `beat.test.ts`: each band's onsets kept, 100 ms dead time, trimmed to 12 s.
- `scripts/section-eval/pattern-eval.mts`, `pattern-rename.mts`, `pattern-labels.py` and `pattern-score.py` against the genre proxies (Raveform, GiantSteps clean and laptop, Ballroom); `rhythm-features.mts`, `rhythm-fit.py` and `rhythm-names.py` for the model, its precision and coverage and the tempo ranges.
