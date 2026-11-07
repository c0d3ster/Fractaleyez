# Song Sections

## Context

The Beat HUD names the rhythm pattern from the last 12 seconds of beats, far too short to say anything about song structure. This plan adds a long-memory layer that labels the current part of a song (intro, groove, buildup, turnaround, break, drop, outro, quiet) and notices when one song ends and the next begins. It is the signal Auto mode reads (`auto-mode.md`). Nothing here changes how the visuals look.

Code: `src/audioanalysis/section-features.ts` (features), `section-model.ts` and `section-model.json` (the trained model), `sections.ts` (`SectionTracker`: decoding and the song-level rules), fed by `AudioFeed` every frame, exposed as `window.getSongSection` / `getSectionHistory`, drawn by `SectionHud`. Training and evaluation: `scripts/section-eval/` (see its README).

## How it works

1. **Features** (every 250 ms, causal). The five onset-band levels the app already measures are pooled into 50 ms ticks (so the frame rate does not matter) and 250 ms slots. 85 numbers describe the last couple of minutes, every level in dB against the song's own top level (the 90th percentile of its 2 s means over the last 90 s), so a quiet mic and a loud feed read the same. Per band: level now and over 8 s, the step from a few seconds ago, 8 and 16 s trends, how much it pumps tick to tick (a kick, sidechain), how often it jumps (snare rolls), the lowest it went lately, and the last half second against the 2 s before (a drop often lands straight out of a short stop). Plus beat rate, song age, how long the bass has been out or in, brightness tilt, silence and quiet runs, and how different the band shape is from the song's usual shape.
2. **Model** (gradient-boosted trees, about a thousand tree walks per slot, well under a millisecond). Stage 1: how much the last stretch looks like a buildup or a break. Stage 2: whether a drop just landed, from the features plus a 4, 10 and 20 s memory of stage 1. Boundary: whether a new song just started.
3. **Decoder** (`sections.ts`, mirrored in `decode.py`, every threshold tuned on out-of-fold output). Stage 1 is smoothed (0.5 s), buildup is entered at 0.25 and break at 0.3, held for two slots, and left under 0.2 / 0.25. A drop fires at 0.25 (0.6 while a buildup or break is still showing, because the end of a build already looks like a drop is coming and an early one would hold off the real one), at most every 6 s. After a drop the section is **drop** (the full-energy part) until the next buildup or break, for 64 s at most.
4. **Turnaround.** While a buildup is showing, the whole mix falling 10 dB or more under the song's top level with the bass 15 dB under, for half a second, is a turnaround (the music cutting out). It lasts until the music is back (over -6 dB), a drop lands, or 6 s pass. It takes priority over the short-silence quiet, since a turnaround is often near silent. It does not change drop detection (see below).
5. **Song rules.** Nothing is labelled (quiet) until a regular beat is confirmed; that also gates the song clock. Intro is the start of a song until its first buildup or drop (60 s at most). Outro is a fade late in a song that has had a drop (10 dB under, falling, after 150 s; tuned against where songs actually end). A new song starts on the boundary model (0.9, never within 45 s of the last change) or after 6 s of silence; features, decoder and clock start over.

`SectionState` carries `section`, `intensity`, `buildupProgress`, `sinceMs`, `songIndex`, `songMs`, plus `dropCount` (a change in it is the drop event), `sinceDropMs` and `confidence`.

## Data and method

The **Socially Significant Music Events** dataset (Yadati et al., IEEE TMM 2018): 402 Creative Commons EDM tracks with drop times and build and break intervals marked by experts (339 tracks carry labels: 435 drops, 595 builds, 371 breaks). Every number below is **out of fold**: 5 folds by track (id mod 5), and each track is scored by models that never saw it, through the real TypeScript tracker (`run.mts --fold-models`). Listening through a microphone is simulated (`levels.py --mic`): *room* (good speakers, reverb, -48 dB noise floor) and *laptop* (laptop speakers into the laptop mic: almost no bass under 200 Hz, more reverb, -40 dB noise). The model is trained on all three conditions together.

Scoring (`score.py`): a drop counts when it fires within 1 s before to 3 s after a labelled drop; buildup and break are compared slot by slot; "buildup before drop" is the share of labelled drops with buildup shown at some point in the 10 s before; a false reset is a song change inside a single song. Song changes are scored on playlists of 5 songs back to back (gap 0 or 2 s) or crossfaded (6 s): found within -5 s to +25 s of the real change, and invented changes per hour.

## Results

The rule-based tracker this replaces (tuned by eye on 11 songs) against the current one, same tracks, same scoring:

| | Old, clean | New, clean | New, room | New, laptop | Old, laptop |
| --- | --- | --- | --- | --- | --- |
| Drop F1 (precision / recall) | 0.20 (0.15 / 0.28) | 0.39 (0.43 / 0.36) | 0.41 | 0.35 | 0.06 |
| Drops fired per real drop | 1.88 | 0.85 | 0.83 | 0.73 | 1.80 |
| Buildup F1 | 0.09 | 0.44 | 0.43 | 0.39 | 0.09 |
| Break F1 | 0.28 | 0.52 | 0.53 | 0.53 | 0.16 |
| Buildup shown before a drop | 22% | 84% | 83% | 81% | 22% |
| False song resets per song | 0.41 | 0.06 | 0.03 | 0.03 | 0.39 |
| Median drop latency | 1.0 s | 1.0 s | 1.0 s | 0.75 s | 1.1 s |

Song changes (clean feed; laptop is within a few points):

| Join | Old found / invented per hour | New found / invented per hour |
| --- | --- | --- |
| Back to back | 80% / 3.9 | 78% / 0.7 |
| 2 s gap | 82% / 6.7 | 98% / 0.5 |
| 6 s crossfade | 63% / 6.4 | 38% / 0.3 |

The crossfade row is a real regression: the old tracker reset often enough (about every 10 minutes) that some resets landed on blends. The new one almost never invents a change, so the song clock is trustworthy, but it misses most crossfaded transitions.

## Turnaround

Measured live, out of fold, on the clean feed: 167 turnarounds over 339 songs (about one every other song), 23% of them followed by a labelled drop (within 3 s of the music coming back), with a median of 1.9 s between the turnaround starting and the drop; 9% of all drops get one first. On the laptop mic there are fewer (54) and more of them lead to a drop (33%). The other three quarters are stops inside a build that then carries on, or builds that turn into a break.

Looking back over whole songs, a stop after a buildup that comes back up lands on a drop about 6 times in 10. Live that cannot be known yet: of the live turnarounds where the music came back within a second, 47% were followed by a drop; of those where it did not, 4%. Whether it comes back is decided at the moment the drop would land, so it gives no warning. Variants tried (only during a buildup, deeper or longer stops, a lower drop threshold during and just after a turnaround, a higher one after other stops): the stricter ones raise precision to about 27% but warn before only 2% of drops, and the threshold changes cost up to 0.01 drop F1. So the turnaround is a moment for the visuals to react to (the music cut out), not a promise of a drop.

## Beat grid and Raveform (overnight stage 2)

Three things were tried on top of the model above, each scored out of fold the same way (SSME's 339 tracks, folds by id mod 5, the real TypeScript tracker with fold models; Raveform's tracks in their own folds, taken mod 5 so they pool with SSME's). None of them is shipped: the rule was to ship only a model that beats the current one on SSME without losing on the laptop mic, and none did.

First the current model was rebuilt from scratch (levels, features, `train.py`, the shipped decoder). It reproduces the table above within noise: drop F1 0.407 / 0.412 / 0.394 (clean / room / laptop), buildup 0.435 / 0.426 / 0.392, break 0.523 / 0.524 / 0.522. Laptop drop F1 comes out 0.04 higher than the 0.35 above; the mic simulation's random seeds differ from the first run, and 435 drops leave about that much noise.

**1. The grid as features.** `SectionFeatures` takes the `BeatGrid` state every frame (fed the same levels, in the order `AudioFeed` would feed it) and adds 11 columns: grid locked, beat in bar, bar in phrase, beats into the phrase and to the next 8-bar line, the beat's phase, both confidences, and within 1, 2 or 4 beats of the line. With the clean feed alone the grid helps (drop F1 0.367 to 0.394, Python decoder), as `exp_grid.py` found before. But the shipped model is trained on clean, room and laptop together, and that model is already at 0.397 without the grid. On top of it the grid columns make drops worse:

| TS tracker, out of fold | Current (clean / room / laptop) | With grid columns |
| --- | --- | --- |
| Drop F1 | 0.407 / 0.412 / 0.394 | 0.393 / 0.390 / 0.366 |
| Buildup F1 | 0.435 / 0.426 / 0.392 | 0.432 / 0.425 / 0.397 |
| Break F1 | 0.523 / 0.524 / 0.522 | 0.526 / 0.525 / 0.522 |

The grid is right about the 8-bar line only part of the time (stage 1: 8-bar F 0.37 on Raveform's held-out folds), and on the laptop mic, with the bass gone, less often; the trees learn line positions that do not hold on other songs.

**2. A decoder prior: drops land on phrase lines.** The drop threshold moves by one amount within 1, 2 or 4 beats of the grid's 8-bar line and by another elsewhere, when the phrase confidence is high enough (`SectionTuning.phraseLine*`, `decode.py --line`, off by default). Tuned on SSME folds 0 to 2 over 36 settings: none beat no prior. Only 40% of SSME's labelled drops fall within 2 beats of the grid's line, 3.8 times chance but not most of them, so raising the threshold off the line loses more real drops than false ones (at +0.1: precision 0.43 to 0.46, recall 0.35 to 0.33, F1 0.388 to 0.383).

**3. Raveform's 1,370 tracks in training.** Its labels mapped to ours (`raveform-sections.py`): buildup to build, breakdown and cooldown to break, the start of a drop that follows something other than a drop to a drop event (3,409 drops, 1,328 builds, 4,281 breaks). Raveform's band levels exist only for the clean feed (they were made from its audio on another machine), so it adds no mic copies. Out of fold, Python decoder:

| | SSME mean F1 | SSME drop F1 (clean / laptop) | SSME buildup F1 | Raveform mean F1 (drop F1) |
| --- | --- | --- | --- | --- |
| SSME only (current) | 0.463 | 0.397 / 0.386 | 0.427 | 0.254 (0.328), TS tracker |
| With Raveform, weight 0.5 | 0.410 | 0.399 / 0.339 | 0.319 | 0.624 (0.679), TS tracker |
| Raveform in the drop stage only | 0.455 | 0.399 / 0.327 | 0.427 | 0.383 (0.666) |
| Raveform at weight 0.1 | 0.449 | 0.389 / 0.368 | 0.403 | 0.506 (0.527) |

The two sets label differently. Raveform calls most of the rise before a drop a breakdown and marks a drop at every return to full energy after one; SSME's experts mark a build and a drop only where the music builds to a moment. A model trained on both does far better on Raveform's labels (mean F1 0.25 to 0.62) and worse on SSME's, mostly in buildups (0.43 to 0.32) and drop precision (0.44 to 0.36). Which labels the visuals should follow is a design question, not a measurement: SSME's are closer to what Auto mode wants (a buildup shown before 84% of drops; trained with Raveform, 66%).

## Section model loop (overnight stage 6)

An automated loop (`docs/experiments/section-loop.md`) tuned the decoder, the training settings and the features against a frozen
evaluation: SSME tracks with id mod 5 of 0 to 3 in 4-fold cross-validation (TypeScript tracker, clean and laptop averaged), with Raveform
folds 0 to 5 as a check that a change is not only fitting SSME. SSME tracks with id mod 5 == 4 and Raveform folds 6 and 7 were held out to
the end. Kept: the decoder change above (drop 0.3 to 0.25, drop while a buildup or break shows 0.5 to 0.6, buildup entered at 0.25 instead
of 0.3). The model itself is unchanged.

| Held out, mean F1 (drop / buildup / break) | Before | After |
| --- | --- | --- |
| SSME clean, 62 tracks | 0.433 (0.398 / 0.413 / 0.488) | 0.436 (0.385 / 0.426 / 0.498) |
| SSME laptop | 0.421 (0.310 / 0.423 / 0.532) | 0.433 (0.340 / 0.438 / 0.520) |
| Buildup shown before a drop (clean / laptop) | 75% / 78% | 79% / 84% |
| Raveform folds 6 and 7, 343 tracks | 0.262 (drop 0.372) | 0.273 (drop 0.397) |

Not kept: a wider drop label window in training (up to 2.25 s after the drop: +0.014 on SSME, but Raveform's drop precision fell from 0.72
to 0.64), the same with a stricter threshold, more trees in stage 1 or 2, a longer stage 1 memory, and leaving the room copies out of
training (+0.0075 on SSME, -0.012 on Raveform). Single decoder knobs (smoothing, enter slots, break thresholds) moved the score by 0.0025 at
most: the decoder is close to its best for this model.

## What was tried and did not help

- **More model capacity** (deeper trees, more of them) and class balancing: no gain out of fold. Stage 1 is limited by information, not fit.
- **Spectral features** from the app's 512-point FFT (14-band shape, spectral novelty over 1 and 4 s, `spectrum.py`): break +0.004, drop -0.03 F1. Not used, so the audio pipeline is unchanged.
- **Lagged copies of the features** (2 and 4 s back): +0.002. Not used.
- **Waiting before calling a drop** (`exp_delay.py`): a detector trained on "a drop landed 1, 1.5, 2 or 3 s ago", with the features at the drop moment next to the current ones, scored 0.35, 0.32, 0.30 and 0.29 drop F1 against 0.39 for the one that answers at once. Two seconds after it fires, real drops and false alarms look the same (bass still full in 79% against 69%, same level and beat rate): most false alarms are the music really coming back to full (the end of a fill, the next phrase) where the labels have no drop. What tells them apart is where it falls in the song's phrasing, not what follows, which points at a bar and phrase grid.
- **Looser drop threshold after a buildup**: worse (see the decoder note above; the opposite helps).

## Cost

Measured on 95 minutes of songs at 60 fps (`scripts/section-eval/bench-cpu.mts`, on the tempo branch; Node 22, the same V8 as Chrome):

- 1.8 ms of CPU per second of audio, 0.18% of each frame's 16.7 ms. The rule-based tracker it replaces cost 1.5 ms; neither was microseconds.
- The work lands on the frame that closes a 250 ms slot: about 1.1 ms there (p99). Of that, the features take about 320 µs (mostly sorting each band's last 90 s for its 90th percentile) and all 630 trees of the model about 50 µs. Frames over 2 ms: about 11 an hour (the old tracker 8), over 8 ms about one; the onset detector, which does almost nothing, shows the same rare spikes, so those are garbage collection and JIT pauses rather than the tracker's own work.
- Memory: a fixed 1.4 MB for the last 40 minutes of 50 ms ticks (the session export), in typed arrays. Kept as one object per tick it was 14.7 MB after 45 minutes.
- The model is a 285 KB JSON in the bundle (about 100 KB gzipped), parsed in 2.5 ms at startup.

If the slot frame ever matters on a slow machine, the percentile sort is the place to start (keep a running histogram, or recompute the peaks once a second).

## Limits

- The labels are subjective at the edges (when a build starts), and some builds and drops are marked by feel with no change in the band levels at all; about 16% of labelled drops have no clear level step. That caps slot-level agreement.
- A drop is detected by reacting to it, about a second late. Auto mode should prefer the buildup (shown before 84% of drops) to get ready, and treat a single drop event as a cue that is right about 4 times in 10.
- Outro and a late break look alike while they happen; outro is shown only on a deep, falling fade after 150 s.
- Crossfades and DJ mixes: most song changes in a blend are missed (sections still work across them).
- Trained on EDM. Other genres are untested.
- The mic conditions are simulations. Real sessions can be checked with `exportSectionLog()` (50 ms ticks, replayed exactly by `replay-log.mts`).

## More labels

Learning curve (`exp_curve.py`, out of fold, each fold trained on a share of the other folds' songs):

| Training songs | Drop F1 | Buildup F1 | Break F1 | Mean |
| --- | --- | --- | --- | --- |
| about 68 | 0.31 | 0.39 | 0.53 | 0.41 |
| about 136 | 0.36 | 0.42 | 0.55 | 0.44 |
| about 203 | 0.36 | 0.43 | 0.57 | 0.45 |
| about 271 (all) | 0.41 | 0.45 | 0.58 | 0.48 |

Still rising, about 0.03 of mean F1 per doubling: twice the songs would be worth roughly 0.51. Worth collecting, especially sessions through a real mic, but more labels alone will not take it far past 50%.

## Next

1. Done and not shipped: the beat grid as features and as a drop prior, and Raveform's tracks in training (above). The grid would need to find the 8-bar line far more reliably (and on a laptop mic) before it can help; Raveform's labels would need mapping closer to SSME's (its breakdowns split into break and build by the level trend, say) before they can be pooled.
2. Label a handful of real mic sessions (export, mark sections) and score them, to confirm the simulations.
3. Crossfade boundaries: a detector trained on more blended playlists, or a tempo-change cue.
4. Auto mode (`auto-mode.md`).
5. Optional: load `section-model.json` lazily (about 100 KB gzipped) to keep it off the first paint.

## Verification

- `pnpm test`: `sections.test.ts` pins what must hold for any model (quiet and no clock without a regular beat, the clock, a new song after a long silence but not on a short stop, the same labels at a tenth of the level, a replayed recording giving the same states, bounded memory and speed) and the tree inference.
- The out-of-fold evaluation above, reproducible with `scripts/section-eval/`.
