# Our beat and tempo tracking against madmom (2026-11-10)

Should the new audio package keep our `TempoTracker` and `BeatGrid`, or move to a neural beat tracker like madmom's? Both were run over
the same songs, causal (online) mode for madmom so neither sees the future, and scored by the same scripts (`bpm-score.py`, `grid-score.py`).

## Setup

- **Ours:** `TempoTracker` and `BeatGrid` over the app's five band levels (`levels.py`, Web Audio biquads, 60 fps), through `bpm-eval.mts --reader tracker` and `grid-eval.mts`.
- **madmom online** (0.17.dev0, git master): the unidirectional RNN ensemble and the forward-only DBN, through `madmom-eval.py`. Its shown BPM is 60 over the median gap of its last 8 beats in the last 12 s, read every 500 ms like ours. That reader is ours, not madmom's, so its jump count partly reflects the reader.
- **Clean:** the decoded audio. **Laptop mic:** `levels.py --mic laptop` (almost no bass under 200 Hz, 10 kHz top, reverb, noise at -40 dB), one seed per track, and the same simulated audio written as WAV (`--wav-out`) for madmom, so both hear exactly the same thing.
- **GiantSteps tempo** (664 two-minute EDM excerpts, v2 tempo labels, 661 scored): madmom was not trained on it, so it is the fair test. Tempo only, no beat marks.
- **Ballroom** (698 thirty-second excerpts, 523 in 4/4 scored): beat and downbeat marks. **madmom's beat models were trained on Ballroom**, so its Ballroom numbers are flattering.
- The offline madmom run (whole-song, with downbeats) was stopped: it is a ceiling no live tracker can reach, and on Ballroom it would be doubly flattering.

## Tempo on EDM (GiantSteps)

| | acc1 | acc2 | track | jumps/min | octave | lock (median) | locked |
|---|---|---|---|---|---|---|---|
| Ours, clean | **0.84** | 0.92 | 0.86 | **0.1** | **0.07** | 11.5 s | 0.88 |
| madmom, clean | 0.82 | 0.91 | 0.87 | 2.0 | 0.09 | **2.5 s** | 0.92 |
| Ours, laptop mic | **0.85** | 0.93 | 0.86 | **0.1** | 0.08 | 11.5 s | 0.88 |
| madmom, laptop mic | 0.81 | 0.91 | 0.86 | 1.9 | 0.10 | **2.5 s** | 0.92 |

acc1: readings within 4% of the label. acc2: also at half, double, a third or three times. track: the most common reading is right.
octave: share of readings at the wrong level. lock: time until the reading is right and stays right for 5 s (new in `bpm-score.py`).

- On EDM tempo they are even, and ours holds through the laptop mic.
- Ours is far steadier on screen (0.1 against 2 jumps a minute). Part of madmom's figure is the simple reader on top of it.
- **The real gap is how soon a tempo shows: about 11.5 s for ours (it shows nothing until its window fills), 2.5 s for madmom.** That is what you see after a song change.
- Octave errors are rare for both on EDM (7 to 10% of readings). They concentrate in the same genres for both: chill-out (ours 40%), indie dance and nu-disco (54%), glitch-hop (22%).

## Beat placement (Ballroom)

| | beat F | beat F any level | downbeat F | first beat |
|---|---|---|---|---|
| Ours, clean | 0.62 | 0.76 | 0.23 | 11.8 s |
| madmom, clean | **0.94** | **0.97** | (no online bar model) | 0.4 s |
| Ours, laptop mic | 0.62 | 0.76 | 0.22 | |
| madmom, laptop mic | **0.91** | **0.95** | | |

Where ours loses, on the tracks where its tempo is right (74% of them; madmom 91%):

| | on the beat | off-beat | in between | timing of hits (median / p90) |
|---|---|---|---|---|
| Ours | 76% | 14% | 11% | 12 / 32 ms |
| madmom | 96% | 1% | 3% | 10 / 30 ms |

- When our beats land, they are as precise as madmom's. The loss is phase: a beat in seven on the "and", and some drifting between.
- Ballroom has little four-on-the-floor kick, which is what our onset detector finds best, and madmom trained on it, so the gap on EDM is probably smaller. There are no EDM beat marks with audio on disk to measure it (Raveform's are, but only as band levels).

## What it means for the package

1. **Keep our tempo tracker for EDM.** It matches madmom on tempo, is steadier, and holds up through a laptop mic. madmom is also not usable as is: BeatTrackerJS (the browser port) has no license, and madmom's model weights are, as far as I know, CC BY-NC-SA.
2. **Show a tempo sooner.** The cheapest real win: a provisional reading from the first few seconds of beats, replaced when the window fills, instead of nothing for 11 s. Score it with the new lock metric.
3. **Fix beat phase.** The grid is right on tempo and precise when on the beat, but lands on the off-beat 14% of the time. A small learned beat-activation (a causal network over our band levels, trained with the existing pipeline on Ballroom and Raveform's beat marks) feeding the existing grid is the madmom idea without its license problem. Score it against the 0.62 and the 0.94 above.
4. **Run the analysis in an AudioWorklet** in the new package. Not measured here, but it removes the frame-rate dependence and the hidden-tab pause.

## Reproducing

Datasets are on the c0d3ster Drive under `Audio Analysis/datasets/` (`rclone copy audio-analysis:datasets <dir>`): Ballroom (`data1.tar.gz`, `ballroom-annotations.tar.gz`) and GiantSteps (`giantsteps-tempo.tar.gz`, `gt.json`). madmom: `pip install --no-build-isolation git+https://github.com/CPJKU/madmom.git` in its own venv (needs `wheel`, `cython`, `numpy<2` and MSVC build tools on Windows).

```sh
python levels.py <song> <out.f32> [--mic laptop --seed N --wav-out heard.wav]
tsx bpm-eval.mts <levels dir> ours.bpm.json --reader tracker
tsx grid-eval.mts <levels dir> ours.grid.json
python madmom-eval.py <audio dir> <prefix> --jobs 16      # resumable: per-track results in <prefix>.cache/
python bpm-score.py <run.bpm.json> gt.json --by-genre
python grid-score.py <run.grid.json> <ballroom annotations>
```

madmom online takes about 50 to 60 CPU seconds per two-minute track (its forward pass is a Python loop): about 2 hours for GiantSteps on 16 workers.
