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

After this PR, `sections.ts` and `tick-recorder.ts` live in `packages/beatsense/src/` and `section-export.test.ts` is `packages/beatsense/test/sections/section-log.test.ts`. A rebase of listen-recording carries most of its hunks to the new paths by rename detection, but expect hand conflicts in: `sections.ts` (its `push` change, near the removed singleton), `audio-feed.ts` (now takes its analysers as a constructor argument), `replay-log.mts` (import path), and the test (moved and renamed). `tick-encoding.ts` should then move into the package (it is the recording format, and the server should import it from there). The branch is also far behind main (it predates drum hits, riser, sweep and the beat net), so it needs that rebase regardless. Suggested order: merge this, then rebase listen-recording onto main and move `tick-encoding.ts` in as part of it.

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

Phases B to L are tracked as issues: B #310, C #311, D #312, E #313, F #314, G #315, H #316, I #317, J #318, K #319, L #320. Chains: B, D, E, F (H after D); C, I, J (J also needs E); K, L; G on its own.

- **A. Land the pure core** (this PR). Survey and plan, package skeleton, the pure analysis core moved, the equivalence check. Done; merge on the user's word.
- **B. Finish the core surface** (no behavior change). `RollReader` into the package; every model a constructor argument with the bundled default (drums, riser, sweep and rhythm load at module level today); one shared `mlp.ts`; an injected clock for `BeatMonitor`; detectors nobody reads are skipped (issue #302).
- **C. Listen recording onto main.** #306 merged first, so rebase `feat/listen-recording` onto main; `tick-encoding.ts` into the package; the server imports `TICK_BYTES` and the version (`tsx --conditions=@fractaleyez/source` plus a Vercel check, or a `dist` build); room in the tick format for a source or clock flag.
- **D. Driver API and a TypeScript front end** (no app behavior change yet). `AudioFeed` becomes the package driver, with today's `window` reads as options and a `push(frame)` contract keyed to an audio clock, not to drawn frames; one pure TS front end (the five band filters matching Web Audio's biquads, RMS per band window, the 40-band spectrum pooling) that runs in the browser and in Node, with a parity check against `levels.py` and the current Web Audio levels; an offline API (PCM or levels in, readings out) and a Node example.
- **E. AudioWorklet capture.** Decided 2026-11-12: the worklet does only the cheap measuring (the Phase D front end: the five band levels and the spectrum) and posts fixed-hop frames at 60 Hz, which matches training, to a Web Worker. The driver and the heavier detectors (beat net, sections, drums) run in the Worker, with the main thread as fallback. 100 Hz is left for the phase J retrain. Heavy, bursty work (beat net, section slots) stays off the audio thread; no SharedArrayBuffer at first (it needs COOP/COEP headers). A clean-room `AudioSource` (getUserMedia with AGC, noise suppression and echo cancellation off, as today). Fixes analysis that depends on the display frame rate and the quality tier's cap (30 fps sees a third of the audio, drum timing assumes 60 fps), the hidden-tab pause, and main-thread contention with the pop-out. Lag probe and detector delay recalibrated. Exit: accuracy at the fixed hop at least today's 60 fps numbers on the datasets, identical analysis at 30, 60 and 144 fps, analysis and recording continue with the tab hidden, then real-mic sessions.
- **F. Retire the starter-pack code.** `AudioAnalyser`, `AudioAnalysedData`, `AudioData`, `AudioSource`, `AudioStream`, `analyser.config` and the dead visualizer came from an unlicensed 2018 starter (credited in the README): they are replaced, not moved. Clean-room versions of what the visualizers read (energy, its average, multiband energy, the beat), with visual parity checked; the audit's quick wins (the `peakHistory` leak, the empty treble band, per-frame allocations) on the way.
- **G. section-eval into the package.** Decided 2026-11-12: public, so how the models are trained and scored is transparent. `scripts/section-eval` to `packages/beatsense/training`, kept out of npm `files`, reviewed (fetchers including `raveform-fetch.py`, dataset paths and links) before the public mirror.
- **H. Budgets and tests.** A CPU budget (proposal: all analysis under 10 ms of CPU per second of audio on a mid laptop, the worklet under 0.3 ms per 128-sample quantum), `bench-cpu.mts` extended to drums, riser, sweep, the beat net and the front end; a bundle size budget and lazy loading of the section model; tests for the driver, front end and source.
  - Status: done. `bench-cpu.mts` covers every analyser, the front end and the worklet quantum and prints PASS/FAIL against the budgets (`pnpm bench` in the package); `pnpm check-size` asserts the bundle sizes; the section model is a lazy chunk (`loadSectionModel`, `SectionTracker.setModel`, `analyze` is async). On the agent's machine the analysis total came out near 24 to 26 ms per second of audio (the beat net and the riser the largest) against the 10 ms proposal, and the worklet at 0.10 ms per quantum against 0.3: the analysis budget is to be confirmed or reset in review.
- **I. Real-mic data loop** (alongside, after C). Live label buttons and hotkeys, the review page, a riser hotkey, every detector scored on recorded sessions, a few non-EDM sessions. Exit: 30 to 50 labelled songs.
- **J. Full retrain and the section net** (after E's inputs and I's labels). Beat net, drums, riser, sweep and sections retrained on worklet inputs; a section neural net against the trees on the user's songs; each model ships only if it beats the current one on held-out data and real-mic songs.
- **K. Attribution and model cards.** Decided 2026-11-12: MIT for the code and the trained weights, which ship with the package (no audio is included; training used band levels, features and labels). Left: complete `NOTICE` (the SSME citation), a model card per model (data, metrics, intended use), and the credits in the README. Raveform's labels are CC BY 4.0, so its credit is required.
- **L. Launch** (after K and the user's go). API review and freeze for 0.1.0; README quickstarts (browser mic through the worklet, Node file analysis), examples or a demo page, CHANGELOG; the `c0d3ster/beatsense` mirror, deploy key, mirror and publish matrix entries and the npm trusted publisher; drop `"private"`. Exit: `npm install beatsense` works in a fresh Vite app and in Node.

## Equivalence check

`src/audioanalysis/audio-feed.equivalence.test.ts` drives the real `AudioFeed` and `AudioAnalyser` frame by frame through about two and a half minutes of seeded synthetic audio at 60 fps: silence, then hats, a groove at 124 BPM, a buildup with a snare roll speeding up from quarters to sixteenths, a rising riser and a sweeping tone, a drop, a break, a groove at 140 BPM and silence again. Every frame it records the beat, the beat monitor's newest sample, the tempo reading, the grid's state and beat net activation, the section state, the drums' last hits, the riser and sweep scores; every half second the beat times, band onsets, rhythm name and label, the drum and roll hit lists and the newest section slot. At the end it replays the section tracker's recording through a fresh tracker tick by tick (what `replay-log.mts` does). All of it is hashed (SHA-256) and compared with `audio-feed.equivalence.golden.json`, which also keeps a coverage summary (beats, drum hits by kind, sections seen, tempo readings, peak riser and sweep scores) so it is visible what the input exercises.

The golden was recorded on main's code before anything moved, and the same test (only its imports changed) matches it after the move. Rerun with `pnpm vitest run src/audioanalysis/audio-feed.equivalence.test.ts`; `UPDATE_GOLDEN=1` rewrites the golden (only for an intended change in the analysis output). `SECTION_LOG_OUT=<file>` also writes the recording as a section log, which `scripts/section-eval/replay-log.mts` can replay to check the script before and after a move.

No real recordings are used: the datasets are on Google Drive and no exported section logs were local. Real songs through the mic remain the check that matters for analysis changes; this one only proves a refactor changed nothing.

## Status

Phase A is merged (#306, branch `feat/soundsense-package`, named before the package was renamed):

- Moved to `packages/beatsense/src`: `onset-bands`, `onset-detector`, `beat`, `tempo`, `tempo-tracker`, `tempo-change`, `beat-net`, `beat-grid`, `section-features`, `section-model`, `sections`, `tick-recorder`, `tick-extras`, `spectrum-reducer`, `drum-hits`, `riser`, `sweep`, `rhythm-pattern`, `section-log` (the format half of `section-export`), the seven model JSONs; to `packages/beatsense/test`: their fifteen test files and the four fixtures. The code moved as is, apart from the removed singletons, `BEAT_NET_MODEL` (the beat net import moved from `beat-grid.ts` to `beat-net.ts`) and `OnsetParams` now exported.
- `src/audio.ts` builds the app's set (`createAudioAnalysis`, `audioAnalysis`); `AudioFeed` takes it as its third constructor argument; `main.ts` and `post-effects.ts` read from it. `src/audioanalysis/section-export.ts` keeps only the browser download.
- Equivalence: the golden hashes recorded on main's code (a54f7d3) match after the move, and a section log written by the test replays through `replay-log.mts` to byte-identical output before and after. Changing one constant (the riser's `RISE_MS` by 1 ms) fails the check, so it does see the package code.
- Still in the app: `AudioFeed`, `lag-estimate`, `lag-probe`, the dead `utility/analysed-data-visualizer.ts`, `src/audiostream/*`. Phases B and D are below; next is E.

Phase B is done (#310, plus #302's shared model code and unread-detector items), golden unchanged:

- `RollReader` and `rollLevel` moved to `packages/beatsense/src/drums/roll-rate.ts` (test beside the others). The `snareRoll` singleton is now `audioAnalysis.snareRoll` (`src/audio.ts`).
- Models are constructor arguments with the bundled default, and the defaults are exported: `DrumHits(onCandidate?, DRUM_HIT_MODEL)`, `RiserDetector(onSlot?, RISER_MODEL)`, `SweepDetector(onSlot?, SWEEP_MODEL)`, `RhythmLabeler(hold, options, RHYTHM_MODEL)`, and `readRhythm`, `nameRhythm`, `drumProbabilities`, `riserProbability` and `sweepProbability` take one as a last argument. `BeatGrid` (`BEAT_NET_MODEL`) and `SectionTracker` already did.
- `shared/mlp.ts` (barrel `shared/index.ts`, exported from the root): `dense`, `forward`, `standardize`, `inputIndexes`, `scoreProbability`, `fit`, `sigmoid`, float operation order unchanged. The beat net and sections use its `sigmoid`.
- `BeatMonitor(clock = () => performance.now())`: the read-time trims use the injected clock.
- Unread detectors: `AudioFeed` takes `{ readsRiserAndSweep }`. While it says no, the 40-band pooling, `RiserDetector` and `SweepDetector` are skipped, and they reset when it says yes again. The app passes a read watch on `window.getRiser` and `getSweep` (the Frequency HUD polls them each frame). The default is always on, so the equivalence test is unchanged. `DrumHits` keeps running: the snare roll reads it every frame.
- `section-log.test.ts`'s 45 minute test got a 30 s timeout (4.4 s alone, timed out under the parallel suite).

Phase D is done (#312), golden unchanged:

- Front end (`packages/beatsense/src/frontend/`, pure TypeScript, no DOM or Web Audio): `webAudioBiquad`/`Biquad` (levels.py's formulas), `BandLevels` (2 highpass and 2 lowpass stages per band, RMS over the band's window, percent of full scale), `SpectrumAnalyser` (Blackman FFT, smoothing, -100 to -30 dB bytes, and the energy) feeding `SpectrumReducer`, and `FrontEnd` combining them.
- Driver (`src/driver/`): `AudioFeed` moved into the package. The `window.config.audio` sliders, `window.enabledFreqBands` and `peakPersistency` are a `settings()` option read each frame, `readsRiserAndSweep` stays an option, and `push({ t, deltaMs, levels, energy, spectrum })` takes its time from the frame (audio clock), no `performance.now()`. `createAnalysers()` builds the set. The app's `AudioFeed` is a thin adapter (still wraps `AudioAnalyser` and `AudioStream`, and still stamps frames with `performance.now()` until the worklet in phase F gives it an audio clock).
- Offline: `analyze({ pcm, sampleRate } | { levels })` returns a reading per frame plus the analysers; `pnpm example` in the package runs `examples/node-example.mts`.
- Parity: `scripts/section-eval/levels-fixture.py` writes `test/frontend/levels-parity.json` from levels.py on a synthetic signal; the test rebuilds the signal in TypeScript and matches to 1e-4 relative. The band levels are checked against levels.py (which was written to match Web Audio); a live Web Audio capture has not been compared, and the spectrum bytes are an AnalyserNode imitation with no reference fixture.

Phase E is code-complete (#313), with the dataset evaluation, the real-mic recalibration and the golden sign-off still to do by hand:

- Worklet (`src/worklet/`): `FrameEmitter` runs the `FrontEnd` over each 128-sample quantum and cuts frames at a fixed 60 Hz hop, frame n ending at sample floor(n * rate / 60) (a quantum that straddles an end is split). A frame is packed into a `Float64Array` (`packFrame`/`unpackFrame`) and transferred, and its time is `n * 1000 / 60` ms on the sample clock (`toAudioFrame`). `processor.ts` registers `beatsense-capture`; it is its own bundle entry (`beatsense/worklet`, `dist/worklet.js`), not in the root export.
- Source (`src/source/`): clean-room `AudioSource({ context, workletUrl, getUserMedia? })`. `start()` loads the worklet and keeps its node muted in the graph, `connectMicrophone()` opens the microphone with AGC, noise suppression and echo cancellation off, `input` is the node to connect audio to, `onFrame` delivers frames from the worklet's port (so they keep coming with the tab hidden), and `setSpectrum(false)` stops the per-frame FFT while the riser and sweep are unread. Nothing touches a global until a method runs.
- Host (`src/host/`): `AnalysisHost` (driver plus analysers, frame in, `FrameReading` out, time from the frame), a typed message protocol (`ToWorker`/`FromWorker`), `serveAnalysis` (the Worker body; `beatsense/worker` is its bundle entry) and `createAnalysisClient(createWorker?)`, which returns the Worker client or, with no Worker or a failure to make one, the in-thread client. Tests show identical readings in a Worker and in-thread, and at 30, 60 and 144 fps hand-over cadences.
- App: `main.ts` makes the `AudioContext`, an `AudioSource` and the `AudioStream` (now only the volume, the analyser node for the visuals and the lag probe's click; the five onset-band filter chains and `getBandLevels` are gone). Every worklet frame goes to `AudioFeed.push`, which stamps it on the page clock (`FrameClock`: frame time plus a slow-tracking offset, so spacing stays steady) and runs the driver. `tick` is now only the visuals and carries the newest beat (a fresh beat is held until a draw reads it). The frame cap and quality tier no longer touch the analysis, and nothing pauses it with a hidden tab. The detector delay default is one figure (`DEFAULT_DETECTOR_MS = 15`, provisional) and the calibration is no longer per tier.
- Not done: the app runs the in-thread host (the HUDs read the analysers' objects directly), so the Worker path is built and tested but the app does not use it yet; that needs the analysers' state mirrored to the page. The worklet's frames go through the page to the host (no direct worklet-to-Worker port yet). There is no fallback where `AudioWorklet` is missing.
- Golden: re-recorded in its own commit. Frames now come from `push` at the fixed hop with the energy and spectrum measured per frame, not from the drawn frame's analyser reads.

Phase F is code-complete (#314), with visual parity, the dataset evaluation and the golden sign-off still to do by hand:

- The starter-pack files are gone: `AudioAnalyser`, `AudioAnalysedData` (and `Peak`), `AudioData`, `AudioStream`, `analyser.config`, the dead `utility/analysed-data-visualizer.ts`, and the README credit. They were replaced from the spec of what the visuals read, not from the old code.
- `VisualMeter` (`packages/beatsense/src/visuals/`): from the analyser node's bytes and the frame time it gives the energy (mean distance of the time-domain bytes from 128), its average over 2 s (time weighted), and 8 band levels. It allocates nothing per frame (one reading object, overwritten) and keeps no peak history, which removes the `peakHistory` leak. Peaks and the per-band averages and histories nobody read are dropped.
- The treble band: the old top band covered bins 196 to 256 (about 17 to 22 kHz), which a microphone leaves empty. The bands now split the spectrum up to 16 kHz (quadratic spacing, `maxHz`), so the Julia layer's treble input moves. Visual parity is therefore a human check, not a guarantee.
- App: `AudioSnapshot` (`audioanalysis/audio-snapshot.ts`: `energy`, `energyAverage`, `bands`, `beat`) replaces `AudioAnalysedDataForVisualization` and is one reused object per frame. `VisualTap` (`audioanalysis/visual-tap.ts`: volume, analyser node, test click) replaces `AudioStream`; `AudioFeed(source: ByteSource, analysis, options)` and `tick(deltaTime)` (no `Date`). The slider ranges are in `config/audio.config.ts`. `window.getAudioData` is gone (nothing read it).
- The equivalence golden now also hashes each frame's energy, average and bands (frames hash only; the analysers' output and the other hashes did not change).

## Open questions

- **License.** Decided: MIT, code and weights (`LICENSE`, `NOTICE` with the training data credits).
- **AudioWorklet threading and hop.** Decided: worklet front end plus Worker analysis, 60 Hz hop (no retrain). 100 Hz is optional with the phase J retrain.
- **Mirror and name.** Create the `c0d3ster/beatsense` mirror now (it can stay private) or at launch; reserve the npm name early.
- **Starter-pack replacement timing.** Phase F in this effort, or later.
- **Model weights.** They ship with the package under MIT (decided). Still worth doing for strangers: every class takes its model as a constructor argument (today only `SectionTracker` and `BeatGrid` do; the drum, riser, sweep and rhythm models load at module level), phase B.
- **listen-recording.** Decided: #306 merged first, so it rebases onto main (phase C).
- **section-eval move.** Decided: into the package as `training/`, public in the mirror. It has Python and data paths, which the npm package does not ship anyway (`files` is `dist` only).
- **Browser and node parts.** One entry means node consumers import the Web Audio classes too. That is fine as long as nothing touches `window` or `AudioContext` at import time (true today). A second entry (`beatsense/browser`) would break the one-entry rule, so only if needed.
- **Layout.** Decided 2026-11-12: area folders, each with an `index.ts` barrel that the root `src/index.ts` re-exports (`onset`, `tempo`, `grid`, `sections`, `drums`, `risers`, `rhythm`; a model JSON sits next to its module), tests mirrored under `test/`. New parts get their own folder (`shared/` for `mlp.ts` in phase B, then the driver, front end and worklet).
- **Clock.** `BeatMonitor` reads `performance.now()` when its beat times and band onsets are read. Fine in node and the browser; an injected clock would make offline replays independent of wall time (phase 6).
- **Docs.** The older plans and experiments in `docs/` still name `src/audioanalysis/...` paths; they describe past work and were left as they are.
