# Drum hits and risers: status and handoff

Branch `feat/drum-hits` (off `main`). Work in progress: the code, models and tools are in place and the test suite is green, but four
tests are marked `it.fails` for known model gaps. The riser meter now runs the pure riser model (B below): it no longer reads breakdowns
as rising, but the five band levels hide most real risers, so a spectrum sweep detector is next. Read this before picking it up.

## What it is

- `src/audioanalysis/drum-hits.ts`: every rising edge in any of the five onset bands (trackers with a 70 ms reference window, so a 1/16
  roll re-triggers) is a candidate. 33 ms after its first edge, a small network (`drum-hit-model.json`: 26 inputs, 32 tanh units, one sigmoid
  per drum) says which of kick, hat, snare and clap it is. It can be several at once (a clap on 2 and 4 lands with the kick). Per-drum
  thresholds were chosen on held-out folds. `getHits()`, `getRollHits()` (snare and clap, for a roll reader), `getLastHits()`.
- `src/audioanalysis/riser.ts`: 100 ms slots of band power and 32 s of history. `riserFeatures` computes every input in
  `RISER_FEATURE_NAMES` (52): the trend over 2, 4 and 8 s (band slopes, centroid slope, highs against lows, line fit of the highs, highs
  against their peak), inputs that hold when the lows drop out (Theil-Sen slopes of the highs and the mid band, the share of rising steps,
  the highs above their low), and 32 s of context from one-second means (16 and 32 s slopes of bass, mid, highs and the mix, each against
  its peak, seconds the bass has been 6 dB under its peak). The model (`riser-model.json`: it names the inputs it reads, now the 31 that
  do not read the bass or the whole mix, with 16 units) is smoothed with a 400 ms follower. `getScore()` is 0 to 1.
- Frequency HUD (`src/components/huds/FrequencyHud.tsx`): a light for each drum under the bars, at the frequency its hits sit at
  (`DRUM_CENTER_HZ` in `drum-hits.ts`, on a log scale inside each band's column), and a riser meter under them that fills left to right.
  Fed through `window.getDrumHits` and `window.getRiser` (`src/main.ts`), so the pop-out config window shows them too.
- `onset-detector.ts` now exports `BandTracker` (with a configurable `ReferenceWindow`), `ReferenceWindow` and `thresholdDbFor`.

Why: a rise in a band is not an instrument. The lo-or-mid rise this replaces fired 150 times a minute on a kick alone, 230 on hats and 200
on bass plucks on test clips, and about 250 times a minute on real EDM.

## Tools (`scripts/section-eval/`)

- `drum-gen.py <samples> <out>`: labelled clips from one-shot samples, with all four drums' true hit times on the beat grid, over synthetic
  melodic beds (bass, pads, stabs, a sung line), through clean, room and laptop mics (levels.py). Riser clips (noise sweep, pitch riser,
  whoosh, 2 to 8 bars) and plain look-alikes (fade-in, steady noise, downlifter, and with `--breakdown-clips` a synthetic breakdown: the
  kick and bass cut, pads come in). Every sample is in one of five folds and a clip draws all its samples from one fold. Breakdown clips
  come after the others, so a `--seed 1` run with them makes the same `d*` clips as one without.
- `drum-eval.mts <dir> <out.json> [--truth] [--features | --riser-features] [--shard k/n]`: replays clips or real songs through the app's
  own `DrumHits` and `RiserDetector`, writing calls, the riser score per slot and, with the flags, the model inputs.
- `drum-train.py <eval.json,...> [--save] [--parity]`: 5-fold CV by sample fold, per-drum thresholds (best F0.5), then a fit on everything.
- `riser-train.py <eval.json,...> [--features ...] [--real-negatives eval.json,...] [--buildups] [--intros] [--save] [--parity]`: the same
  for the riser. `--features` picks inputs by name or preset (`base`, `short`, `all`, `highs`). `--real-negatives` adds the middle of drops
  and the first 60% of breakdowns from real songs (Raveform sections) as not risers, `--intros` the intros too, `--negative-weight` weights
  them; `--buildups` adds the last half of buildups as weak positives (`--buildup-weight`). `--real-folds` and `--real-every` hold songs out
  and thin the slots; `--cv quick` scores one synthetic fold only. See its header.
- `riser-score.py <model.json> <eval.json,...> [--folds 5]`: scores a model on real songs by Raveform section (share of time shown, mean
  score, buildups shown at some point, and the AUC of the last half of buildups against breakdowns and against drops).
- `raveform-riser-split.py <segments.json> <raveform-levels> <out>`: the 300 train tracks (folds 0 to 5) and 200 test tracks (folds 6
  and 7) with their truth lines.
- `mlp.py`: the shared one-hidden-layer network (now with per-row weights). `riserlib.py`: reading and running a riser model, the follower.

Sample sources (free): `github.com/tidalcycles/Dirt-Samples` (sn, sd, 808sd, cp, realclaps, bd, 808bd, clubkick; its `hh` folder is a whole
kit, so only its hats) and `github.com/oramics/sampled` (DM/*, DRUMS/*). Folders: `kick/`, `hat/` (closed, pedal and open hats only),
`snare/`, `clap/`, `cymbal/` (crashes and rides, played as none of the four).

## Data on this machine

`C:\Users\codyd\Documents\audio-datasets\drum-hits\` (not in the repo, 729 MB):

- `samples/`: kick 66, hat 75, snare 113, clap 33, cymbal 89.
- `clips/`: 3,150 clips from `drum-gen.py --seed 1` (2,400 drum, 500 riser, 250 plain) with `truth.jsonl`.
- `features/dge-0..7.json`: `drum-eval.mts --features` on those clips (8 shards). `features/train-eval-0..5.json`: `--riser-features` on 300
  Raveform tracks used as real riser negatives.
- `raveform/train-f32`, `train-truth.jsonl`: those 300 tracks. `raveform/test-f32`, `test-truth.jsonl`: 200 other Raveform tracks, held out,
  with their sections in the truth lines. `raveform/eval-*.json`: the first riser model on them; `test-eval-v2-*.json`: the current one.

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

Retrain the drums (about 20 min with the CPU free), from `scripts/section-eval`:

```sh
D=C:/Users/codyd/Documents/audio-datasets/drum-hits
python -E -P drum-train.py "$(echo $D/features/dge-{0..7}.json | tr ' ' ,)" --save ../../src/audioanalysis/drum-hit-model.json --parity parity.json
```

Then copy three parity rows into `PARITY` in `drum-hits.test.ts` (riser: into `parity` in `riser.fixture.json`). The riser trainer needs a
lot of memory with the real negatives (about 100 minutes, and twice it was stopped for low memory with other jobs running).

## Results so far (tentative)

Drums, held out by sample fold (`drum-train.py` on the clips above):

| drum  | caught | false calls a minute | threshold | notes |
|-------|--------|----------------------|-----------|-------|
| kick  | 69%    | 6.4                  | 0.85      | 80% clean, 76% room, 35% laptop (no bass under 200 Hz) |
| hat   | 42%    | 21.2                 | 0.675     | the weak one |
| snare | 66%    | 8.1                  | 0.775     | |
| clap  | 60%    | 5.6                  | 0.85      | |

On 200 held-out real Raveform tracks (median calls a minute): kick 114 in intros, 97 in buildups, 67 in drops and 4 in breakdowns (the kick
does drop out where it should); snare plus clap about 54 a minute in drops (about a backbeat); hats 104 to 169.

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

## Work remaining

1. Riser on real music. Both directions were tried (Results). The meter's job is to say a riser is playing, so it runs B; A was a weaker
   copy of the section model's buildup reading. There are no riser labels on real music yet, so B's 2% of buildup time cannot say how many
   risers it misses, and the five band levels hide a sweep under the hats. Ideas: the drum rates as inputs (a snare
   roll speeding up is the clearest buildup cue and the band levels hide it), a threshold or calibration per use (the HUD could fill the
   meter from 0.3), more real tracks, or both models side by side (B for the HUD's riser meter, A for the section model). The pure riser
   (B) is reproducible with `--features highs --real-negatives $TR`. The `it.fails` riser test now rises through the riser (0.998) but
   single raw slots of the plain clip still read over 0.5.
2. Hats: 42% caught at 21 false a minute. Maybe a later read for the air band (its burst decays fast), more hat variety, or a hat threshold
   that trades recall for fewer false calls.
3. A snare alone with a strong body reads as half kick (`drum-hits.test.ts`, the `it.fails` "snare alone"). More solo-snare clips, or
   features on the 2 to 6 kHz crack.
4. A hat called on the kick-and-clap hit (`it.fails` "kit").
5. The light positions (`DRUM_CENTER_HZ`) are fixed values: measuring them from added power 33 ms after a hit was unstable for the hats.
6. Check it live in the app (nothing here has been looked at in the browser yet).
7. After this merges: bring the roll reader onto these hits on `feat/auto-mode-mvp` (see branch `wip/auto-mode-drum-roll`, commit c9b6784:
   `RollReader` reading `getRollHits()`, a 4.5 beat window with a half-note cutoff, `roll-onsets.ts` removed), and offer the drum rates and
   the riser score to the section model as features (all of it can be computed offline from saved band levels with `drum-eval.mts`).
