# soundsense

Real-time music analysis from five band levels a frame: the beat (a drum onset), tempo, the bar and phrase grid, song sections (intro, groove, buildup, drop, break, outro), drum hits, risers and sweeps, and rhythm names.

Private for now and not published: the license is undecided, and whether the trained models can ship publicly is still open (they are trained on Creative Commons tracks, some NonCommercial, and on Raveform). See `docs/implementation-plans/soundsense-package.md` in the Fractaleyez repo for the plan and the API.

## Use

Everything is a named export of `soundsense`; there are no other entry points. The package exports classes and creates no instances of its own, so a caller builds the set it needs:

```ts
import { BEAT_NET_MODEL, BeatGrid, SectionTracker, TempoTracker } from 'soundsense'

const tempo = new TempoTracker()
const grid = new BeatGrid(tempo, {}, BEAT_NET_MODEL)
const sections = new SectionTracker()

// Every frame, with the five onset band levels (RMS, percent of full scale) and the time in ms:
tempo.push(now, levels)
grid.push(now, levels)
sections.push({ t: now, levels, beat, bpm: tempo.getBpm() })
```

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build   # dist/ (ESM, CJS and types)
```

Inside Fractaleyez the app compiles the package from `src/` through the `@fractaleyez/source` export condition, so there is no build step there.
