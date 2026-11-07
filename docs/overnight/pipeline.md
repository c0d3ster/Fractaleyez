# Overnight pipeline: grid on real EDM, then sections, then rhythm patterns

Three stages, run in order, each in its own fresh Claude Code cloud session on c0d3ster/Fractaleyez. A session is started with
"Run stage N of docs/overnight/pipeline.md". It reads this file, does its stage, and at the end starts the next stage's session.
Progress goes in `docs/overnight/status.md` (append, never rewrite).

## Rules for every stage

- Work on branch `feat/bar-grid` (PR #269, a draft). `git pull origin feat/bar-grid` first. Commit and push at every checkpoint named
  below, with a clear message ending in the Co-Authored-By and Claude-Session lines from your system prompt. Never force-push, never
  rewrite history.
- Read first: `CLAUDE.md`, `docs/implementation-plans/bar-grid.md`, `song-sections.md`, `tempo.md`, `scripts/section-eval/README.md`.
- Accuracy is the priority. Every number you report is out of sample (a track is never scored by a model or setting tuned on it). Measure
  before changing anything; change only what the data supports; record what did not help as well as what did.
- Another session is building a waveform HUD at the same time. Do not change the `GridState` type or the HUD files
  (`src/components/huds/*`), and touch `AudioFeed` only if your stage says so.
- Keep the repo's code style (CLAUDE.md, the user's preferences in it): arrow functions, single quotes, no semicolons, named exports,
  explicit return types. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before each commit that touches `src/`.
- Downloaded data goes under a scratch directory, never into the repo. Training audio is never committed.
- Append to `docs/overnight/status.md` when the stage starts, at each checkpoint (one line, with the key numbers) and when it ends
  (finished, or blocked and why), and commit it with the checkpoint.
- If you cannot finish, push what works, write in status.md exactly where you stopped and why, and still start the next stage if its
  inputs exist; otherwise stop and say so in status.md.
- At the end: start the next stage with the claude-code-remote `create_session` tool: `source_url` https://github.com/c0d3ster/Fractaleyez,
  `source_revision` feat/bar-grid, `outcome_branch` feat/bar-grid, prompt "Run stage <N+1> of docs/overnight/pipeline.md". If that tool is
  not available, write that in status.md. Stage 3 starts nothing.

Setup each session needs: `pnpm install --frozen-lockfile`, `pip install numpy scipy scikit-learn matplotlib`, ffmpeg (installed).

## Data

- **Raveform band levels** (made on the user's machine by `scripts/section-eval/raveform-fetch.py`): release asset
  https://github.com/c0d3ster/Fractaleyez/releases/download/raveform-levels-v1/raveform-levels.zip. Inside: `<key>.f16` per track (raw
  float16, frames x 5 bands, 60 fps) and `fetched.json` (which tracks worked). Convert to the float32 `.f32` files the scripts read
  (`numpy.fromfile(path, '<f2').astype('<f4').tofile(...)`).
- **Raveform labels**: https://huggingface.co/datasets/taejunkim/raveform/resolve/main/raveform.zip (479 MB; only `raveform/structures/*`
  is needed: `segments.json` with each track's `key`, `genre`, `fold` (0 to 7), tempo and sections, and `beats/<key>.beat.csv` with every
  marked beat: time, place in bar 1 to 4, section). Use Raveform's own folds for every split.
- **SSME** (the 339 labelled tracks the section model is scored on now): OSF project `eydxk`, see `scripts/section-eval/README.md`.
- **GiantSteps tempo** and **Ballroom**: see the README.

## Stage 1: the beat grid on real EDM

Stage 1 starts by downloading the Raveform levels. If the release asset is not there yet (the user is uploading it), use `send_later` to try
again in 30 minutes, up to 10 times, noting each wait in status.md; then stop with "blocked: no Raveform levels".

1. Score `BeatGrid` (`src/audioanalysis/beat-grid.ts`, via `scripts/section-eval/grid-eval.mts`) against Raveform's marked beats: beat F
   (70 ms), downbeat F, and 8-bar line accuracy (counted from the first marked downbeat; Raveform's section starts sit on 8-bar lines 73% of
   the time, so also report how often its section starts land on the grid's 8-bar line). Also the median beat offset. Report by genre.
   Write a scorer for Raveform's format next to `grid-score.py`. Checkpoint 1: the baseline numbers.
2. Improve the grid where the numbers say it is weak (downbeat cues and their weights, phrase evidence, memory and switch times, the
   latency constant). Tune on Raveform folds 0 to 5, report on folds 6 and 7, and check the result still passes `beat-grid.test.ts` and does
   not get worse on Ballroom beats. Checkpoint 2: the tuned grid, numbers before and after, `bar-grid.md` updated.

## Stage 2: the section model with the grid and Raveform's tracks

1. Rebuild the current baseline first (SSME levels clean, room and laptop with `levels.py --mic`; features; `train.py` and `decode.py`), and
   confirm it reproduces the out-of-fold numbers in `song-sections.md` within noise before changing anything.
2. Grid features into the model the way the app will compute them: `SectionFeatures` (or `SectionTracker`) gets the grid state from a
   `BeatGrid` fed alongside it (bar in phrase, beats to and since the 8-bar line, confidences; `scripts/section-eval/exp_grid.py` is the
   offline version of this, which gave +0.025 drop F1). Add Raveform tracks to training with its labels mapped to ours: buildup to build,
   breakdown and cooldown to break, a drop section's start to a drop event (intro, outro, bridge to other). Also try a decoder prior that a
   drop lands on or near an 8-bar line.
3. Score out of fold on both sets: SSME's 339 tracks (folds by id mod 5, as now) and Raveform (its own folds), clean and laptop. Ship the new
   `section-model.json` only if it beats the current model on SSME without losing on the laptop mic. Checkpoint: numbers, the model if
   shipped, `song-sections.md` updated with before and after. If the grid needs wiring into `AudioFeed` for the tracker to use it, do that
   (expose `window.getBeatGrid`), coordinating with the HUD rule above.

## Stage 3: rhythm pattern names

Evaluate and improve the names under the Beat HUD (`namePattern` and `estimateTempo` in `src/audioanalysis/tempo.ts`: four on the floor,
half time, double time, sixteenths, dembow, syncopated).

1. Proxy labels from genre (write the mapping and its weaknesses down first): techno, house, trance to four on the floor; dubstep to half
   time; drum and bass and breaks to breakbeat or two-step. Raveform's marked downbeats say where kicks and snares fall in the bar. Report a
   confusion matrix for the current code on Raveform, GiantSteps and Ballroom. Checkpoint 1.
2. Test naming from the onset bands (kick against snare) and `BeatGrid` bar positions instead of only beat gaps; add refined names (two-step,
   breakbeat, shuffle) only if they can be detected reliably. Tune on half the tracks, score on the other half. Checkpoint 2, `tempo.md`
   updated.
3. Write a short morning summary at the top of status.md: what each stage changed, the key before and after numbers, what is left, and what
   the user should review first.
