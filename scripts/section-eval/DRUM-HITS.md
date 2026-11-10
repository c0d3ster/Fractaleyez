# Drum hits and risers: status and handoff

Branch `feat/drum-hits` (off `main`). Work in progress: the code, models and tools are in place and the test suite is green, but four
tests are marked `it.fails` for known model gaps, and the riser model is not good enough yet on real music. Read this before picking it up.

## What it is

- `src/audioanalysis/drum-hits.ts`: every rising edge in any of the five onset bands (trackers with a 70 ms reference window, so a 1/16
  roll re-triggers) is a candidate. 33 ms after its first edge, a small network (`drum-hit-model.json`: 26 inputs, 32 tanh units, one sigmoid
  per drum) says which of kick, hat, snare and clap it is. It can be several at once (a clap on 2 and 4 lands with the kick). Per-drum
  thresholds were chosen on held-out folds. `getHits()`, `getRollHits()` (snare and clap, for a roll reader), `getLastHits()`.
- `src/audioanalysis/riser.ts`: 100 ms slots of band power and 8 s of history. The trend over 2, 4 and 8 s (band slopes, centroid slope,
  highs against lows, line fit of the highs, highs against their peak) goes into a small network (`riser-model.json`: 28 inputs, 16 units),
  smoothed with a 400 ms follower. `getScore()` is 0 to 1.
- Frequency HUD (`src/components/huds/FrequencyHud.tsx`): a light for each drum under the bars, at the frequency its hits sit at
  (`DRUM_CENTER_HZ` in `drum-hits.ts`, on a log scale inside each band's column), and a riser meter under them that fills left to right.
  Fed through `window.getDrumHits` and `window.getRiser` (`src/main.ts`), so the pop-out config window shows them too.
- `onset-detector.ts` now exports `BandTracker` (with a configurable `ReferenceWindow`), `ReferenceWindow` and `thresholdDbFor`.

Why: a rise in a band is not an instrument. The lo-or-mid rise this replaces fired 150 times a minute on a kick alone, 230 on hats and 200
on bass plucks on test clips, and about 250 times a minute on real EDM.

## Tools (`scripts/section-eval/`)

- `drum-gen.py <samples> <out>`: labelled clips from one-shot samples, with all four drums' true hit times on the beat grid, over synthetic
  melodic beds (bass, pads, stabs, a sung line), through clean, room and laptop mics (levels.py). Riser clips (noise sweep, pitch riser,
  whoosh, 2 to 8 bars) and plain look-alikes (fade-in, steady noise, downlifter). Every sample is in one of five folds and a clip draws all
  its samples from one fold.
- `drum-eval.mts <dir> <out.json> [--truth] [--features | --riser-features] [--shard k/n]`: replays clips or real songs through the app's
  own `DrumHits` and `RiserDetector`, writing calls, the riser score per slot and, with the flags, the model inputs.
- `drum-train.py <eval.json,...> [--save] [--parity]`: 5-fold CV by sample fold, per-drum thresholds (best F0.5), then a fit on everything.
- `riser-train.py <eval.json,...> [--real-negatives eval.json,...] [--save] [--parity]`: the same for the riser. `--real-negatives` adds the
  middle of drops and the first 60% of breakdowns from real songs (Raveform sections) as not risers.
- `mlp.py`: the shared one-hidden-layer network.

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

Riser:

| model | synthetic: risers shown | real: shown in buildups | in breakdowns | in drops | buildups shown at some point |
|-------|-------------------------|-------------------------|---------------|----------|------------------------------|
| synthetic only | 99.6% | 10.1% of the time | 35.7% | 8.2% | 84.8% |
| + real negatives (installed) | 99.8% | 2.5% | 10.5% | 1.2% | 42.6% |

The first model read breakdowns as rising: the kick and bass drop out, so the highs suddenly stand out and the centroid moves up, which is
what the synthetic risers taught it. The real negatives cut the false readings a lot, but it now rarely fires in real buildups either, and
breakdowns still score higher than buildups (mean 0.17 against 0.08).

## Work remaining

1. Riser on real music (the main gap). Ideas: real positives (the last half of Raveform buildups as weak positives, with the drops and early
   breakdowns as negatives), which makes it a buildup detector more than a riser detector, which may be what the section model wants
   anyway; features that do not move when the lows drop out (the highs' own slope in absolute dB, not against the lows); a synthetic
   breakdown look-alike (kit and bass cut, pads go on). Score with the held-out 200 tracks by section (the table above).
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
