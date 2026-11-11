# Drum hits and risers: status and handoff

Branch `feat/drum-hits` (off `main`). Work in progress: the code, models and tools are in place and the test suite is green, but three
tests are marked `it.fails` for known model gaps. The riser meter shows the higher of two detectors: the pure riser model on the band
levels (B below) and a sweep detector on the spectrum, which sees risers the band levels hide under the hats. Neither has been scored
against real riser labels yet (there are none). Read this before picking it up.

## What it is

- `src/audioanalysis/drum-hits.ts`: every rising edge in any of the five onset bands (trackers with a 70 ms reference window, so a 1/16
  roll re-triggers, and a level gate of 0.1 of the band's loudness where the beat detector has 0.25) is a candidate. 33 ms after its first
  edge, a small network (`drum-hit-model.json`: 36 inputs, 32 tanh units, one sigmoid per drum) says which of kick, hat, snare and clap it
  is. The inputs are the band levels at that moment and each band's peak since the first edge. It can be several at once (a clap on 2 and 4 lands with the kick). Per-drum
  thresholds were chosen on held-out folds. `getHits()`, `getRollHits()` (snare and clap, for a roll reader), `getLastHits()`.
- `src/audioanalysis/riser.ts`: 100 ms slots of band power and 32 s of history. `riserFeatures` computes every input in
  `RISER_FEATURE_NAMES` (52): the trend over 2, 4 and 8 s (band slopes, centroid slope, highs against lows, line fit of the highs, highs
  against their peak), inputs that hold when the lows drop out (Theil-Sen slopes of the highs and the mid band, the share of rising steps,
  the highs above their low), and 32 s of context from one-second means (16 and 32 s slopes of bass, mid, highs and the mix, each against
  its peak, seconds the bass has been 6 dB under its peak). The model (`riser-model.json`: it names the inputs it reads, now the 31 that
  do not read the bass or the whole mix, with 16 units) is smoothed with a 400 ms follower. `getScore()` is 0 to 1.
- `src/audioanalysis/sweep.ts`: the sweep detector. It reads the analyser's spectrum pooled into the training recorder's 40 log bands
  (40 Hz to 16 kHz, `spectrum-reducer.ts` and `tick-extras.ts`, the same files as on `feat/listen-recording`) in 50 ms ticks, so recorded
  sessions replay exactly. Half-second means over 8 s, each band less its own mean over that time (the hats and the pads' steady shape drop
  out), then per 2, 4 and 8 s window: where the standing-out energy sits and its line (bands a second, R squared), how much each half second
  looks like the last one moved up a band or two rather than down, four regions' climb (300 Hz to 16 kHz) and the share of bands rising;
  plus the ridge and how far it stands out now and each region against its peak (30 inputs). `sweep-model.json`: 16 tanh units, smoothed
  like the riser. `window.getSweep`.
- Frequency HUD (`src/components/huds/FrequencyHud.tsx`): a light for each drum under the bars, at the frequency its hits sit at
  (`DRUM_CENTER_HZ` in `drum-hits.ts`, on a log scale inside each band's column), and a riser meter under them that fills left to right
  with the higher of the riser and the sweep score. Fed through `window.getDrumHits`, `window.getRiser` and `window.getSweep` (`src/main.ts`), so the pop-out config window shows them too.
- `onset-detector.ts` now exports `BandTracker` (with a configurable `ReferenceWindow`), `ReferenceWindow` and `thresholdDbFor`.

Why: a rise in a band is not an instrument. The lo-or-mid rise this replaces fired 150 times a minute on a kick alone, 230 on hats and 200
on bass plucks on test clips, and about 250 times a minute on real EDM.

## Tools (`scripts/section-eval/`)

- `drum-gen.py <samples> <out>`: labelled clips from one-shot samples, with all four drums' true hit times on the beat grid, over synthetic
  melodic beds (bass, pads, stabs, a sung line), through clean, room and laptop mics (levels.py). The hats are one hi-hat (each strike chokes
  the last), and some clips are closed hats with an open one on the off-beats; about one drum clip in seven has one drum alone. Riser clips
  (noise sweep, pitch riser, whoosh, 2 to 8 bars) and plain look-alikes (fade-in, steady noise, downlifter, and with `--breakdown-clips` a
  synthetic breakdown: the kick and bass cut, pads come in). Every sample is in one of five folds and a clip draws all its samples from one
  fold. Breakdown clips come after the others, so a `--seed 1` run with them makes the same `d*` clips as one without.
- `drum-eval.mts <dir> <out.json> [--truth] [--features | --riser-features] [--shard k/n]`: replays clips or real songs through the app's
  own `DrumHits` and `RiserDetector`, writing calls, the riser score per slot and, with the flags, the model inputs.
- `drum-train.py <eval.json,...> [--save] [--parity]`: 5-fold CV by sample fold, per-drum thresholds (best F0.5), then a fit on everything.
  A hat within 30 ms of a snare or a clap is left out of training and scoring (their own hi and air burst hides it).
- `riser-train.py <eval.json,...> [--features ...] [--real-negatives eval.json,...] [--buildups] [--intros] [--save] [--parity]`: the same
  for the riser. `--features` picks inputs by name or preset (`base`, `short`, `all`, `highs`). `--real-negatives` adds the middle of drops
  and the first 60% of breakdowns from real songs (Raveform sections) as not risers, `--intros` the intros too, `--negative-weight` weights
  them; `--buildups` adds the last half of buildups as weak positives (`--buildup-weight`). `--real-folds` and `--real-every` hold songs out
  and thin the slots; `--cv quick` scores one synthetic fold only. See its header.
- `riser-score.py <model.json> <eval.json,...> [--folds 5]`: scores a model on real songs by Raveform section (share of time shown, mean
  score, buildups shown at some point, and the AUC of the last half of buildups against breakdowns and against drops).
- `raveform-riser-split.py <segments.json> <raveform-levels> <out>`: the 300 train tracks (folds 0 to 5) and 200 test tracks (folds 6
  and 7) with their truth lines.
- `analyser.py`: emulates the app's AnalyserNode (512-point FFT, Blackman, smoothing 0.2, bytes over -100 to -30 dB, 60 fps) pooled into
  the recorder's 40 bands and 50 ms ticks (`<id>.spec`). `drum-gen.py --spectrum` writes the same for every clip.
- `sweep-eval.mts <dir> <out.json> [--truth] [--features] [--shard k/n]`: `.spec` files through `SweepDetector`.
- `sweep-train.py <clips eval.json,...> --real <ssme eval.json,...> --gt gt.json [--negative-weight 3] [--save] [--parity] [--scores]`:
  synthetic risers as positives; SSME's drops (4 to 30 s in) and the first 60% of its breaks as negatives (builds left out: nobody marked
  where in them a riser plays). Five fits holding out a synthetic sample fold and an SSME fold together, so every clip and song is scored
  out of fold, by SSME section.
- `riser-section-features.py`: appends riser and sweep scores to section features, to test them in `train.py` (they did not help, see
  `docs/implementation-plans/song-sections.md`).
- `mlp.py`: the shared one-hidden-layer network (now with per-row weights). `riserlib.py`: reading and running a riser model, the follower.
- `drum-real-score.py`: proxies on real music, from Raveform's beats (no drum labels): in the drops of four-on-the-floor tracks, the share of
  kick calls on a beat and of beats with a kick, the same for snare and clap on 2 and 4, and hat calls on the eighth grid and off-beats
  with a hat.

Sample sources (free): `github.com/tidalcycles/Dirt-Samples` (sn, sd, 808sd, cp, realclaps, bd, 808bd, clubkick; its `hh` folder is a whole
kit, so only its hats) and `github.com/oramics/sampled` (DM/*, DRUMS/*). Folders: `kick/`, `hat/` (closed, pedal and open hats only),
`snare/`, `clap/`, `cymbal/` (crashes and rides, played as none of the four). `drum-samples.py` does the sorting (with these two it
gives the counts below exactly) and can add `github.com/geikha/tidal-drum-machines` (about 75 drum machines, no licence stated: train and
score with it, do not ship it): kick 566, hat 321, snare 679, clap 93, cymbal 255. It names each file by its drum machine, and
`drum-gen.py` puts a machine's samples in one fold, so held-out folds are machines never heard.

## Data on this machine

`C:\Users\codyd\Documents\audio-datasets\drum-hits\` (not in the repo, 729 MB):

- `samples/`: kick 66, hat 75, snare 113, clap 33, cymbal 89.
- `clips/`: 3,150 clips from `drum-gen.py --seed 1` (2,400 drum, 500 riser, 250 plain) with `truth.jsonl`. Made before drum-gen.py choked
  its hats and played drums alone: the installed drum model was trained on clips from the current drum-gen.py, so make them again before
  retraining it (the riser clips are the same either way).
- `features/dge-0..7.json`: `drum-eval.mts --features` on those clips (8 shards). `features/train-eval-0..5.json`: `--riser-features` on 300
  Raveform tracks used as real riser negatives.
- `raveform/train-f32`, `train-truth.jsonl`: those 300 tracks. `raveform/test-f32`, `test-truth.jsonl`: 200 other Raveform tracks, held out,
  with their sections in the truth lines. `raveform/eval-*.json`: the first riser model on them; `test-eval-v2-*.json`: the current one.
- Added on 2026-11-11 for the low-kick retrain: `samples-v2/` (two collections renamed by kit plus tidal: kick 566, hat 321, snare 679,
  clap 93), `src-v2/` (the tidal clone), `clips-v2/` (`--seed 1`, 3,150 clips with retuned kicks and sub-bass beds), `features-v2/`
  (`dge-0..7`, `real-train/test-0..3`, `real-all-0..7`), `raveform-all-f32/` (all 1,370 tracks with a `truth.jsonl`), `kick-v2/`
  (scratch tools and results).
- `riser-v2/`: SSME spectra (`ssme-spec/`, decoded from `audio-datasets/ssme/full.zip`), the riser and sweep replays behind the meter
  calibration, and its tools in `tools/`. The decoded mp3s were deleted (re-extract them from `full.zip`).
- Copies on the Drive: `audio-analysis:datasets/drum-hits/` (rclone).

Raveform band levels come from `C:\Users\codyd\Documents\raveform-levels-bundle.zip` (`raveform-levels/<key>.f16`, float16, frames x 5,
60 fps) with sections in `raveform/structures/segments.json`.

Rebuilding the riser data in a cloud session (about 30 minutes, 1.4 GB): the samples sorted from the two repos (kick 91, hat 75, snare
123, clap 33, cymbal 78; the counts differ a little from the ones above), `drum-gen.py <samples> <clips> --seed 1 --breakdown-clips 400`
(3,550 clips), the levels zip from `docs/overnight/data-source.txt` and Raveform's `segments.json`, then `raveform-riser-split.py` and
`drum-eval.mts --riser-features --shard k/4` on the clips, `train-f32` and `test-f32`. These test tracks are not the ones on this machine,
and the installed model before this one may have trained on some of them.

Retrain the riser (about 20 minutes on 4 cores, under 3 GB with `--real-every 2`), from `scripts/section-eval`, with `$C`, `$TR` the
feature shards of the clips and the 300 train tracks:

```sh
python -E -P riser-train.py $C --features highs --real-negatives $TR --real-every 2 \
  --save ../../src/audioanalysis/riser-model.json --parity parity.json
python -E -P riser-score.py ../../src/audioanalysis/riser-model.json $TE
```

Retrain the drums (about 25 min with 6 workers; each fit is memory-bound at about 0.4 s a step, and more workers slow every fit, 18
made each step about 1.7 s), from `scripts/section-eval`, with `$C` the `features-v2/dge-*` shards:

```sh
python -E -P drum-train.py $C --later ignore --real <features-v2/real-train shards> --real-every 6 --real-weight 2 \
  --segments <segments.json> --beats <beats dir> --test <features-v2/real-test shards> --workers 6 \
  --save ../../src/audioanalysis/drum-hit-model.json --parity parity.json
```

Then raise the kick threshold in the model to 0.875 by hand (the trainer picks 0.85, where one bass-and-pad onset of the melodic test
clip reads as a kick), and score it on real music with `drum-real-score.py` on all 1,370 tracks before installing it.

The model now reads 36 inputs, so replay the clips with `drum-eval.mts --features` first (`drum-train.py` stops if the eval files have
the old 26). Then copy three parity rows into `PARITY` in `drum-hits.test.ts` (riser: into `parity` in `riser.fixture.json`). The riser trainer needs a
lot of memory with the real negatives (about 100 minutes, and twice it was stopped for low memory with other jobs running).

## Results so far (tentative)

Drums, held out by sample fold (by file name: before `drum-gen.py` folded by drum machine, so these folds share machines), on 3,150 clips from `drum-gen.py --seed 1` (made again in a cloud session from the same
sample sources). "Before" is the first model's setup (26 inputs, level gate 0.25) trained and scored on the same clips; hats are scored
without the ones a snare or a clap hides (see `drum-train.py`), for both.

| drum  | before: caught | false a minute | threshold | now: caught | false a minute | threshold | notes |
|-------|----------------|----------------|-----------|-------------|----------------|-----------|-------|
| kick  | 69.2%          | 6.3            | 0.85      | 71.0%       | 6.4            | 0.85      | 81% clean, 79% room, 36% laptop (no bass under 200 Hz) |
| hat   | 34.0%          | 4.7            | 0.825     | 44.1%       | 4.7            | 0.80      | 49% clean, 44% room, 36% laptop |
| snare | 67.7%          | 7.6            | 0.775     | 68.2%       | 7.0            | 0.80      | |
| clap  | 60.0%          | 3.8            | 0.875     | 63.1%       | 4.4            | 0.875     | |

Counting every hat as the first table did (hats under a snare or a clap as hits too), the first setup on these clips is 42.5% at 16.6 false
a minute (the first clips gave 42% at 21.2), and the new inputs alone 45.3% at 16.2: most of those false calls were hat calls on claps and
snares. What moved the hats:

- The level gate. A tracker's edge has to reach a quarter of the band's loudness over the last 20 s, so a hat 12 dB under the snare that set
  the air band's loudness was never a candidate, however clearly it rose. With 0.1, the hats that rise 3 dB or more in hi or air (60 fps
  band levels) nearly all make a candidate (576 of about 12,700 missed solo hats). The other 45% of solo hats do not rise 3 dB at all (the
  beds, reverb or the last hit's tail hide them), so hat recall stays well under 100% on these clips.
- Each band's peak since the first edge (10 inputs): a little better on every drum by itself (on the first clips: hat 42.1% at 20.4 to
  42.3% at 18.3, snare false calls 7.8 to 6.6, clap 5.4 to 4.1).
- Leaving the hidden hats out: on eighth or sixteenth hats every clap has a hat, so the model learnt that a clap may be a hat (0.87 on the
  test kit's kick and clap); now 0.53.
- What did not help: choking the hats (an open hat on sixteenths rings over the next strikes) and a shorter reference window for the hi and
  air bands each moved candidates for solo hats by only 1 to 8 points. Choking stays because a real hi-hat does it.

On 200 held-out real Raveform tracks (folds 6 and 7; median calls a minute):

| drum | model | intro | buildup | drop | breakdown | outro |
|------|-------|-------|---------|------|-----------|-------|
| kick | first | 113 | 83 | 61 | 4 | 100 |
| kick | now | 112 | 96 | 79 | 8 | 104 |
| hat | first | 134 | 157 | 169 | 102 | 163 |
| hat | now | 123 | 126 | 137 | 50 | 141 |
| snare + clap (sum of medians) | first | 15 | 39 | 59 | 52 | 16 |
| snare + clap (sum of medians) | now | 16 | 39 | 53 | 51 | 19 |

The first model on these tracks is close to the numbers measured on the user's machine (kick 114, 97, 67 and 4; snare plus clap about 54 in
drops; hats 104 to 169), though they are not the same 200 tracks. Kicks in drops come closer to a four on the floor (128 a minute at 128 BPM).
Fewer hats is not all good: see below, the model misses more real off-beat hats.

### More samples, and real music (folds by drum machine)

Clips from the first two collections only (A) and from all three (B), 3,150 each, `drum-gen.py --seed 1` with folds by drum machine. Both
models are scored on the same held-out B clips (fold f, after training on folds other than f and 3: the first two collections have no hats
or snares in fold 3, so A's fold-3 clips borrow other folds' samples). Held out by machine is much harder than the table above, whose folds
put the same machine on both sides.

| drum  | A: caught | false a minute | threshold | B: caught | false a minute | threshold |
|-------|-----------|----------------|-----------|-----------|----------------|-----------|
| kick  | 60.1%     | 6.0            | 0.85      | 64.4%     | 6.0            | 0.85      |
| hat   | 40.8%     | 5.6            | 0.875     | 42.0%     | 4.8            | 0.825     |
| snare | 53.9%     | 9.5            | 0.75      | 57.4%     | 8.6            | 0.80      |
| clap  | 46.9%     | 7.1            | 0.925     | 53.1%     | 6.9            | 0.85      |

On all 1,370 Raveform tracks (`drum-real-score.py`; the drops of about 1,000 four-on-the-floor tracks):

| proxy | first model | installed (this table's first) | A | B |
|-------|-------------|--------------------------------|---|---|
| kick calls on a beat | 91.3% | 83.8% | 91.8% | 81.5% |
| beats with a kick | 48.1% | 54.1% | 54.1% | 56.1% |
| snare/clap calls on 2 or 4 | 27.4% | 33.6% | 30.1% | 31.0% |
| 2 and 4 with a snare/clap | 28.1% | 32.1% | 32.3% | 36.9% |
| hat calls on the eighth grid | 71.5% | 61.3% | 65.9% | 61.2% |
| off-beats with a hat | 82.3% | 60.7% | 44.2% | 51.5% |

More samples help on synthetic machines it never heard (every drum, at the same or fewer false calls) and with snare, clap and hat recall on
real music, but kicks land off the beat more. Every retrained model misses far more real off-beat hats than the first one: real off-beats
nearly all make a candidate (96%), but the hat reads lower there (a quarter under 0.72, against 0.82 with the first model) and its
threshold went up from 0.675 to 0.8 or more. The synthetic beds do not look like a real drop, where the off-beat hat sits on a bass note.

Riser, on 200 held-out Raveform tracks (folds 6 and 7, never trained on). Shown is the smoothed score over 0.5; the AUC is how well the
score ranks the last half of buildups above breakdowns (0.5 is chance, under 0.5 is backwards):

| model | synthetic: risers shown | real: shown in buildups | in breakdowns | in drops | in intros | buildups shown at some point | AUC buildup vs breakdown |
|-------|-------------------------|-------------------------|---------------|----------|-----------|------------------------------|--------------------------|
| synthetic only (first model, this machine's tracks) | 99.6% | 10.1% | 35.7% | 8.2% | | 84.8% | |
| + real negatives (previous) | 99.8% | 3.9% | 12.0% | 1.1% | 3.0% | 42.9% | 0.253 |
| **B: pure riser (installed)** (highs-only inputs, breakdown look-alikes, real negatives) | 100% | 2.1% | 4.0% | 0.5% | 3.1% | 29.1% | 0.482 |
| A: buildup detector, no intro negatives | 99.8% | 33.9% | 9.4% | 8.4% | 48.0% | 91.1% | 0.840 |
| A: buildup detector | 99.8% | 18.8% | 8.8% | 4.4% | 17.7% | 84.2% | 0.816 |

Mean score, B (installed): buildups 0.078, breakdowns 0.094, drops 0.041; A: 0.377, 0.206, 0.292; previous: 0.093, 0.186, 0.054.
Synthetic false readings, B: 5.4 s a minute overall, 8.5 on the synthetic breakdowns, 29.6 on fade-ins (A: 5.5, 8.1, 24.6).
A was installed first, then swapped for B: the meter is meant to say a riser is playing, not that a buildup is under way, and the
section model already reads buildups better (A's inputs are a subset of what it sees).

What was learned:

- Real buildup endings barely look like the synthetic risers in these band levels: the 8 s slope of the highs has a median of 0.07 dB a
  second there against 2.8 in the synthetic risers, and no single 8 s input separates the last half of buildups from early breakdowns
  better than AUC 0.63. Breakdowns fired the old model through the centroid (median 1.3 against 0.43 in buildups).
- B (the pure riser) does what it says: breakdowns fall from 12% to 4% and it is no longer backwards, but it is shown in 2% of buildups.
  Synthetic breakdowns alone (without real negatives) were not enough (breakdowns 12.5%, buildups 6.0% on validation).
- A needs the 32 s context: with only the 8 s inputs its AUC was 0.71 on validation, with them 0.85. Without the lows (highs-only inputs
  plus real buildups) it was 0.69. Weighting real negatives 2x halved the false readings in drops; intros (left out of training at first)
  were shown half the time, and adding them as negatives cut that to 18% at the cost of buildup time (34% to 19%).
- Settings were chosen on Raveform fold 5 of the train tracks (50 songs, trained on folds 0 to 4), then the two finals trained on all 300
  and scored once on the test tracks. Validation rows (fold 5, same columns as above but buildups / breakdowns / drops / intros / AUC):
  8 s inputs + buildups 33.7 / 19.0 / 18.6 / 41.7 / 0.706; all inputs 45.5 / 11.3 / 20.6 / 54.6 / 0.849; buildup weight 1 67.3 / 21.6 /
  46.0 / 69.0 / 0.866; negatives 2x 30.1 / 5.9 / 9.6 / 48.8 / 0.849; negatives 4x 25.1 / 3.3 / 5.6 / 45.5 / 0.852; 32 hidden units no
  better; negatives 2x + intros 14.7 / 5.2 / 4.4 / 15.1 / 0.823 (installed); negatives 1x + intros 28.9 / 9.9 / 13.3 / 28.5 / 0.824.

Sweep and riser on SSME (339 songs with expert build, break and drop marks, a different set from Raveform, which marks most of the
rise before a drop as a breakdown). Sweep scores are out of fold; the riser models never saw SSME. Clean feed:

| detector | synthetic: risers shown | SSME: shown in builds | in breaks | in drops | builds shown at some point | AUC build vs break |
|----------|-------------------------|-----------------------|-----------|----------|----------------------------|--------------------|
| previous riser (real negatives) | 99.8% | 17.2% | 13.0% | 2.0% | 77.4% | 0.595 |
| riser B | 100% | 8.0% | 2.7% | 0.7% | 57.2% | 0.705 |
| riser A (buildup detector) | 99.8% | 15.8% | 4.9% | 3.4% | 77.1% | 0.762 |
| sweep, negatives 1x | 99.8% | 23.8% | 12.1% | 4.6% | 90.7% | 0.702 |
| **sweep, negatives 3x (installed)** | 99.8% | 19.1% | 9.5% | 3.0% | 85.5% | 0.699 |
| **meter: higher of B and sweep** | | 21.5% | 10.5% | 3.5% | 88.4% | 0.695 |

The sweep was never shown a real build (they are left out of its training), so its readings in builds come from what it learned on
synthetic risers. It sees two to three times as much build time as B, at the same ranking of builds over breaks (AUC 0.70), so it is more
sensitive but not more selective: whether its extra readings in breaks are risers (breaks often end in one) or false needs real riser
labels. Laptop mic: builds 17.5%, breaks 9.3%, drops 2.6%. Synthetic false readings 4.8 s a minute (fade-ins 26, steady noise 19).

### Low kicks (2026-11-11)

The user saw the bass bar miss lower kicks on real music. Two separate causes:

- **The bass bar's flash (the beat path)**, on 57,637 drop beats of 172 four-on-the-floor test tracks at default settings: it flashed on
  53.4% of drop kicks. 19.6% never rise 3 dB in bass (90.8% rise 1.5 dB); on 15.6% the hi edge came first (median 33 ms) and the bass edge
  fell inside the 250 ms ignore time; on 10.2% an off-beat hat 83 to 183 ms earlier blocked it (above 120 BPM an eighth is under 250 ms).
  Sub-heavy tracks flash 46.0% against 55 to 58%. With hi off it flashes 75.7%. The 40 Hz highpass is not it (about +2 dB at 40 to 45 Hz,
  -6 dB at 30 Hz). Not changed: see Work remaining.
- **The kick light (the classifier)** caught 60.7% of real drop kicks though 98% made a candidate: training called a hit's later
  candidate (the one carrying the bass) not a kick, and over a sidechained sub it called about 11 false kicks a minute. Retrained with
  kicks retuned by up to 5 semitones, sub-bass and rolling-bass beds, later candidates ignored, and real Raveform kicks as labels.

| `drum-real-score.py`, all 1,370 Raveform tracks | before | after |
|---|---|---|
| kick calls on a beat | 84.2% | 95.0% |
| beats with a kick | 54.1% | 70.2% |
| snare/clap on 2 or 4 | 33.6% | 33.9% |
| 2 and 4 with a snare/clap | 32.1% | 38.7% |
| hat on the eighth grid | 61.4% | 59.4% |
| off-beats with a hat | 60.6% | 61.6% |

On the 1,070 tracks never trained on: 95.1% and 70.3% (the first model: 91.3% and 48.1%). On the 200 test tracks, drop beats with a kick
call went from 60.7% at 8.2 false a minute to 77.4% at 4.3 (at 0.85). Synthetic, held out by drum machine (the "before" model had trained
on some of these samples): kick 61.7% at 6.2 false a minute before, 62.0% at 7.4 after at 0.85, 57.2% at 0.875; low kicks at 0.85: under
45 Hz 56.8% to 59.1%, over a sub bass 27.3% to 36.8%. At 0.85 the real-music numbers are 94.4% and 73.7%.

### Riser meter (2026-11-11)

The meter (`src/components/huds/riserLevel.ts`) is five signal bars: on once the score holds 0.45 for 250 ms, bars at 0.45, 0.60, 0.75,
0.88 and 0.96, climbing one at a time and never down, off at once under 0.35 or 0.4 under its peak. Measured on synthetic risers alone
and 1 to 4 s after a louder sample, held-out Raveform tracks and SSME by section:

- Risers after something louder read as flat (the vs-peak inputs look back 8 to 32 s): 75% shown at a median 4.75 s. A gap rule in
  `riser.ts` and `sweep.ts` (25 dB under the 8 s peak for 5 slots, then the history reads as the gap) shows 99.6% at 1.1 s; clearing the
  history instead showed 91% at 2.6 s. It calls 12 to 20 gaps an hour on real music.
- Both followers rise over 400 ms and fall over 150 ms: the score is under 0.4 a median 0.26 s after a riser stops (0.47 s before).
- Risers alone: 99.8% shown, 99.5% within a bar. On the meter outside buildups: 1.9% of Raveform time, 7.4% of SSME (mostly the sweep;
  SSME's drops were sweep training negatives, so that is flattering). False shows median 1.2 s and peak near 0.67; risers peak near 0.98.
  About one riser in five blinks off once partway through with the 0.4 margin.

| ON (SHOW 250 ms) | solo, time to show | after a louder sample | SSME on outside builds | SSME shows / 10 min | Raveform on outside buildups |
|---|---|---|---|---|---|
| 0.40 | 0.65 s | 1.05 s | 8.5% | 28 | 2.2% |
| 0.45 | 0.69 s | 1.14 s | 7.4% | 24 | 1.9% |
| 0.50 | 0.74 s | 1.23 s | 6.5% | 21 | 1.6% |
| 0.60 | 0.84 s | 1.39 s | 5.0% | 15 | 1.1% |

The sweep cannot run on Raveform (band levels only), so its numbers come from SSME spectra and synthetic clips.

## Work remaining

0. The bass bar's flash missed about half of real drop kicks (Low kicks, above). Done: it now also flashes with a beat another band set
   off when bass has its own onset within 60 ms of it (`src/components/huds/beatFlashes.ts`, 69.0% of drop kicks; flashing on every bass
   onset would have been 80.4% with 16.1 off-beat bass flashes a minute). Still open: the 250 ms lockout behind off-beat hats above
   120 BPM changes the beats themselves, not only the flash.

1. Riser labels on real music. Nothing so far can say how many real risers either detector misses or whether the sweep's readings in
   breaks are right. Mark riser spans on recorded sessions (a hotkey in the labelling tool) and score both with `sweep-train.py` and
   `riser-score.py` against them; then retrain the sweep with real positives. The recorder's ticks carry the 40-band spectrum the sweep
   reads, so labelled sessions train it directly. Known weak spots: fade-ins of the whole mix and steady noise read as rising. Ideas: the drum rates as inputs (a snare
   roll speeding up is the clearest buildup cue and the band levels hide it), a threshold or calibration per use (the HUD could fill the
   meter from 0.3), more real tracks, or both models side by side (B for the HUD's riser meter, A for the section model). The pure riser
   (B) is reproducible with `--features highs --real-negatives $TR`. The `it.fails` riser test now rises through the riser (0.998) but
   single raw slots of the plain clip still read over 0.5.
2. Hats: 44% caught at 4.7 false a minute (hats a snare or a clap hides not counted), but worse than the first model on real off-beat hats
   (above). Thresholds chosen on real music (Raveform folds, with `drum-real-score.py`'s proxies) or real music in training would go at
   that. Most synthetic misses never rise in the band levels at all, so more recall needs something finer than five bands at 60 fps. A lower threshold trades the other way (on the first setup: 0.75
   gave 37% at 11 a minute, 0.85 gave 24% at 3, counting every hat).
3. A snare alone with a strong body still misses (`it.fails` "snare alone"): with solo clips and the peak inputs the kick reading fell from
   0.74 to 0.81 to 0.6, but the snare reads 0.55 and 0.7 against its 0.8. Next: features on the 2 to 6 kHz crack, or a lower snare
   threshold when no kick is heard.
4. Done: the kit test passes at 60 and 240 fps with the low-kick model. Hats lost 2 points on the eighth grid with it; re-check the hat
   threshold on real music (0.8 did not recover it).
5. The light positions (`DRUM_CENTER_HZ`) are unchanged. Measured from each band's peak since the first edge, on candidates with one drum
   near, the hats still move between 1.9 and 3.4 kHz across mics and folds, and the beds pull every drum (kick 130 to 160 Hz, 300 on a
   laptop mic), so it is no more stable than before.
6. Check it live in the app (nothing here has been looked at in the browser yet).
7. After this merges: bring the roll reader onto these hits on `feat/auto-mode-mvp` (see branch `wip/auto-mode-drum-roll`, commit c9b6784:
   `RollReader` reading `getRollHits()`, a 4.5 beat window with a half-note cutoff, `roll-onsets.ts` removed), and offer the drum rates and
   the riser score to the section model as features (all of it can be computed offline from saved band levels with `drum-eval.mts`).
