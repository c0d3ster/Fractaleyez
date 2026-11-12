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

## Offline and Node

`analyze` runs a whole recording through the front end and the driver: mono PCM (or band levels a frame) in, a reading per frame out (time, beat, tempo, section, riser and sweep scores), plus the analysers for everything else.

```ts
import { analyze } from 'beatsense'

const { frames, analysers } = await analyze({ pcm, sampleRate: 44100 }) // pcm: Float32Array, -1..1
const beats = frames.filter(({ beat }) => beat).map(({ t }) => t)
```

For live audio, build the set with `createAnalysers()`, wrap it in `AudioFeed` (the driver) and call `push({ t, deltaMs, levels, energy, spectrum })` once per frame, `t` on the audio clock. Its beat settings and the riser/sweep read switch are options (functions, read each frame), not globals. The pure TypeScript `FrontEnd` turns PCM into those levels, energy and the 40-band spectrum, in the browser or Node; it matches the Web Audio chain `AudioStream` builds (2 highpass and 2 lowpass biquads a band, RMS over the band's window) and `scripts/section-eval/levels.py` to 1e-4 relative (`test/frontend`, fixture from `scripts/section-eval/levels-fixture.py`). Not yet checked against a live Web Audio capture.

The section model (about 290 KB of trees) is a lazy chunk, so the ESM entry stays small: `createAnalysers()` starts loading it, its `sectionTracker` idles (state `quiet`) until it arrives, and `analysers.sectionModelReady` resolves then (`analyze` awaits it). To build a `SectionTracker` yourself, pass it `await loadSectionModel()`. The CJS and worker bundles inline it.

`pnpm example` runs `examples/node-example.mts`, a synthetic 120 bpm track generated in code. `pnpm build && pnpm check-size` asserts the bundle sizes and the lazy chunk; `pnpm bench` times every analyser, the front end and a worklet quantum against the CPU budgets (10 ms of CPU per second of audio for the analysis, 0.3 ms per 128-sample quantum), on a synthetic track or a levels directory.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build   # dist/ (ESM, CJS and types)
```

Inside Fractaleyez the app compiles the package from `src/` through the `@fractaleyez/source` export condition, so there is no build step there.
