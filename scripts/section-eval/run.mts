// Replays saved band levels (levels.py, raw float32 frames x 5 at 60 fps) through the real OnsetDetector and a section tracker,
// and writes the tracker's section every 250 ms. Batch mode, so hundreds of songs run in one process.
//
//   tsx run.mts <levels dir> <out.json> [--tracker ../../src/audioanalysis/sections.ts] [--only id,id] [--fps 60]
//   tsx run.mts <levels dir> <out.json> --playlist <playlist.json>
//   tsx run.mts <levels dir> <out.json> --tuning '{"turnaroundDropThreshold":0.15}'   (decoder overrides, see SectionTuning)
//   tsx run.mts <levels dir> <out.json> --fold-models <dir> [--folds folds.json]   (dir/fold<n>.json; each song is run through the model of the
//     fold that held it out: id mod 5, or its fold in folds.json, { id: fold })
//
// The tracker is fed a BeatGrid's state every frame (a TempoTracker and BeatGrid on the same levels, in AudioFeed's order); --no-grid leaves it out.
//
// A playlist file is [{ "songs": ["id", ...], "gapSeconds": 2, "crossfadeSeconds": 0 }, ...]: each entry is played as one stream, the songs
// back to back with that much silence (or that much overlap, mixed in power) between them, the way a streaming app plays an album. An entry
// can play part of each song ("segments": [{ "fromSeconds", "toSeconds" }], a song cut off mid-track) and carry "joins" for score.py
// (make-playlists.py writes both).
//   --no-tempo     the tracker gets no BPM (the tempo-change cue off), for before and after numbers
//   --shard k/n    every n-th stream from the k-th, to split a run over processes
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { ONSET_BANDS, DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'
import { TempoTracker } from '../../src/audioanalysis/tempo-tracker.ts'
import { Segment, joinSongs, loadLevels } from './stream.mts'
import { BeatGrid, GridState } from '../../src/audioanalysis/beat-grid.ts'

type Tracker = {
  push: (sample: { t: number; levels: readonly number[]; beat: boolean; bpm?: number | null; grid?: GridState | null }) => void
  getState: () => { section: string; songIndex: number; songMs: number | null; intensity: number; dropCount?: number }
}

const args = process.argv.slice(2)
const option = (name: string, fallback: string | null = null): string | null => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [dir, output] = [args[0]!, args[1]!]
const trackerPath = resolve(option('tracker', '../../src/audioanalysis/sections.ts')!)
const fps = Number(option('fps', '60'))
// --smoothed feeds the tracker the onset detector's 20 ms followed levels instead of the raw band levels (what AudioFeed used to pass).
const smoothed = args.includes('--smoothed')
const { SectionTracker } = (await import(pathToFileURL(trackerPath).href)) as { SectionTracker: new (model?: unknown, tuning?: unknown) => Tracker }
// Decoder overrides (SectionTuning), as JSON: --tuning '{"turnaroundDropThreshold":0.15}'
const tuning = JSON.parse(option('tuning', '{}')!) as unknown
const foldDir = option('fold-models')
const foldModels = foldDir ? [0, 1, 2, 3, 4].map((f) => JSON.parse(readFileSync(join(foldDir, `fold${f}.json`), 'utf8')) as unknown) : null
const foldsPath = option('folds')
const folds = foldsPath ? (JSON.parse(readFileSync(foldsPath, 'utf8')) as Record<string, number>) : null
const foldOf = (id: string): number => folds?.[id] ?? Number(id) % 5
const useGrid = !args.includes('--no-grid')
const trackerFor = (id: string): Tracker => new SectionTracker(foldModels ? foldModels[foldOf(id)] : undefined, tuning)

const BANDS = ONSET_BANDS.length
const SOURCE_FPS = 60
const load = (id: string): Float32Array => loadLevels(dir, id)
// --no-tempo leaves the shown BPM out of the samples, which turns the tempo-change cue off (the tracker as it was before it).
const withTempo = !args.includes('--no-tempo')
// --shard k/n runs every n-th stream from the k-th, so a long run can be split over processes (score.py takes the outputs comma-separated).
const [shard, shards] = (option('shard', '0/1')!).split('/').map(Number) as [number, number]

type Run = {
  id: string; seconds: number; starts: number[]; sections: string[]; songs: number[]; clock: Array<number | null>; intensity: number[]
  /** Drop events (s), when the tracker reports them (dropCount going up). */
  drops?: number[]
  /** The BPM the tempo tracker showed at each slot (null for none). */
  bpm: Array<number | null>
  /** Playlist entries: what joined each song to the one before (the playlist file's `joins`, passed through for score.py). */
  joins?: unknown[]
  fold?: number
}

const runStream = (id: string, frames: Float32Array, starts: number[], tracker: Tracker = trackerFor(id)): Run => {
  const detector = new OnsetDetector(BANDS)
  const tempo = new TempoTracker()
  const grid = new BeatGrid(tempo)
  const count = frames.length / BANDS
  const step = SOURCE_FPS / fps
  const frameMs = 1000 / fps
  const run: Run = { id, seconds: count / SOURCE_FPS, starts, sections: [], songs: [], clock: [], intensity: [], bpm: [] }
  let nextSlot = 250
  let lastDrops = 0
  let lastSong = 1
  const levels = new Array<number>(BANDS).fill(0)
  for (let i = 0, k = 0; i < count; i += step, k++) {
    const f = Math.floor(i)
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = k * frameMs
    const onset = detector.update(levels, frameMs, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
    // The same order as AudioFeed: the tempo tracker sees the frame first, and the section tracker gets the BPM it now shows.
    tempo.push(t, levels)
    if (useGrid) grid.push(t, levels)
    const bpm = withTempo ? tempo.getBpm() : undefined
    tracker.push({ t, levels: smoothed ? onset.bands.map(({ level }) => level) : levels, beat: onset.analysisBeat, bpm, grid: useGrid ? grid.getState() : null })
    while (t >= nextSlot) {
      const state = tracker.getState()
      run.sections.push(state.section)
      run.songs.push(state.songIndex)
      run.clock.push(state.songMs === null ? null : Math.round(state.songMs / 100) / 10)
      run.intensity.push(Math.round(state.intensity * 100) / 100)
      const shown = tempo.getBpm()
      run.bpm.push(shown === null ? null : Math.round(shown * 10) / 10)
      if (state.dropCount !== undefined) {
        run.drops ??= []
        if (state.dropCount > lastDrops || (state.songIndex !== lastSong && state.dropCount > 0)) run.drops.push(nextSlot / 1000)
        lastDrops = state.dropCount
        lastSong = state.songIndex
      }
      nextSlot += 250
    }
  }
  return run
}

const started = Date.now()
const runs: Run[] = []
const playlistPath = option('playlist')
if (playlistPath) {
  type Playlist = { songs: string[]; gapSeconds?: number; crossfadeSeconds?: number; segments?: Segment[]; joins?: unknown[]; fold?: number }
  const playlists = JSON.parse(readFileSync(playlistPath, 'utf8')) as Playlist[]
  playlists.forEach((list, i) => {
    if (i % shards !== shard) return
    const { frames, starts } = joinSongs(list.songs.map(load), list.gapSeconds ?? 0, list.crossfadeSeconds ?? 0, list.segments)
    const run = runStream(`playlist-${i}`, frames, starts, new SectionTracker(foldModels ? foldModels[foldOf(list.songs[0]!)] : undefined, tuning))
    if (list.joins) run.joins = list.joins
    if (list.fold !== undefined) run.fold = list.fold
    runs.push(run)
  })
} else {
  const only = option('only')?.split(',')
  const ids = only ?? readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
  ids.forEach((id, i) => {
    if (i % shards === shard) runs.push(runStream(id, load(id), [0]))
  })
}
writeFileSync(output, JSON.stringify({ tracker: trackerPath, fps, runs }))
const audioSeconds = runs.reduce((sum, run) => sum + run.seconds, 0)
console.error(`${runs.length} streams, ${(audioSeconds / 60).toFixed(0)} min of audio in ${((Date.now() - started) / 1000).toFixed(1)} s`)
