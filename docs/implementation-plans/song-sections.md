# Song Sections

## Context

The Beat HUD names the rhythm pattern from the last 12 seconds of beats, far too short to say anything about song structure. This plan adds a long-memory layer that labels the current part of a song (intro, groove, buildup, turnaround, break, drop, outro, quiet) and notices when one song ends and the next begins. It is the signal Auto mode reads (`auto-mode.md`). Nothing here changes how the visuals look.

Code: `src/audioanalysis/section-features.ts` (features), `section-model.ts` and `section-model.json` (the trained model), `sections.ts` (`SectionTracker`: decoding and the song-level rules), fed by `AudioFeed` every frame, exposed as `window.getSongSection` / `getSectionHistory`, drawn by `SectionHud`. Training and evaluation: `scripts/section-eval/` (see its README).

## How it works

1. **Features** (every 250 ms, causal). The five onset-band levels the app already measures are pooled into 50 ms ticks (so the frame rate does not matter) and 250 ms slots. 85 numbers describe the last couple of minutes, every level in dB against the song's own top level (the 90th percentile of its 2 s means over the last 90 s), so a quiet mic and a loud feed read the same. Per band: level now and over 8 s, the step from a few seconds ago, 8 and 16 s trends, how much it pumps tick to tick (a kick, sidechain), how often it jumps (snare rolls), the lowest it went lately, and the last half second against the 2 s before (a drop often lands straight out of a short stop). Plus beat rate, song age, how long the bass has been out or in, brightness tilt, silence and quiet runs, and how different the band shape is from the song's usual shape.
2. **Model** (gradient-boosted trees, about a thousand tree walks per slot, well under a millisecond). Stage 1: how much the last stretch looks like a buildup or a break. Stage 2: whether a drop just landed, from the features plus a 4, 10 and 20 s memory of stage 1. Boundary: whether a new song just started.
3. **Decoder** (`sections.ts`, mirrored in `decode.py`, every threshold tuned on out-of-fold output). Stage 1 is smoothed (0.5 s), buildup and break are entered at 0.3 held for two slots and left under 0.2 / 0.25. A drop fires at 0.3 (0.5 while a buildup or break is still showing, because the end of a build already looks like a drop is coming and an early one would hold off the real one), at most every 6 s. After a drop the section is **drop** (the full-energy part) until the next buildup or break, for 64 s at most.
4. **Turnaround.** While a buildup is showing, the whole mix falling 10 dB or more under the song's top level with the bass 15 dB under, for half a second, is a turnaround (the music cutting out). It lasts until the music is back (over -6 dB), a drop lands, or 6 s pass. It takes priority over the short-silence quiet, since a turnaround is often near silent. It does not change drop detection (see below).
5. **Song rules.** Nothing is labelled (quiet) until a regular beat is confirmed; that also gates the song clock. Intro is the start of a song until its first buildup or drop (60 s at most). Outro is a fade late in a song that has had a drop (10 dB under, falling, after 150 s; tuned against where songs actually end). A new song starts on the boundary model (0.9, or 0.7 while an outro shows and for 20 s after it), on a change of tempo (below), or after 6 s of silence, never within 45 s of the last change; features, decoder and clock start over.
6. **Tempo change** (`tempo-change.ts`). The BPM the tempo tracker shows (`TempoTracker`, `tempo.md`) is passed in with every frame. Once a song is 45 s old its tempo is the one shown (following small drifts); the shown BPM moving more than 5% away from it, not to within 3% of 2:1, 1:2, 3:2, 2:3, 4:3 or 3:4 (the same beat read at another level), and staying there for 4 s, is a new song. The BPM is recorded with each tick, so an exported session replays the same way.

`SectionState` carries `section`, `intensity`, `buildupProgress`, `sinceMs`, `songIndex`, `songMs`, plus `dropCount` (a change in it is the drop event), `sinceDropMs` and `confidence`.

## Data and method

The **Socially Significant Music Events** dataset (Yadati et al., IEEE TMM 2018): 402 Creative Commons EDM tracks with drop times and build and break intervals marked by experts (339 tracks carry labels: 435 drops, 595 builds, 371 breaks). Every number below is **out of fold**: 5 folds by track (id mod 5), and each track is scored by models that never saw it, through the real TypeScript tracker (`run.mts --fold-models`). Listening through a microphone is simulated (`levels.py --mic`): *room* (good speakers, reverb, -48 dB noise floor) and *laptop* (laptop speakers into the laptop mic: almost no bass under 200 Hz, more reverb, -40 dB noise). The model is trained on all three conditions together. The decoder thresholds (`decode.py --grid`) were tuned on this same out-of-fold output, so they saw the labels of every scored track and the F1 values below are slightly optimistic (probably by little, with 339 tracks); the old tracker was tuned on 11 songs, so the comparison is not fully symmetric.

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

## Song changes when the tempo changes

A song crossfaded into one of a clearly different tempo, or a click to another song mid-track, used to go unnoticed: the boundary model hears gaps, fades and band shape, not tempo, and was trained only on gaps and short crossfades. One session ran its song clock for 10 minutes.

**Playlists with known tempos** (`make-playlists.py`): 5 songs each, one kind of join per playlist, the next song picked so the tempo difference falls in a bin chosen at random (under 3%, 3 to 8%, over 8%; "harmonic" is a difference over 8% within 3% of 2:1, 3:2 or 4:3 and their inverses). Joins: back to back (0 to 5 s gap), crossfade (4 to 10 s), cut (the song cut off at a random point at least 60 s in, the next one starting at its own start with no gap) and cut into the middle (the next one also starting 20 to 50% in). Two sets: SSME songs (480 joins, tempo: what the tracker usually shows for that song, as they carry no tempo labels) and GiantSteps two-minute excerpts (640 joins, labelled tempos, never used for any tuning; they start and end mid-track, so they have no intros or outros). Settings were tuned on SSME folds 0 and 1 (`tune_tempo_change.py` for a quick grid, then the real tracker) and are reported on folds 2 to 4. A change counts when it lands from 5 s before to 25 s after the next song starts; with 60 s, late resets count too (still far better than none).

| | SSME before | SSME after | GiantSteps before | GiantSteps after |
| --- | --- | --- | --- | --- |
| Changes found (within 25 s) | 41% | 60% | 14% | 36% |
| Changes found (within 60 s) | 41% | 69% | 14% | 49% |
| Back to back | 94% | 96% | 51% | 56% |
| Crossfade | 51% | 69% | 2% | 28% |
| Cut | 17% | 36% | 1% | 33% |
| Cut into the middle | 3% | 38% | 1% | 27% |
| Tempo under 3% apart | 47% | 50% | 12% | 10% |
| 3 to 8% apart | 42% | 64% | 15% | 45% |
| Over 8% apart | 40% | 67% | 12% | 55% |
| Harmonic | 30% | 44% | 16% | 26% |
| Invented per hour (within 25 s / 60 s) | 0.37 / 0.37 | 2.4 / 1.2 | 0.64 / 0.46 | 4.9 / 1.1 |
| False resets per single song | 0.043 | 0.063 | 0.011 | 0.026 |
| Median delay of a found change | 0.7 s | 4.1 s | 0.2 s | 18.8 s |

Single songs: SSME folds 2 to 4 (253 songs) and all 664 GiantSteps excerpts. Through the laptop mic (`levels.py --mic laptop`, SSME folds 2 and 3: 192 joins, 179 songs) it holds: changes found 35% to 53% (36% to 61% within 60 s), cuts 10% to 31%, cuts into the middle 0% to 29%, false resets per song 0.006 to 0.017. Drop, buildup and break F1 on single songs are unchanged (0.601, 0.558, 0.629 before; 0.602, 0.558, 0.627 after). The SSME columns are with the tempo tracker and section model as retuned on main by the BPM and bar-grid loops; the GiantSteps and laptop figures, and the tuning comparisons below, were measured just before those landed (SSME then: 56% found, 0.067 false resets). Most of the "invented" changes within 25 s are real changes found late: the tempo tracker takes a median of about 20 s to show a new song's tempo even after a clean gap (its 12 s window and 8 s running score still hold the old song, then a new peak has to win for 2 s), so a tempo change is called about 20 to 30 s after the join.

What each part adds (SSME, folds 2 to 4, within 25 s / false resets per song): the outro threshold alone 48% / 0.075 at 0.5 (0.7 chosen, with the tempo cue it costs less), the tempo cue alone (5%, 4 s) 54% / 0.059, both 56% / 0.067. The false resets the tempo cue still makes are mostly the tracker settling on 5:4 or 4:5 of the beat for a while (a swing reading); counting those as the same beat too would lose real changes like 128 to 100.

Tried and left out:

- **The outro ending with the music coming back up as a new song**: 0.17 false resets per song (from 0.03). A false outro is usually a bridge into the next drop.
- **The tempo of each reading alone**, before the tracker's running score (faster to move): it found a few more changes but wobbles inside songs (0.18 false resets per song at a 4 s hold); held long enough to be steady, it is no better than the shown BPM.
- **Retraining the boundary model with cuts in its playlists** (`dump-playlists.mts --cuts 0.5`, scored on the same held-out cut playlists with `train_boundary.py --test`): cuts 23% to 29%, but crossfades 38% to 23%. Not shipped.
- **A separate cue for a sharp cut** (band shape and tempo changing together): the tempo shows up about 20 s after the band shape changes, so the two are not together in time; the tempo cue and the outro threshold already take cuts from 17% to 35%.

Songs of about the same tempo (under 3% apart) are no better found than before: in a DJ blend of matched tempos only the boundary model and the outro can hear the change, and the boundary model misses most blends.

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

## What was tried and did not help

- **More model capacity** (deeper trees, more of them) and class balancing: no gain out of fold. Stage 1 is limited by information, not fit.
- **Riser and sweep scores** as features (`riser-section-features.py`, branch `feat/drum-hits-riser`): the band-level riser detectors
  (pure riser B, buildup detector A, from `scripts/section-eval/DRUM-HITS.md`) and the spectrum sweep detector, each as its smoothed score, its
  4 s mean and its 10 s max, rebuilt from scratch on SSME (clean, room, laptop), out of fold, decoder re-tuned. Mean F1 0.459 to 0.464 with B,
  0.456 with A, 0.467 with both (drop 0.384 to 0.400, build 0.425 to 0.429); the sweep, clean and laptop only, 0.456 to 0.460. All within
  the noise of 435 drops, so the model is unchanged. The model already reads what a riser does to the band levels.
- **Spectral features** from the app's 512-point FFT (14-band shape, spectral novelty over 1 and 4 s, `spectrum.py`): break +0.004, drop -0.03 F1. Not used, so the audio pipeline is unchanged.
- **Lagged copies of the features** (2 and 4 s back): +0.002. Not used.
- **Waiting before calling a drop** (`exp_delay.py`): a detector trained on "a drop landed 1, 1.5, 2 or 3 s ago", with the features at the drop moment next to the current ones, scored 0.35, 0.32, 0.30 and 0.29 drop F1 against 0.39 for the one that answers at once. Two seconds after it fires, real drops and false alarms look the same (bass still full in 79% against 69%, same level and beat rate): most false alarms are the music really coming back to full (the end of a fill, the next phrase) where the labels have no drop. What tells them apart is where it falls in the song's phrasing, not what follows, which points at a bar and phrase grid.
- **Looser drop threshold after a buildup**: worse (see the decoder note above; the opposite helps).

## Cost

Measured on 95 minutes of songs at 60 fps (`scripts/section-eval/bench-cpu.mts`, on the tempo branch; Node 22, the same V8 as Chrome):

- 1.8 ms of CPU per second of audio, 0.18% of each frame's 16.7 ms. The rule-based tracker it replaces cost 1.5 ms; neither was microseconds.
- The work lands on the frame that closes a 250 ms slot: about 1.1 ms there (p99). Of that, the features take about 320 µs (mostly sorting each band's last 90 s for its 90th percentile) and all 630 trees of the model about 50 µs. Frames over 2 ms: about 11 an hour (the old tracker 8), over 8 ms about one; the onset detector, which does almost nothing, shows the same rare spikes, so those are garbage collection and JIT pauses rather than the tracker's own work.
- Memory: a fixed 1.6 MB for the last 40 minutes of 50 ms ticks (the session export, with the BPM shown), in typed arrays. Kept as one object per tick it was 14.7 MB after 45 minutes.
- The model is a 285 KB JSON in the bundle (about 100 KB gzipped), parsed in 2.5 ms at startup.

If the slot frame ever matters on a slow machine, the percentile sort is the place to start (keep a running histogram, or recompute the peaks once a second).

## Limits

- The labels are subjective at the edges (when a build starts), and some builds and drops are marked by feel with no change in the band levels at all; about 16% of labelled drops have no clear level step. That caps slot-level agreement.
- A drop is detected by reacting to it, about a second late. Auto mode should prefer the buildup (shown before 84% of drops) to get ready, and treat a single drop event as a cue that is right about 4 times in 10.
- Outro and a late break look alike while they happen; outro is shown only on a deep, falling fade after 150 s.
- Crossfades and DJ mixes: a change of tempo is now found (about 20 to 30 s late), but most blends of songs at the same tempo are still missed (sections still work across them).
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
3. Song changes at the same tempo (DJ blends): a boundary detector trained on longer, tempo-matched blends, or the bar and phrase grid (a new song restarts the phrase count), and a faster tempo switch right after the band shape changes, to call tempo changes sooner.
4. Auto mode (`auto-mode.md`).
5. Optional: load `section-model.json` lazily (about 100 KB gzipped) to keep it off the first paint.

## Verification

- `pnpm test`: `sections.test.ts` pins what must hold for any model (quiet and no clock without a regular beat, the clock, a new song after a long silence but not on a short stop, a new song on a held change of tempo but not on an octave, 3:2 or 4:3 reading, a blip or a drift, the same labels at a tenth of the level, a replayed recording giving the same states, bounded memory and speed) and the tree inference.
- The out-of-fold evaluation above, reproducible with `scripts/section-eval/`.
