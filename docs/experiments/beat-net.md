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

**Where it is used:** only the beat grid's phase (`BeatGrid`, the app's `beatGrid`). The tempo stays on the band rises: fed the network's
output, the tempo tracker (tuned for band rises, which credit hats on the eighths) picked wrong tempos on GiantSteps (acc1 0.84 to 0.77).

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

The app's setup (`grid-eval.mts --beat-net`), with the faster first tempo below, scored by `grid-score-raveform.py`:

| | beat F | downbeat F | bar right | 8-bar F | phrase right | offset |
|---|---|---|---|---|---|---|
| Grid on band rises, clean | 0.815 | 0.618 | 0.66 | 0.432 | 0.41 | -4 ms |
| **With the beat net, clean** | **0.925** | **0.722** | **0.82** | **0.520** | **0.55** | -1 ms |
| Grid on band rises, laptop mic (level-domain simulation; before the faster first tempo) | 0.834 | 0.652 | 0.70 | 0.449 | 0.45 | |
| **With the beat net, laptop mic** | **0.923** | **0.750** | **0.85** | **0.548** | **0.59** | -1 ms |

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

## Next

- Downbeats (0.72) and 8-bar lines (0.52) are the weak part now. The network's own downbeat output is not used yet (the grid keeps its
  fitted downbeat model); feeding it in is the obvious next step.
- More hand-marked EDM, and the user's own recordings, scored the same way.
