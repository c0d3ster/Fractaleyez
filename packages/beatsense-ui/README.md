# beatsense-ui

React HUDs for [beatsense](../beatsense), the real-time music analysis: what the analysers hear, drawn live on small canvases. They are
the HUDs of the Fractaleyez config window, split out so a standalone page can show the same thing. beatsense itself stays React-free (it
runs in Node too), so the HUDs live here.

Private for now, like beatsense. React 18 or 19 is a peer dependency.

## The HUDs

- **`BeatHud`**: a scrolling waveform of the five onset bands with the level each had to pass, the hits along the bottom, and the beat grid
  (beats, bars, 8-bar phrases) on a ruler on top. Above it the tempo and how steady the beats are; below it the rhythm name and the snare
  roll. Scroll to zoom, double-click to reset, click to flip between mirrored and growing up from the bottom (kept in localStorage).
- **`FrequencyHud`**: a bar per onset band (level, trigger level, a flash on the band that set off a beat), a light per drum the hit
  classifier names, and a riser meter. Clicking a band toggles whether it can set off a beat.
- **`SectionHud`**: the song's level over the last minute, colored by section (intro, groove, buildup, drop and so on), with the section
  name, the song time and the intensity.

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
and beatsense-ui, and will also be where recording (record and stop, live labels, hotkeys) goes.

```sh
pnpm lab         # from this folder or the repo root: Vite dev server on http://localhost:5180
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

The worklet is imported as `beatsense/worklet?worker&url`, so Vite bundles it on its own (one file in `lab:build`) and serves it as a
module in dev, with nothing but Vite's `/@vite/env` defines added (no HMR client, which would throw in a worklet scope). Vite resolves the
`@fractaleyez/source` condition (`vite.config.ts`), so the page compiles both packages from source and picks up edits on save.

The lab is outside `src`, so it is never in the package build or the published files. `pnpm typecheck` checks it with its own tsconfig
(`lab/tsconfig.json`, which adds Vite's client types) and `pnpm lint` covers it.

## Development

Developed in the [Fractaleyez](https://github.com/c0d3ster/Fractaleyez) monorepo under `packages/beatsense-ui`, next to beatsense, which
it resolves to source (the `@fractaleyez/source` condition). Locally: `pnpm install`, then `pnpm test`, `pnpm typecheck`, `pnpm lint` and
`pnpm build`, and `pnpm lab` for the lab page.
