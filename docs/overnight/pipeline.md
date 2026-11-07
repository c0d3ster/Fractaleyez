# Overnight pipeline: grid on real EDM, sections, rhythm patterns, then improvement loops

Six stages, run in order (1 to 4 always; 5 and 6 are optional, see the switch below), each in its own fresh Claude Code cloud session on c0d3ster/Fractaleyez. A session is started with
"Run stage N of docs/overnight/pipeline.md". It reads this file, does its stage, and at the end starts the next stage's session.
Progress goes in `docs/overnight/status.md` (append, never rewrite). Results and cost go in `docs/overnight/report.md` (see "Report").

**Optional stages 5 and 6: AUTO** (OFF skips them, ON runs them regardless). On AUTO, each runs only if both gates pass, checked by the
stage before it just before starting it, with the reasons written in status.md:

- **Budget.** The user's rule: run everything while at least 20% of their weekly usage limit remains (Max plan, no extra usage credits; at
  08:15 UTC about 15% of the week was used, with the week resetting the next night). Sessions cannot read that percentage, so use two
  proxies. (1) Call `get_session` with no id and read `external_metadata.rate_limit_info`: if it names a weekly limit (anything other than
  `five_hour`), or its status is not `allowed`, do not start. (2) Add up the stage costs in report.md: stage 5 starts only if stages 1 to 4
  cost under $250 in total, stage 6 only if stages 1 to 5 cost under $300 (the user's limits). Rough basis: stage 0's $58 was at most 15%
  of the week. These are estimates; when the rate-limit signal and the totals disagree, the rate-limit signal wins.
- **Evidence.** Stage 5 only if the grid has room to improve (stage 1's tuned downbeat F under 0.85 or 8-bar F under 0.6 on the held-out
  folds) and stage 4's loop worked as a method (it ran without voiding, whether or not it improved the hidden set). Stage 6 only if stage 2
  reproduced the baseline and finished.

A skipped optional stage is written in status.md and report.md with the reason; the last stage that did run writes the final summary.

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
- Usage limits: the account has a 5-hour usage window. If a turn stops because the limit was hit, nothing needs doing: an hourly
  supervisor (a scheduled task named "Overnight pipeline supervisor") sends "continue" once the limit resets, or starts a fresh session for the
  stage. When you are resumed, or start on a stage someone else began: `git pull`, read status.md and `git log`, and carry on from the last
  checkpoint. Never redo finished work, and never start the next stage twice (check status.md and the session list, tag `overnight-pipeline`).
  Commit and push often, so an interruption loses little.
- If you cannot finish, push what works, write in status.md exactly where you stopped and why, and still start the next stage if its
  inputs exist; otherwise stop and say so in status.md.
- At the end, before starting the next stage, write your stage's entry in `docs/overnight/report.md` (see "Report"), then start the next stage with the claude-code-remote `create_session` tool: `source_url` https://github.com/c0d3ster/Fractaleyez,
  `source_revision` feat/bar-grid, `outcome_branch` feat/bar-grid, prompt "Run stage <N+1> of docs/overnight/pipeline.md", `tags` ["overnight-pipeline"]. Then write "stage N finished" in status.md. If `create_session` is
  not available, use `create_trigger` instead: `create_new_session_on_fire` true, `run_once_at` two minutes from now, name "Overnight stage
  <N+1>", prompt "Attach c0d3ster/Fractaleyez with add_repo (access push), clone it, check out feat/bar-grid, then run stage <N+1> of
  docs/overnight/pipeline.md (tag nothing; title your work Overnight <N+1>/3)." Write which way you started it in status.md. Stage 4 starts stage 5,
  and stage 5 starts stage 6, only if that stage passes its gates (see the switch at the top); the last stage that runs (6, or 4 when they are OFF) starts nothing, writes the final summary (see
  "Report") and then the line "pipeline complete" in status.md.

Setup each session needs: `pnpm install --frozen-lockfile`, `pip install numpy scipy scikit-learn matplotlib`, ffmpeg (installed).

## Data

- **Raveform band levels** (made on the user's machine by `scripts/section-eval/raveform-fetch.py`): the zip's download URL is the one line in
  `docs/overnight/data-source.txt` on origin/feat/bar-grid (`git pull` and re-read it on every retry; the user shares it on Google Drive,
  which downloads with `curl -L "https://drive.usercontent.google.com/download?id=<FILE_ID>&export=download&confirm=t" -o raveform-levels.zip`;
  check the result is a zip, not an HTML page). If that file does not exist yet, the data is not ready. The zip (296 MB, checked) was made on
  Windows: its paths use backslashes (`raveform-levels\0002.kfJQCu-Jbec.f16`, `raveform-levels\fetched.json`,
  `raveform\structures\segments.json`), which `unzip` mishandles, so extract it with Python's `zipfile` and turn `\` into `/`. 1,370 tracks
  were fetched (53 videos were unavailable; `fetched.json` lists them). Inside: `<key>.f16` per track (raw
  float16, frames x 5 bands, 60 fps) and `fetched.json` (which tracks worked). Convert to the float32 `.f32` files the scripts read
  (`numpy.fromfile(path, '<f2').astype('<f4').tofile(...)`).
- **Raveform labels**: https://huggingface.co/datasets/taejunkim/raveform/resolve/main/raveform.zip (479 MB; only `raveform/structures/*`
  is needed: `segments.json` with each track's `key`, `genre`, `fold` (0 to 7), tempo and sections, and `beats/<key>.beat.csv` with every
  marked beat: time, place in bar 1 to 4, section). Use Raveform's own folds for every split.
- **SSME** (the 339 labelled tracks the section model is scored on now): OSF project `eydxk`, see `scripts/section-eval/README.md`.
- **GiantSteps tempo** and **Ballroom**: see the README.

## Stage 1: the beat grid on real EDM

Stage 1 starts by downloading the Raveform levels (see Data). If `docs/overnight/data-source.txt` is not there yet or the download fails (the
user is uploading it), use `send_later` to try again in 30 minutes, up to 10 times, noting each wait in status.md; then stop with
"blocked: no Raveform levels".

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
3. Your report entry (see "Report"), then start stage 4.

## Stages 4 to 6: improvement loops

Each is an automated loop: propose one change, run the frozen evaluation, keep the change only if one number improves enough without the
check set getting worse, otherwise revert, log every attempt, repeat. Rules for all three:

- Before the first iteration, fix the data split by a stable hash of the track id and write it to `docs/experiments/<loop>-split.json`:
  60% tune, 20% check, 20% hidden. The loop never sees the hidden 20% until the very end. The evaluation scripts, the data and the split
  are read-only for the loop (commit them first; any change to them during the loop voids the run).
- Fixed seeds. Keep a change only if the metric improves by at least the stated margin and the check set does not get worse. Each kept change
  is its own commit (message: the change and the before and after metric); a rejected one is reverted. Every attempt, kept or not, goes in
  `docs/experiments/<loop>.md` as one table row: iteration, change, metric, check score, kept.
- Stop after 40 iterations or 4 hours, whichever is first. Then score the hidden set once with the starting code and once with the final code,
  and write both in the report. A loop that does not beat the start on the hidden set is reported as such (no change shipped).
- Tests must still pass (`pnpm test`), and do not change public APIs (`TempoReading`, `GridState`, `SectionState`).

### Stage 4: BPM loop

Branch `exp/bpm-loop` off feat/bar-grid; merge it back into feat/bar-grid at the end only if the hidden set improved. GiantSteps tempo set
(see the README), levels clean and `--mic laptop`. Edit surface: `src/audioanalysis/tempo-tracker.ts`. Metric (`bpm-eval.mts`,
`bpm-score.py`, 60 fps): tuning-set acc1 + 0.5 x track - 0.05 x jumps per minute, averaged over clean and laptop. Margin 0.005. Every 10
iterations also check 30 and 144 fps have not got worse, and that the noise files from `noise.py` still show no tempo.

### Stage 5 (optional): beat grid loop

Branch `exp/grid-loop` off feat/bar-grid. Raveform levels and marks; split by Raveform's own folds instead of the hash: folds 0 to 4 tune,
fold 5 check, folds 6 and 7 hidden. Edit surface: `src/audioanalysis/beat-grid.ts` (not `GridState`). Metric (stage 1's Raveform scorer):
downbeat F + 8-bar F + 0.5 x beat F on the tuning folds. Margin 0.005. Also keep Ballroom beat F from getting worse.

### Stage 6 (optional): section model loop

Branch `exp/section-loop` off feat/bar-grid. Hidden first: SSME tracks with id mod 5 == 4 and Raveform folds 6 and 7. The loop's metric is
out-of-fold mean F1 (drop, buildup, break, from `score.py` on the TypeScript tracker) over the remaining SSME tracks with 4-fold
cross-validation, averaged over clean and laptop; check set: Raveform folds 0 to 5 scored by models trained on SSME alone. Edit surface:
features (`section-features.ts`), training settings (`train.py`), the decoder (`sections.ts`, mirrored in `decode.py`). Margin 0.003.
Retraining takes minutes, so expect fewer iterations; 4 hours still caps it. Ship a new `section-model.json` only if the hidden set improved.

## Report

`docs/overnight/report.md` has one section per stage, written by that stage at its end:

- **What changed**: one or two sentences, and the commits.
- **Before and after**: a table of the stage's key numbers, before the stage and after, on the same data and scoring (out of sample; for the
  loops, the hidden set).
- **Cost**: call the claude-code-remote `get_session` tool with no session id (it describes your own session) and copy
  `external_metadata.usage`: `cost_usd`, input, output, cache read and cache write tokens, plus the session's wall time (created to now).
  If a stage was resumed in more than one session, add each session's numbers and list the session ids. If `get_session` is not available,
  write the session id and "cost: see the session" instead.

report.md is the one document the user reads in the morning, and later a case study of the work, so write it for a reader who has not
seen any of the sessions: plain language, numbers with what they mean, what was tried and did not help, and links to the plan docs and
commits for detail. status.md stays the raw log; report.md is the story.

The final summary (written by the last stage that runs) goes at the top of report.md: a table with one row per stage (headline before and
after number, cost in USD, wall time), the total cost, what the user should review first, and what is left.

