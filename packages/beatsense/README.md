# beatsense

Real-time music analysis from five band levels a frame: the beat (a drum onset), tempo, the bar and phrase grid, song sections (intro, groove, buildup, drop, break, outro), drum hits, risers and sweeps, and rhythm names.

MIT licensed, code and trained models (see LICENSE and NOTICE for the training data credits). Private for now and not published until launch. See `docs/implementation-plans/beatsense-package.md` in the Fractaleyez repo for the plan and the API.

## Use

Everything is a named export of `beatsense`; there are no other entry points. The package exports classes and creates no instances of its own, so a caller builds the set it needs:

```ts
import { BEAT_NET_MODEL, BeatGrid, SectionTracker, TempoTracker } from 'beatsense'

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
