# Section evaluation and training

Offline tools that train the song section model (`src/audioanalysis/section-model.json`) on expert labels and score `SectionTracker` (`src/audioanalysis/sections.ts`) against them. Everything here is causal in the same way the app is: the tracker only ever sees the past.

## Data

The **Socially Significant Music Events** dataset (Yadati, Larson, Liem, Hanjalic, IEEE Transactions on Multimedia 2018): 402 Creative Commons EDM tracks from SoundCloud, with drop times and build and break intervals marked by experts. On OSF as project `eydxk` (`https://osf.io/eydxk`): a split zip of the mp3s plus one `.mat` per track. Audio is not committed.

- 63 tracks carry no labels at all (placeholder zeros); they are left out of training and scoring.
- 159 tracks have no drop but do have builds or breaks.
- What is left: 435 drops, 595 builds and 371 breaks over 339 tracks, all at 1 s precision.

Convert the `.mat` files to one JSON (`{ id: { drop, build_start, build_end, break_start, break_end } }`, zeros and empty intervals dropped) with `scipy.io.loadmat`. The scripts take that JSON as `<gt.json>`.

## Pipeline

Needs ffmpeg, Python 3 with numpy, scipy and scikit-learn (matplotlib for charts), and the repo's node_modules (`tsx`).

```sh
cd scripts/section-eval
# 1. Band levels, as the app measures them (Web Audio biquads, RMS per frame at 60 fps). --mic room|laptop simulates hearing it through a microphone.
python levels.py song.mp3 levels/clean/<id>.f32
python levels.py song.mp3 levels/laptop/<id>.f32 --mic laptop --seed <n>
# 2. Section features (src/audioanalysis/section-features.ts) for every song, and random playlists for the song change detector.
../../node_modules/.bin/tsx dump-features.mts levels/clean features/clean
../../node_modules/.bin/tsx dump-playlists.mts levels/clean folds.json playlists/clean --per-fold 40
# 3. Train with 5-fold cross-validation (fold = track id mod 5), tune the decoder on out-of-fold output, add the song change detector.
python train.py features/clean,features/room,features/laptop gt.json out --export-folds --export ../../src/audioanalysis/section-model.json
python decode.py out/oof.npz gt.json --grid
python train_boundary.py playlists/clean,playlists/laptop features/clean --export ../../src/audioanalysis/section-model.json
# 4. Score the real tracker (TypeScript), each song through the fold model that never saw it.
../../node_modules/.bin/tsx run.mts levels/clean out/run.json --fold-models out
python score.py out/run.json gt.json
../../node_modules/.bin/tsx run.mts levels/clean out/pl.json --playlist pl-gap0.json
python score.py out/pl.json x --playlist
```

`folds.json` is `{ id: id mod 5 }`. Fold models for `train_boundary.py` come from the same folds.

## Scripts

- `levels.py`: decode, optional mic simulation (room: reverb, noise floor at -48 dB, low cut at 40 Hz; laptop: almost no bass under 200 Hz, 10 kHz top, more reverb, noise at -40 dB), the five onset-band filters, RMS per frame.
- `dump-features.mts`, `dump-playlists.mts`: the real `OnsetDetector` and `SectionFeatures` over saved levels. `stream.mts` joins songs with gaps or crossfades.
- `train.py`: stage 1 (other / build / break per slot) and stage 2 (a drop just landed), gradient-boosted trees, out-of-fold probabilities to `oof.npz`, exports for the app.
- `decode.py`: the state machine that turns probabilities into labels (mirrors `sections.ts`), with a coordinate search over its thresholds on out-of-fold output.
- `train_boundary.py`: the song change detector, scored on playlists (changes found, changes invented per hour) and on single songs (every change is a false clock reset).
- `run.mts`: replays levels through any tracker module (`--tracker`), single songs, fold models or playlists. Works on the old rule-based tracker too, which is how the before and after numbers were made.
- `score.py`: drop P/R/F1 (a drop counts within 1 s before to 3 s after a labelled one), build and break agreement slot by slot, how many drops had a buildup shown in the 10 s before, false song changes, and playlist boundary recall.
- `chart.py`: one song's band levels with the expert labels and each tracker's sections underneath.
- `replay-log.mts`: replays a session exported from the app (`exportSectionLog()` in the console, 50 ms ticks) through the current tracker, exactly as it ran.
- `bpm-eval.mts`, `bpm-score.py`: the BPM the Beat HUD would show every 500 ms, old estimator or `TempoTracker` (`--opts` for variants, `--fps` for the frame rate), scored against labelled tempos (the GiantSteps tempo set: https://github.com/GiantSteps/giantsteps-tempo-dataset, audio from the JKU research mirror its `audio_dl.sh` points at).
- `bench-cpu.mts`: CPU time of each per-frame piece (onset detector, section tracker, tempo) on real songs at 60 fps: average per second of audio, slowest frame, frames over 2, 4 and 8 ms per hour. `--old <file>` adds the old rule-based tracker for comparison (`git show 5e81479:src/audioanalysis/sections.ts > src/audioanalysis/sections-old.tmp.ts`).
- `spectrum.py`: emulates the app's 512-point FFT analyser. Used to test whether spectral (timbre) features help; they did not (see the plan doc), so the model does not use them.

## Results

See `docs/implementation-plans/song-sections.md`.
