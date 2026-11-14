# beatsense-ui

React HUDs for [beatsense](../beatsense), the real-time music analysis: what the analysers hear, drawn live on small canvases. They are
the HUDs of the Fractaleyez config window, split out so a standalone page can show the same thing. beatsense itself stays React-free (it
runs in Node too), so the HUDs live here.

Private for now, like beatsense. React 18 or 19 is a peer dependency.

## The HUDs

- **`BeatHud`**: a scrolling waveform of the five onset bands with the level each had to pass, the hits along the bottom, and the beat grid
  (beats, bars, 8-bar phrases) on a ruler on top. Above it the tempo and how steady the beats are; below it the rhythm name and the snare
  roll. Scroll to zoom, double-click to reset, click to flip between mirrored and growing up from the bottom (kept in localStorage). It
  takes an optional `onViewChange(viewMs)`, called on mount and whenever its zoom changes, for anything that should show the same window
  (the lab's live strip).
- **`FrequencyHud`**: a bar per onset band (level, trigger level, a flash on the band that set off a beat), a light per drum the hit
  classifier names, and a riser meter. Clicking a band toggles whether it can set off a beat.
- **`SectionHud`**: the song's level over the last minute, colored by section (intro, groove, buildup, drop and so on), with the section
  name, the song time and the intensity. The wheel zooms it from 30 s to 2 min (double-click resets), and marks along its bottom give
  the seconds ago (`agoTicks`: every 5 s at 30 s, 10 s at a minute, 20 s at two minutes).

Each imports its own stylesheet. In a bundler that compiles the source (the Fractaleyez app) that is an ordinary CSS import; the built
`dist/` has the CSS inlined and adds it to the page when the package is imported.

## Usage

```tsx
import { BeatHud, FrequencyHud, HudProvider, SectionHud, type AnalysisSource } from 'beatsense-ui'

// Built once, from the page's own analysers (classes from beatsense).
const source: AnalysisSource = {
  getBeatTimeline: beatMonitor.getTimeline,
  getBeatTimes: beatMonitor.getBeatTimes,
  getTempo: tempoTracker.getReading,
  getBeatGrid: beatGrid.getState,
  getDrumHits: drumHits.getLastHits,
  getRiser: riserDetector.getScore,
  getSweep: sweepDetector.getScore,
  getSongSection: sectionTracker.getState,
  getSectionHistory: sectionTracker.getHistory,
  getEnabledBands: () => enabledBands,
}

const Huds = (): React.ReactElement => (
  <HudProvider source={source}>
    <FrequencyHud enabledBands={enabledBands} onEnabledBandsChange={setEnabledBands} />
    <BeatHud />
    <SectionHud />
  </HudProvider>
)
```

## API

### `HudProvider`

Gives every HUD under it three things, all optional. Keep them stable (module constants, or memoized): a HUD subscribes again, and starts
its history over, when its source or ticker changes.

- `source: AnalysisSource`: what the HUDs read. Defaults to an empty source, which draws nothing.
- `ticker: Ticker`: what makes them draw. Defaults to `animationFrameTicker`.
- `hint: Hint`: how a HUD describes its parts. Defaults to `titleHint`.

`useHud()` returns the nearest provider's values, or the defaults without one.

### `AnalysisSource`

An object of getters, read on every tick. Each is optional; a HUD leaves out what it has no getter for, and a getter with nothing to report
yet returns null (or an empty list). The times they report are on the `now` clock.

| Getter | Returns | Read by |
| --- | --- | --- |
| `now` | the clock, ms (defaults to `performance.now()`) | all |
| `getBeatTimeline` | `BeatTimeline \| null` (`BeatMonitor.getTimeline`) | Beat, Frequency |
| `getBeatTimes` | `readonly number[]` (`BeatMonitor.getBeatTimes`) | Beat (consistency) |
| `getTempo` | `TempoReading \| null` (`TempoTracker.getReading`) | Beat (BPM) |
| `getBeatGrid` | `GridState \| null` (`BeatGrid.getState`) | Beat (ruler) |
| `getRhythmLabel` | `RhythmLabel \| null` (`RhythmLabeler.read`) | Beat |
| `getSnareRoll` | `RollLevel \| null` | Beat |
| `getDrumHits` | `Record<DrumKind, number \| null> \| null` (`DrumHits.getLastHits`) | Frequency (lights) |
| `getRiser`, `getSweep` | `number`, 0 to 1 (`RiserDetector`, `SweepDetector`) | Frequency (riser meter) |
| `getSongSection` | `SectionState \| null` (`SectionTracker.getState`) | Section |
| `getSectionHistory` | `readonly SectionSlot[]` (`SectionTracker.getHistory`) | Section |
| `getEnabledBands` | `readonly boolean[]`, the bands that can set off a beat (defaults to `DEFAULT_ENABLED_BANDS`) | Beat (dims the rest) |
| `getIgnoreMs` | the detector's ignore time after a hit, ms (defaults to 0) | Beat (shaded) |

### `Ticker`

`(listener: (now: number) => void, element?: Element) => () => void`: calls `listener` on each tick and returns the unsubscribe. `element`
is the HUD's canvas, so a ticker can skip a HUD that is off screen. `animationFrameTicker` runs one shared `requestAnimationFrame` loop
while any HUD is subscribed and ignores `element`. The Fractaleyez app passes its own: a slower shared tick whose rate follows the quality
tier and which skips HUDs scrolled out of view.

### `Hint`

`(text: string) => HintProps`: turns a description into props spread onto the element it describes (`title`, or pointer and focus
handlers). `titleHint` gives the browser's tooltip; the Fractaleyez app passes its info strip's hook result instead.

### `FrequencyHud` props

- `enabledBands: readonly boolean[]`: which bands can set off a beat, in `ONSET_BANDS` order.
- `onEnabledBandsChange: (enabledBands: boolean[]) => void`: called with the new selection when a band is clicked. The HUD is controlled:
  it shows the change once it comes back as `enabledBands`.

## Lab

A standalone page with the three HUDs on a live microphone, for working on beatsense without the Fractaleyez app. It uses only beatsense
and beatsense-ui. It records labelled sessions for scoring and retraining the detectors, and has a review page for fixing the labels.

```sh
pnpm lab         # from this folder or the repo root: Vite dev server on http://localhost:4000
pnpm lab:build   # a static build in lab/dist
```

Press Start (an audio context needs a click) and allow the microphone. The page then shows:

- A bar on top with the Start button and a status line: the sample rate, the frames a second actually arriving from the capture worklet
  (60 while the microphone feeds it), the microphone's state, and why a start failed (microphone denied or missing, the worklet failing to
  load).
- The Frequency and Beat HUDs side by side and the Section HUD across the bottom, as large as the window allows (their canvases keep
  their aspect ratio, so the block is capped to what fits the window's height). Their text scales with the window. The canvases draw at
  their fixed sizes (Beat 360 by 120, Frequency 180 by 142, Section 360 by 56) and are scaled up, so they look soft on a big window.

How it runs (`lab/labSession.ts`): an `AudioContext`, beatsense's `AudioSource` with the capture worklet, the microphone through a unity
gain into the worklet, and every frame pushed into an `AnalysisHost` on the page's thread, whose analysers the HUDs read. The analysis keeps
the audio clock (a frame's time is its sample count), so the HUDs' `now` is that clock too, estimated from `performance.now()` with the
same delivery-delay tracking as the app's frame clock. The snare roll is ticked on every frame and the rhythm name read on demand, as the
app does. The beat settings are beatsense's `DEFAULT_FEED_SETTINGS` (Ignore Time 250 ms); the band toggles are page state and are not
saved.

### Recording

Once the analysis runs, Record starts a session and Stop ends it (a new Record drops the last one, so export first). While recording:

- Every `FrameReading` the `AnalysisHost` gives is kept (60 a second), with each drum hit the drum model calls.
- The label buttons, or their hotkeys, add labels. The drum buttons sit under the Frequency HUD's drum lights, the song labels
  and the riser toggle under the Section HUD; Record, Stop, Undo and Export stay in the bar.
  A label is stamped at the audio clock's now (the newest audio delivered, so it lands where the hit was heard plus the reaction time,
  fixed on the review page). The keys: the drums as a block on `Q` kick, `W` snare, `A` clap, `S` hat; `R` riser, which
  starts a riser and ends it on the next press (the file keeps a riser start and a riser end label; the button says which is next); and
  the song labels on `1` intro, `2` buildup, `3` drop, `4` breakdown, `5` outro, in song order. Intro and outro are the tracker's own
  calls too, so labelling them shows where it calls an outro mid-song. Held keys, keys with Ctrl, Cmd or Alt, and typing in a field add
  nothing. Backspace (or Undo) removes the newest label.
- The live strip under the HUDs shows your labels against the model's as they happen, over the Beat HUD's window (6 s by default; it
  follows the Beat HUD's zoom from 2 to 16 s through `BeatHud`'s `onViewChange`, with seconds-ago marks along the bottom). Per drum, your
  labels on top and the model's hits below, a pair joined by a green line (a hit from 350 ms before the label to 100 ms after it, one to one, nearest first)
  and anything unpaired drawn hollow; then your section labels over the model's sections, and your riser spans over its riser score.
  Above it, a tally per drum (your labels, the model's hits, how many paired) and the median of label time minus hit time over every pair:
  how far behind the model you label, i.e. your reaction time. After Stop it holds the last window.

Export saves the stopped session as `beatsense-session-<date>-<time>.json`, version 1 of the format in `lab/recording/sessionFile.ts`:

| Field | What |
| --- | --- |
| `format`, `version` | `'beatsense-lab-session'`, `1`. A reader refuses other versions, and a change to the shape bumps it. |
| `recordedAt`, `editedAt` | When it stopped, and when the labels were last edited on the review page (absent before). ISO 8601. |
| `sampleRate` | The audio context's, Hz. |
| `startMs`, `endMs` | When Record and Stop were pressed, on the audio clock (ms; the same clock as everything below). |
| `frames` | Every `FrameReading`: `t`, the five band `levels`, `beat`, `beatBand`, `bpm`, `section`, `riser`, `sweep`. |
| `drumHits` | `{ kind, t }` per hit the drum model called, sorted by time. |
| `labels` | `{ id, kind, t }`, sorted by time; the id stays with a label through edits. |
| `sectionLog` | beatsense's `SectionLog` (version 2) with the section tracker's 50 ms ticks inside the session, for replaying through a fresh tracker (`SectionTracker.pushTick`, or `scripts/section-eval/replay-log.mts`). |

The **Review** link opens `review.html`: open or drop an exported session to see its timelines (the sections, the five band levels, the
beats colored by band, the drum model's hits per drum, the tempo, the riser and the sweep), with the labels as lines through every lane.
The wheel zooms around the pointer, dragging empty space pans and a double-click shows the whole session. Click a label to select it, drag
it to move it, the arrow keys nudge it a frame (Shift: 100 ms) and Delete removes it. Export saves the session with the edited labels
as `<name>-labelled.json`; the page asks before leaving with unsaved edits.

The recording logic is plain TypeScript in `lab/recording/` (labels and hotkeys, `SessionRecorder`, the file format, the label edits, the
plot geometry, the label-to-hit pairing in `compareDrums.ts` and the live strip's window in `liveView.ts`), tested in `test/lab/` with synthetic frames, including a run of the real `AnalysisHost` whose section log replays to the
same ticks.

### Build

The worklet is imported as `beatsense/worklet?worker&url`, so Vite bundles it on its own (one file in `lab:build`) and serves it as a
module in dev, with nothing but Vite's `/@vite/env` defines added (no HMR client, which would throw in a worklet scope). Vite resolves the
`@fractaleyez/source` condition (`vite.config.ts`), so the page compiles both packages from source and picks up edits on save.

`lab:build` builds both pages (`index.html` and `review.html`). The lab is outside `src`, so it is never in the package build or the published files. `pnpm typecheck` checks it with its own tsconfig
(`lab/tsconfig.json`, which adds Vite's client types) and `pnpm lint` covers it.

## Development

Developed in the [Fractaleyez](https://github.com/c0d3ster/Fractaleyez) monorepo under `packages/beatsense-ui`, next to beatsense, which
it resolves to source (the `@fractaleyez/source` condition). Locally: `pnpm install`, then `pnpm test`, `pnpm typecheck`, `pnpm lint` and
`pnpm build`, and `pnpm lab` for the lab page.
