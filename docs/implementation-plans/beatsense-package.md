# beatsense: the audio package

## Context

All of the app's audio code moves out of `src/` into its own pnpm workspace package, `packages/beatsense`, so audio analysis and the visualizer are cleanly split and the audio side has a surface designed as a public API (see the memory note on the split). The name `beatsense` is free on npm (picked over SoundWorks, which is IRCAM's framework, and soundsense, beatworks and beatdrop).

The package follows `packages/sprite-strip`: the app depends on it as `workspace:*`, its `exports` has an `@fractaleyez/source` condition pointing at `src/index.ts` (webpack `resolve.conditionNames`, tsc `customConditions` and the root vitest config use it, so the app compiles it from source with no build step), and it keeps its own eslint, vitest, tsconfig and tsup. It is MIT (code and trained weights, decided 2026-11-12, with the training data credited in `NOTICE`), but unlike sprite-strip it stays `"private": true` and out of `mirror-packages.yml` and `publish-packages.yml` until launch (phase L).

Rules for the surface:

- One entry. `exports` has only `"."`, so nothing outside the package can import `beatsense/src/...`. Everything a consumer needs is a named export of `src/index.ts`.
- No import-time singletons. The package exports classes; whoever uses them creates the instances. The app's instances live in its composition root, `src/audio.ts`.
- No `window`, config or DOM reads inside the package. What the app reads from `window.config` or `window.enabledFreqBands` today is passed in as options (values or getters).
- App behavior stays byte-identical through every phase, checked by a replay test (Equivalence check below).

## Survey (main at a54f7d3)

### Pure analysis (no window, DOM or Web Audio)

All in `src/audioanalysis/` before this work. `performance.now()` is the only global any of them touches (BeatMonitor's read-time trims).

| Module | What it is | Singleton |
| --- | --- | --- |
| `onset-bands.ts` | the five onset bands (specs, windows), `DEFAULT_ENABLED_BANDS`, `isValidBandSelection` | |
| `onset-detector.ts` | `BandTracker`, `OnsetDetector`: the one definition of a beat | |
| `beat.ts` | `BeatState`, `NO_BEAT`, `BeatMonitor` (timeline, beat times, band onsets, beat listeners) | `beatMonitor` |
| `tempo.ts` | `estimateTempo` (pure function, Beat HUD and sections) | |
| `tempo-tracker.ts` | `TempoTracker` | `tempoTracker` |
| `tempo-change.ts` | `TempoChangeCue` (sections' song-change cue) | |
| `beat-net.ts` + `beat-net-model.json` | the causal GRU beat network | |
| `beat-grid.ts` + `beat-grid-model.json` | `BeatGrid`, on top of a `TempoTracker` | `beatGrid` (on `tempoTracker`, with the bundled beat net) |
| `section-features.ts`, `section-model.ts`, `tick-recorder.ts`, `sections.ts` + `section-model.json` | `SectionTracker` | `sectionTracker` |
| `section-export.ts` | `buildSectionLog` (pure) and `exportSectionLog` (DOM download) | |
| `tick-extras.ts`, `spectrum-reducer.ts` | the 40-band spectrum (sweep input, listen recording) | |
| `drum-hits.ts` + `drum-hit-model.json` | `DrumHits` classifier | `drumHits` |
| `riser.ts` + `riser-model.json` | `RiserDetector` | `riserDetector` |
| `sweep.ts` + `sweep-model.json` | `SweepDetector` | `sweepDetector` |
| `rhythm-pattern.ts` + `rhythm-model.json` | `nameRhythm`, `readRhythm`, `RhythmLabeler` | |
| `src/automode/roll-rate.ts` | `RollReader`: the snare roll's note value from `DrumHits.getRollHits` and the tempo | `snareRoll` |

### Coupled to the app, the browser or Web Audio

- `audioanalysis/audio-feed.ts`: `AudioFeed`, the per-frame driver. Reads `window.config.audio` (Threshold, Ignore Time), `window.enabledFreqBands`, `analyserConfig`'s peak persistency and `performance.now()`, then pushes the frame into every analyser in a fixed order (beat monitor, then drums, riser and sweep after the first sound, then tempo, grid, sections).
- `audioanalysis/audio-analyser.ts`, `audio-analysed-data.ts`: the older energy and peak analyser (reads `window.config.audio`, `userConfig` log flags, `analyserConfig`, `tools/easings`). `AudioAnalysedDataForVisualization` is the per-frame snapshot every visualizer reads.
- `audioanalysis/lag-estimate.ts`: `estimateLag` (pure) and `DetectorCalibration` over `localStorage` (singleton `detectorCalibration`), keyed by the app's `QualityTier`.
- `audioanalysis/lag-probe.ts`: `LagProbe`, click scheduling on a passed-in audio context (deps injected already); `matchClicks` and `summarizeLag` are pure.
- `audioanalysis/utility/analysed-data-visualizer.ts`: a canvas debug drawer nothing imports (dead code).
- `audiostream/audio-source.ts`: `AudioContext` and `getUserMedia`.
- `audiostream/audio-stream.ts`: the `AnalyserNode` FFT, the five onset band filters and their RMS levels, the lag probe's click injection.
- `audiostream/audio-data.ts`: a plain data class.
- `automode/auto-mode.ts`, `kaleidoscope-target.ts`: visual decisions read from `SectionState`, plus the ghost store. These are the visualizer's, not audio: they stay in the app.

### Who imports what

- `main.ts`: builds `AudioSource`, `AudioStream`, `AudioAnalyser`, `AudioFeed`, `LagProbe`, and hangs the analysers' getters on `window` for the HUDs (`getBeatTimeline`, `getTempo`, `getBeatGrid`, `getSongSection`, `getDrumHits`, `getRiser`, `getSweep`, `getSnareRoll`, `exportSectionLog`, ...).
- `visualization/layers/post-effects.ts`: `sectionTracker`, `tempoTracker`, `drumHits` (and `autoMode`, `snareRoll`).
- HUDs and config UI: constants and types only (`ONSET_BANDS`, `DEFAULT_ENABLED_BANDS`, `isValidBandSelection`, `DRUM_KINDS`, `DRUM_CENTER_HZ`, `estimateTempo`, `BeatSample`, `GridState`, `SectionState`, ...). The live values come through the `window.get*` getters.
- Visualizers and layers: the `AudioAnalysedDataForVisualization` type.
- `types/global.d.ts`: the types of the `window` getters.
- `scripts/section-eval/*.mts`: relative imports of the analysis modules; the Python trainers write the model JSONs and the test fixtures next to them, and `riserlib.py` and `sweep-train.py` run `tsx` there.
- Server: nothing on main. On `feat/listen-recording`, `ListenService` mirrors `TICK_BYTES` and the tick format version from `src/audioanalysis/tick-encoding.ts`.

### Overlap with `feat/listen-recording` (no PR)

Its own commits (the rest are already on main under other hashes): 344d302 (record band peaks, onsets and a spectrum per tick), 9843bba, 46c5c90, 1f6496a, 3cd3c1f. 344d302 is the one that touches audio: `sections.ts`, `tick-recorder.ts`, `section-export.test.ts`, `audio-feed.ts`, `audio-stream.ts`, and it adds `tick-encoding.ts` (+ test). `spectrum-reducer.ts` and `tick-extras.ts` are byte-identical on both branches already. `1f6496a` edits `scripts/section-eval/replay-log.mts` and the README.

After this PR, `sections.ts` and `tick-recorder.ts` live in `packages/beatsense/src/` and `section-export.test.ts` is `packages/beatsense/test/section-log.test.ts`. A rebase of listen-recording carries most of its hunks to the new paths by rename detection, but expect hand conflicts in: `sections.ts` (its `push` change, near the removed singleton), `audio-feed.ts` (now takes its analysers as a constructor argument), `replay-log.mts` (import path), and the test (moved and renamed). `tick-encoding.ts` should then move into the package (it is the recording format, and the server should import it from there). The branch is also far behind main (it predates drum hits, riser, sweep and the beat net), so it needs that rebase regardless. Suggested order: merge this, then rebase listen-recording onto main and move `tick-encoding.ts` in as part of it.

## Public API

The target surface once every phase is done. Everything is a named export of `beatsense`.

- Constants: `ONSET_BANDS`, `DEFAULT_ENABLED_BANDS`, `MAX_BAND_WINDOW_SAMPLES`, `DRUM_KINDS`, `DRUM_CENTER_HZ`, `DRUM_SENSITIVITY`, `SPECTRUM_BANDS`, `NO_BEAT`, `BEAT_ACTIVE_LEVEL`, and the option defaults (`DEFAULT_ONSET_OPTIONS`, `DEFAULT_TEMPO_OPTIONS`, `DEFAULT_GRID_OPTIONS`, `DEFAULT_RHYTHM_OPTIONS`, `DEFAULT_RHYTHM_HOLD`).
- Analysers, created by the caller: `OnsetDetector`, `BeatMonitor`, `TempoTracker`, `BeatGrid`, `SectionTracker`, `DrumHits`, `RiserDetector`, `SweepDetector`, `RhythmLabeler`, `SpectrumReducer`, later `RollReader`.
- Functions: `isValidBandSelection`, `estimateTempo`, `nameRhythm`, `readRhythm`, `buildSectionLog`, later `encodeTicks` / `decodeTicks` with `TICK_BYTES` and the format version.
- Models: `BEAT_NET_MODEL` (the bundled beat net, which `BeatGrid` takes as an argument). The other models load inside their class by default; `SectionTracker` already takes one as an argument.
- Types for all of the above (`BeatState`, `BeatSample`, `BeatTimeline`, `TempoReading`, `GridState`, `SectionState`, `SectionTick`, `SectionLog`, `SongSection`, `DrumKind`, `RhythmPattern`, `RhythmLabel`, the option types, ...).
- Later, the driver: `AudioFeed` (maybe renamed) owns one set of analysers and runs the frame order, with today's `window` reads as options; and the Web Audio side (`AudioSource`, `AudioStream`).

Internal (not exported): `BandTracker`, `thresholdDbFor`, the section features and model code, `TickRecorder`, `TickExtrasAccumulator`, `TempoChangeCue`, the beat net's layers, and the riser's and sweep's feature functions. The offline scripts in `scripts/section-eval` still reach them by relative path until they move into the package.

### The app's composition root

`src/audio.ts` builds the app's one set of analysers and exports it:

```ts
export type AudioAnalysis = { beatMonitor, tempoTracker, beatGrid, sectionTracker, drumHits, riserDetector, sweepDetector }
export const createAudioAnalysis = (): AudioAnalysis => ... // the grid on that tempo tracker, with BEAT_NET_MODEL
export const audioAnalysis = createAudioAnalysis()
```

`main.ts` passes it to `AudioFeed` and hangs its getters on `window` as before; `post-effects.ts` reads `sectionTracker`, `tempoTracker` and `drumHits` from it. Tests and scripts call `createAudioAnalysis()` (or build the classes themselves) for a fresh set.

## Phases to launch

Reconciled on 2026-11-12 with the earlier Claude Code sessions on this work (section grid training, model bands, drum hits, performance testing, the sprite-strip package) and `docs/experiments`. Those sessions recommended building the package around an **AudioWorklet** from the start (also `docs/experiments/madmom-benchmark.md` item 4 and the beat net plan); that and the items below were missing from the first version of this plan.

Each phase lands as its own PR or PRs. Refactor phases keep the equivalence golden unchanged; phases that change analysis on purpose (E, F, J) get an evaluation gate instead (datasets at several frame rates plus real-mic sessions), then a deliberate golden update.

- **A. Land the pure core** (this PR). Survey and plan, package skeleton, the pure analysis core moved, the equivalence check. Done; merge on the user's word.
- **B. Finish the core surface** (no behavior change). `RollReader` into the package; every model a constructor argument with the bundled default (drums, riser, sweep and rhythm load at module level today); one shared `mlp.ts`; an injected clock for `BeatMonitor`; detectors nobody reads are skipped (issue #302); the folder layout.
- **C. Listen recording onto main** (needs the merge order). Rebase `feat/listen-recording` after this PR; `tick-encoding.ts` into the package; the server imports `TICK_BYTES` and the version (`tsx --conditions=@fractaleyez/source` plus a Vercel check, or a `dist` build); room in the tick format for a source or clock flag.
- **D. Driver API and a TypeScript front end** (no app behavior change yet). `AudioFeed` becomes the package driver, with today's `window` reads as options and a `push(frame)` contract keyed to an audio clock, not to drawn frames; one pure TS front end (the five band filters matching Web Audio's biquads, RMS per band window, the 40-band spectrum pooling) that runs in the browser and in Node, with a parity check against `levels.py` and the current Web Audio levels; an offline API (PCM or levels in, readings out) and a Node example.
- **E. AudioWorklet capture.** A worklet runs the Phase D front end and posts fixed-hop frames (60 Hz matches training; 100 Hz would come with the retrain) to a Worker running the driver, with the main thread as fallback. Heavy, bursty work (beat net, section slots) stays off the audio thread; no SharedArrayBuffer at first (it needs COOP/COEP headers). A clean-room `AudioSource` (getUserMedia with AGC, noise suppression and echo cancellation off, as today). Fixes analysis that depends on the display frame rate and the quality tier's cap (30 fps sees a third of the audio, drum timing assumes 60 fps), the hidden-tab pause, and main-thread contention with the pop-out. Lag probe and detector delay recalibrated. Exit: accuracy at the fixed hop at least today's 60 fps numbers on the datasets, identical analysis at 30, 60 and 144 fps, analysis and recording continue with the tab hidden, then real-mic sessions.
- **F. Retire the starter-pack code.** `AudioAnalyser`, `AudioAnalysedData`, `AudioData`, `AudioSource`, `AudioStream`, `analyser.config` and the dead visualizer came from an unlicensed 2018 starter (credited in the README): they are replaced, not moved. Clean-room versions of what the visualizers read (energy, its average, multiband energy, the beat), with visual parity checked; the audit's quick wins (the `peakHistory` leak, the empty treble band, per-frame allocations) on the way.
- **G. section-eval into the package** (needs a public or private decision): `scripts/section-eval` to `packages/beatsense/training`, kept out of npm `files`, reviewed (fetchers, dataset paths and links) before any public mirror, or left out of it.
- **H. Budgets and tests.** A CPU budget (proposal: all analysis under 10 ms of CPU per second of audio on a mid laptop, the worklet under 0.3 ms per 128-sample quantum), `bench-cpu.mts` extended to drums, riser, sweep, the beat net and the front end; a bundle size budget and lazy loading of the section model; tests for the driver, front end and source.
- **I. Real-mic data loop** (alongside, after C). Live label buttons and hotkeys, the review page, a riser hotkey, every detector scored on recorded sessions, a few non-EDM sessions. Exit: 30 to 50 labelled songs.
- **J. Full retrain and the section net** (after E's inputs and I's labels). Beat net, drums, riser, sweep and sections retrained on worklet inputs; a section neural net against the trees on the user's songs; each model ships only if it beats the current one on held-out data and real-mic songs.
- **K. Attribution and model cards.** Decided 2026-11-12: MIT for the code and the trained weights, which ship with the package (no audio is included; training used band levels, features and labels). Left: complete `NOTICE` (the SSME citation), a model card per model (data, metrics, intended use), and the credits in the README. Raveform's labels are CC BY 4.0, so its credit is required.
- **L. Launch** (after K and the user's go). API review and freeze for 0.1.0; README quickstarts (browser mic through the worklet, Node file analysis), examples or a demo page, CHANGELOG; the `c0d3ster/beatsense` mirror, deploy key, mirror and publish matrix entries and the npm trusted publisher; drop `"private"`. Exit: `npm install beatsense` works in a fresh Vite app and in Node.

## Equivalence check

`src/audioanalysis/audio-feed.equivalence.test.ts` drives the real `AudioFeed` and `AudioAnalyser` frame by frame through about two and a half minutes of seeded synthetic audio at 60 fps: silence, then hats, a groove at 124 BPM, a buildup with a snare roll speeding up from quarters to sixteenths, a rising riser and a sweeping tone, a drop, a break, a groove at 140 BPM and silence again. Every frame it records the beat, the beat monitor's newest sample, the tempo reading, the grid's state and beat net activation, the section state, the drums' last hits, the riser and sweep scores; every half second the beat times, band onsets, rhythm name and label, the drum and roll hit lists and the newest section slot. At the end it replays the section tracker's recording through a fresh tracker tick by tick (what `replay-log.mts` does). All of it is hashed (SHA-256) and compared with `audio-feed.equivalence.golden.json`, which also keeps a coverage summary (beats, drum hits by kind, sections seen, tempo readings, peak riser and sweep scores) so it is visible what the input exercises.

The golden was recorded on main's code before anything moved, and the same test (only its imports changed) matches it after the move. Rerun with `pnpm vitest run src/audioanalysis/audio-feed.equivalence.test.ts`; `UPDATE_GOLDEN=1` rewrites the golden (only for an intended change in the analysis output). `SECTION_LOG_OUT=<file>` also writes the recording as a section log, which `scripts/section-eval/replay-log.mts` can replay to check the script before and after a move.

No real recordings are used: the datasets are on Google Drive and no exported section logs were local. Real songs through the mic remain the check that matters for analysis changes; this one only proves a refactor changed nothing.

## Status

Phase A is in (branch `feat/soundsense-package`, named before the package was renamed):

- Moved to `packages/beatsense/src`: `onset-bands`, `onset-detector`, `beat`, `tempo`, `tempo-tracker`, `tempo-change`, `beat-net`, `beat-grid`, `section-features`, `section-model`, `sections`, `tick-recorder`, `tick-extras`, `spectrum-reducer`, `drum-hits`, `riser`, `sweep`, `rhythm-pattern`, `section-log` (the format half of `section-export`), the seven model JSONs; to `packages/beatsense/test`: their fifteen test files and the four fixtures. The code moved as is, apart from the removed singletons, `BEAT_NET_MODEL` (the beat net import moved from `beat-grid.ts` to `beat-net.ts`) and `OnsetParams` now exported.
- `src/audio.ts` builds the app's set (`createAudioAnalysis`, `audioAnalysis`); `AudioFeed` takes it as its third constructor argument; `main.ts` and `post-effects.ts` read from it. `src/audioanalysis/section-export.ts` keeps only the browser download.
- Equivalence: the golden hashes recorded on main's code (a54f7d3) match after the move, and a section log written by the test replays through `replay-log.mts` to byte-identical output before and after. Changing one constant (the riser's `RISE_MS` by 1 ms) fails the check, so it does see the package code.
- Still in the app: `AudioFeed`, `AudioAnalyser` and `AudioAnalysedData`, `lag-estimate`, `lag-probe`, the dead `utility/analysed-data-visualizer.ts`, `src/audiostream/*`, `automode/roll-rate.ts`. Next is phase B.

## Open questions

- **License.** Decided: MIT, code and weights (`LICENSE`, `NOTICE` with the training data credits).
- **AudioWorklet threading and hop.** Worklet front end plus Worker analysis (recommended) or more on the audio thread; a 60 Hz hop (no retrain) or 100 Hz (with the retrain).
- **Mirror and name.** Create the `c0d3ster/beatsense` mirror now (it can stay private) or at launch; reserve the npm name early.
- **Starter-pack replacement timing.** Phase F in this effort, or later.
- **Model weights.** They ship with the package under MIT (decided). Still worth doing for strangers: every class takes its model as a constructor argument (today only `SectionTracker` and `BeatGrid` do; the drum, riser, sweep and rhythm models load at module level), phase B.
- **listen-recording.** Rebase it after this merges (see Overlap), or merge it first and rebase this branch.
- **section-eval move.** Into the package as `scripts/`, or its own private package next to it? It has Python and data paths, which a published package would not ship anyway (`files` is `dist` only).
- **Browser and node parts.** One entry means node consumers import the Web Audio classes too. That is fine as long as nothing touches `window` or `AudioContext` at import time (true today). A second entry (`beatsense/browser`) would break the one-entry rule, so only if needed.
- **Layout.** `src/` is flat (one barrel). Folders per area (onset, tempo, grid, sections, drums) would each need a barrel; worth it once the driver and Web Audio parts move in.
- **Clock.** `BeatMonitor` reads `performance.now()` when its beat times and band onsets are read. Fine in node and the browser; an injected clock would make offline replays independent of wall time (phase 6).
- **Docs.** The older plans and experiments in `docs/` still name `src/audioanalysis/...` paths; they describe past work and were left as they are.
