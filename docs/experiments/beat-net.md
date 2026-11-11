# The beat network (2026-11-10)

The madmom benchmark (`madmom-benchmark.md`) found our tempo as good as madmom's on EDM but our beats landing on the off-beat a beat in
seven: the grid finds its phase from rises in band energy, which cannot tell the kick on the beat from a hat on the "and". madmom's
advantage is a network that has learned what a beat sounds like. Its weights are noncommercial and its browser port has no license, so we
trained our own, on our own band levels.

## What it is

`src/audioanalysis/beat-net.ts`: a 2-layer GRU (32 units, about 11,000 weights, 106 KB of JSON) over the five onset-band levels on a 10 ms
hop grid, 15 inputs per hop (each band's level against a 3 s follower, its rise over a 30 ms follower, its step from the hop before), two
outputs per hop: beat now, downbeat now. Causal: it only hears the past. It costs about 46 microseconds a frame (2.8 ms of CPU a second of
audio). `beat-net.test.ts` checks it gives PyTorch's numbers to 4 decimals.

**Where it is used:** the beat grid's phase and its choice of beat 1 (`BeatGrid`, the app's `beatGrid`, with `netDownbeatWeight` 3). The
tempo stays on the band rises only (see "The tempo stays on the band rises" below).

## Training (`scripts/section-eval/beat-net.py`)

- **Round one:** Raveform folds 0 to 4 (855 EDM tracks, hand-marked beats and downbeats), half the windows through a simulated laptop mic
  in the level domain, 2,500 steps.
- **Round two (shipped):** from round one's weights, plus GiantSteps (551 tracks, clean and laptop levels) and SSME (342 tracks, clean,
  room and laptop levels) with beats marked offline by Beat This! (`teacher-beats.py`; CPJKU, MIT code and weights). A track was kept only
  where Beat This!'s tempo agreed with a label (GiantSteps) or with our own tracker (SSME): it is off by an octave or 3:2 on 9.5% of
  GiantSteps, and those would have taught the double-time error. Best at step 1,250 of 2,500.
- Raveform fold 5 picks the checkpoint; folds 6 and 7 (343 tracks) are only ever scored. Time-stretch augmentation is in the trainer but
  off: the sets already cover the EDM tempo range.

## Results: Raveform folds 6 and 7, held out (343 EDM tracks)

The network for the grid's phase only (`netDownbeatWeight` 0), with the faster first tempo below, scored by `grid-score-raveform.py`. The
app's setup adds the network's downbeats on top: see "Downbeats from the network" for those numbers.

| | beat F | downbeat F | bar right | 8-bar F | phrase right | offset |
|---|---|---|---|---|---|---|
| Grid on band rises, clean | 0.815 | 0.618 | 0.66 | 0.432 | 0.41 | -4 ms |
| **With the beat net (phase only), clean** | **0.925** | **0.722** | **0.82** | **0.520** | **0.55** | -1 ms |
| Grid on band rises, laptop mic (level-domain simulation; before the faster first tempo) | 0.834 | 0.652 | 0.70 | 0.449 | 0.45 | |
| **With the beat net (phase only), laptop mic** | **0.923** | **0.750** | **0.85** | **0.548** | **0.59** | -1 ms |

- By genre (clean): techno 0.965 beat F, trance 0.907.
- Round one and round two score the same on this test (0.924 and 0.924 clean, 0.921 and 0.922 laptop); round two ships for its wider
  data and its smaller offset.
- With the network the grid's latency correction is 4 ms (`BEAT_NET_LATENCY_MS`), not 25: its beats arrive closer to the sound. At 25 ms
  they landed 21 ms early (beat F 0.892 instead of 0.907 on a quarter of the test).
- The network feeding both the tempo and the grid scored 0.907 on that quarter; the grid alone, 0.922.
- madmom scored 0.94 beat F on Ballroom, which it was trained on; it cannot be run on Raveform (no audio). Ballroom is not used here: it
  is not EDM.

## The first tempo, sooner

The tempo tracker showed nothing until 75% of its 12 s window had audio and then 6 readings in a row agreed: a median 11.5 s to lock.
`firstWindowShare` and `firstLockReadings` are now options, at 0.3 and 3:

| GiantSteps (661) | acc1 | jumps/min | lock (median) | noise shown a tempo |
|---|---|---|---|---|
| 0.75 and 6 (before) | 0.84 | 0.1 | 11.5 s | none |
| **0.3 and 3** | **0.85** | **0.1** | **5.0 s** | **none** |
| 0.25 and 4 | 0.84 | 0.1 | 4.5 s | white 54% clean, brown, pink, white over 50% laptop |
| 0.2 and 3 | 0.83 | 0.1 | 3.5 s | all four, 58 to 85% |

Through the laptop mic the same: acc1 0.85, lock 5.0 s. Faster settings show tempos on noise (`noise.py`, through `levels.py`), so 0.3 and
3 is the floor without a stronger noise gate.

## Downbeats from the network

The grid picks beat 1 with weights fitted on band cues (`grid-train.py`). It now also keeps, per place in the bar, the network's strongest
downbeat output around each beat (decaying like the fitted cues), and adds `netDownbeatWeight` times its share against the mean to each
hypothesis. Tuned on Raveform fold 5: 0 0.746, 1 0.759, 2 0.768, 3 0.770, 4 0.770, 5 0.769, 10 0.751, 30 0.679 downbeat F; 3 ships. On
folds 6 and 7:

| | downbeat F | bar right | 8-bar F | phrase right |
|---|---|---|---|---|
| Beat net, phase only, clean | 0.722 | 0.82 | 0.520 | 0.55 |
| **Plus its downbeats (the app's setup), clean** | **0.744** | **0.85** | **0.537** | **0.59** |
| Beat net, phase only, laptop | 0.750 | 0.85 | 0.548 | 0.59 |
| **Plus its downbeats (the app's setup), laptop** | **0.767** | **0.88** | **0.560** | **0.61** |

Beat F is unchanged (0.925 clean, 0.923 laptop).

## The tempo stays on the band rises

Fed the network's beat probability instead, with the period scoring retuned for it (its output has no off-beat energy, so the half-beat
credit matters): half-beat 0 acc1 0.79, 0.5 0.83, 0.75 0.84, 1.0 0.84 on GiantSteps, against 0.85 for the band rises; 0.2 jumps a minute
against 0.1; both 0.98 on Raveform fold 5's full tracks. And it showed a tempo on 85 to 92% of the noise files, which the band rises never
do: the network has never heard noise. So the network-to-tempo path was removed; the tempo reads the band rises only.

There is little to win there: madmom online scored 0.82 on GiantSteps against our 0.84, and Beat This!, offline, 0.83. What is left is
mostly which octave a track is counted in (87 or 174), on the same genres for every method (chill-out, nu-disco, glitch-hop).

## Next

- 8-bar lines (0.54) are the weak part now. The network's downbeat output is its weakest (peak-picked F about 0.4): training it harder
  on downbeats, or a phrase output, is the next step there.
- More hand-marked EDM, and the user's own recordings, scored the same way.
