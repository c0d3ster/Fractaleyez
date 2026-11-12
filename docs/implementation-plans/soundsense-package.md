# soundsense: the audio package

## Context

All of the app's audio code moves out of `src/` into its own pnpm workspace package, `packages/soundsense`, so audio analysis and the visualizer are cleanly split and the audio side has a surface designed as a public API (see the memory note on the split). The name `soundsense` is free on npm (the first idea, SoundWorks, is IRCAM's framework).

The package follows `packages/sprite-strip`: the app depends on it as `workspace:*`, its `exports` has an `@fractaleyez/source` condition pointing at `src/index.ts` (webpack `resolve.conditionNames`, tsc `customConditions` and the root vitest config use it, so the app compiles it from source with no build step), and it keeps its own eslint, vitest, tsconfig and tsup. Unlike sprite-strip it is `"private": true`, with `"license": "UNLICENSED"`, and it is not in `mirror-packages.yml` or `publish-packages.yml`: whether the trained model weights can ship publicly is unresolved (see Open questions).

Rules for the surface:

- One entry. `exports` has only `"."`, so nothing outside the package can import `soundsense/src/...`. Everything a consumer needs is a named export of `src/index.ts`.
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

After this PR, `sections.ts` and `tick-recorder.ts` live in `packages/soundsense/src/` and `section-export.test.ts` is `packages/soundsense/test/section-log.test.ts`. A rebase of listen-recording carries most of its hunks to the new paths by rename detection, but expect hand conflicts in: `sections.ts` (its `push` change, near the removed singleton), `audio-feed.ts` (now takes its analysers as a constructor argument), `replay-log.mts` (import path), and the test (moved and renamed). `tick-encoding.ts` should then move into the package (it is the recording format, and the server should import it from there). The branch is also far behind main (it predates drum hits, riser, sweep and the beat net), so it needs that rebase regardless. Suggested order: merge this, then rebase listen-recording onto main and move `tick-encoding.ts` in as part of it.

## Public API

The target surface once every phase is done. Everything is a named export of `soundsense`.

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

## Phases

Each phase is its own commit or commits, with the app's behavior unchanged.

1. **Survey and plan** (this doc). This PR.
2. **Package skeleton**: `packages/soundsense` with `package.json` (private, one entry with the source condition and the `dist` files), tsconfig, tsup, eslint and vitest configs like sprite-strip's, an `index.ts` barrel, the app depending on it as `workspace:*`. This PR.
3. **The pure analysis core**: every module in the first table except `roll-rate.ts`, with the model JSONs, their tests (into `test/`, as in sprite-strip) and the test fixtures. The singletons become `src/audio.ts`; `AudioFeed` takes the set as a constructor argument. `section-export.ts` splits: the format (`buildSectionLog`, `SectionLog`) moves as `section-log.ts`, the browser download stays in the app. The scripts and the Python trainers point at the new paths. This PR.
4. **Equivalence check**: recorded before phase 3, rerun after it (see below). This PR.
5. **Snare roll**: `roll-rate.ts` (`RollReader`) into the package, `snareRoll` into `src/audio.ts`. `automode/` keeps only the visual side.
6. **The driver**: `AudioFeed` into the package. Its `window` reads become options: `{ enabledBands: () => boolean[], sensitivity: () => number, ignoreMs: () => number, decayMs: number }`, plus a `now` clock (today `performance.now()`) and its analyser set. The older `AudioAnalyser` either moves with it (its `window.config.audio` reads and `analyserConfig` as options, `userConfig` log flags dropped or passed in) or stays in the app and hands the feed its energy; `AudioAnalysedDataForVisualization` is the visualizer's type and may stay in the app. Then BeatMonitor takes the same clock.
7. **Web Audio**: `AudioSource`, `AudioStream`, `AudioData`. The lag probe's pure parts can go with them; `DetectorCalibration` takes its storage (it already does) and the tier-keyed defaults stay in the app.
8. **Listen recording and the server**: after `feat/listen-recording` lands, `tick-encoding.ts` moves in and the server's tick-format check imports `TICK_BYTES` and the version from `soundsense`. The server runs under `tsx` and Vercel's bundler, which do not know the source condition: either `tsx --conditions=@fractaleyez/source` plus a Vercel check, or the server builds against `dist` (a build step before `server-dev` and in `vercel.json`). To decide then.
9. **section-eval**: `scripts/section-eval` (TypeScript and Python, with its README and `DRUM-HITS.md`) into the package (for example `packages/soundsense/scripts`), importing from `../src`. The trainers' output paths follow.
10. **Publishing**, once the open questions are settled: license, README, a mirror and publish matrix entry.

## Equivalence check

`src/audioanalysis/audio-feed.equivalence.test.ts` drives the real `AudioFeed` and `AudioAnalyser` frame by frame through about two and a half minutes of seeded synthetic audio at 60 fps: silence, then hats, a groove at 124 BPM, a buildup with a snare roll speeding up from quarters to sixteenths, a rising riser and a sweeping tone, a drop, a break, a groove at 140 BPM and silence again. Every frame it records the beat, the beat monitor's newest sample, the tempo reading, the grid's state and beat net activation, the section state, the drums' last hits, the riser and sweep scores; every half second the beat times, band onsets, rhythm name and label, the drum and roll hit lists and the newest section slot. At the end it replays the section tracker's recording through a fresh tracker tick by tick (what `replay-log.mts` does). All of it is hashed (SHA-256) and compared with `audio-feed.equivalence.golden.json`, which also keeps a coverage summary (beats, drum hits by kind, sections seen, tempo readings, peak riser and sweep scores) so it is visible what the input exercises.

The golden was recorded on main's code before anything moved, and the same test (only its imports changed) matches it after the move. Rerun with `pnpm vitest run src/audioanalysis/audio-feed.equivalence.test.ts`; `UPDATE_GOLDEN=1` rewrites the golden (only for an intended change in the analysis output). `SECTION_LOG_OUT=<file>` also writes the recording as a section log, which `scripts/section-eval/replay-log.mts` can replay to check the script before and after a move.

No real recordings are used: the datasets are on Google Drive and no exported section logs were local. Real songs through the mic remain the check that matters for analysis changes; this one only proves a refactor changed nothing.

## Open questions

- **License.** Undecided; the package is `UNLICENSED` and private until then.
- **Model weights.** The section model is trained on SSME's Creative Commons tracks (some NonCommercial) and Raveform; the beat net, grid cues, drum, riser and sweep models on Raveform and SSME too. Can they ship publicly, and under what terms? If not, the weights could live in a separate (private) package or be fetched, and every class would take its model as a constructor argument (today only `SectionTracker` and `BeatGrid` do; the drum, riser, sweep and rhythm models load at module level).
- **listen-recording.** Rebase it after this merges (see Overlap), or merge it first and rebase this branch.
- **section-eval move.** Into the package as `scripts/`, or its own private package next to it? It has Python and data paths, which a published package would not ship anyway (`files` is `dist` only).
- **Browser and node parts.** One entry means node consumers import the Web Audio classes too. That is fine as long as nothing touches `window` or `AudioContext` at import time (true today). A second entry (`soundsense/browser`) would break the one-entry rule, so only if needed.
- **Layout.** `src/` is flat (one barrel). Folders per area (onset, tempo, grid, sections, drums) would each need a barrel; worth it once the driver and Web Audio parts move in.
- **Clock.** `BeatMonitor` reads `performance.now()` when its beat times and band onsets are read. Fine in node and the browser; an injected clock would make offline replays independent of wall time (phase 6).
- **Docs.** The older plans and experiments in `docs/` still name `src/audioanalysis/...` paths; they describe past work and were left as they are.
