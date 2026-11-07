// Replays saved band levels (levels.py, raw float32 frames x 5 at 60 fps) through the real OnsetDetector and a section tracker,
// and writes the tracker's section every 250 ms. Batch mode, so hundreds of songs run in one process.
//
//   tsx run.mts <levels dir> <out.json> [--tracker ../../src/audioanalysis/sections.ts] [--only id,id] [--fps 60]
//   tsx run.mts <levels dir> <out.json> --playlist <playlist.json>
//   tsx run.mts <levels dir> <out.json> --tuning '{"turnaroundDropThreshold":0.15}'   (decoder overrides, see SectionTuning)
//   tsx run.mts <levels dir> <out.json> --fold-models <dir>   (dir/fold<n>.json; each song is run through the model of the fold that held it out, id mod 5)
//
// A playlist file is [{ "songs": ["id", ...], "gapSeconds": 2, "crossfadeSeconds": 0 }, ...]: each entry is played as one stream, the songs
// back to back with that much silence (or that much overlap, mixed in power) between them, the way a streaming app plays an album.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { ONSET_BANDS, DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'

type Tracker = {
  push: (sample: { t: number; levels: readonly number[]; beat: boolean }) => void
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
const { SectionTracker } = (await import(pathToFileURL(trackerPath).href)) as { SectionTracker: new (model?: unknown, tuning?: unknown) => Tracker }
// Decoder overrides (SectionTuning), as JSON: --tuning '{"turnaroundDropThreshold":0.15}'
const tuning = JSON.parse(option('tuning', '{}')!) as unknown
const foldDir = option('fold-models')
const foldModels = foldDir ? [0, 1, 2, 3, 4].map((f) => JSON.parse(readFileSync(join(foldDir, `fold${f}.json`), 'utf8')) as unknown) : null
const trackerFor = (id: string): Tracker => new SectionTracker(foldModels ? foldModels[Number(id) % 5] : undefined, tuning)

const BANDS = ONSET_BANDS.length
const SOURCE_FPS = 60
const load = (id: string): Float32Array => {
  const buffer = readFileSync(join(dir, `${id}.f32`))
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

// Joins songs into one stream of frames: silence between them, or an equal-power crossfade.
const joinSongs = (ids: string[], gapSeconds: number, crossfadeSeconds: number): { frames: Float32Array; starts: number[] } => {
  const songs = ids.map(load)
  const gap = Math.round(gapSeconds * SOURCE_FPS)
  const fade = Math.round(crossfadeSeconds * SOURCE_FPS)
  const lengths = songs.map((song) => song.length / BANDS)
  const total = lengths.reduce((sum, n) => sum + n, 0) + gap * (songs.length - 1) - fade * (songs.length - 1)
  const power = new Float64Array(total * BANDS)
  const starts: number[] = []
  let at = 0
  songs.forEach((song, s) => {
    starts.push(at / SOURCE_FPS)
    const n = lengths[s]!
    for (let f = 0; f < n; f++) {
      const fadeIn = s > 0 && fade > 0 && f < fade ? f / fade : 1
      const fadeOut = s < songs.length - 1 && fade > 0 && f >= n - fade ? (n - f) / fade : 1
      const gain = fadeIn * fadeOut
      for (let b = 0; b < BANDS; b++) power[(at + f) * BANDS + b]! += (song[f * BANDS + b]! * gain) ** 2
    }
    at += n + gap - fade
  })
  return { frames: Float32Array.from(power, Math.sqrt), starts }
}

type Run = {
  id: string; seconds: number; starts: number[]; sections: string[]; songs: number[]; clock: Array<number | null>; intensity: number[]
  /** Drop events (s), when the tracker reports them (dropCount going up). */
  drops?: number[]
}

const runStream = (id: string, frames: Float32Array, starts: number[], tracker: Tracker = trackerFor(id)): Run => {
  const detector = new OnsetDetector(BANDS)
  const count = frames.length / BANDS
  const step = SOURCE_FPS / fps
  const frameMs = 1000 / fps
  const run: Run = { id, seconds: count / SOURCE_FPS, starts, sections: [], songs: [], clock: [], intensity: [] }
  let nextSlot = 250
  let lastDrops = 0
  let lastSong = 1
  const levels = new Array<number>(BANDS).fill(0)
  for (let i = 0, k = 0; i < count; i += step, k++) {
    const f = Math.floor(i)
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = k * frameMs
    const onset = detector.update(levels, frameMs, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
    tracker.push({ t, levels, beat: onset.beatBand !== null })
    while (t >= nextSlot) {
      const state = tracker.getState()
      run.sections.push(state.section)
      run.songs.push(state.songIndex)
      run.clock.push(state.songMs === null ? null : Math.round(state.songMs / 100) / 10)
      run.intensity.push(Math.round(state.intensity * 100) / 100)
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
  const playlists = JSON.parse(readFileSync(playlistPath, 'utf8')) as Array<{ songs: string[]; gapSeconds?: number; crossfadeSeconds?: number }>
  playlists.forEach((list, i) => {
    const { frames, starts } = joinSongs(list.songs, list.gapSeconds ?? 0, list.crossfadeSeconds ?? 0)
    runs.push(runStream(`playlist-${i}`, frames, starts, new SectionTracker(foldModels ? foldModels[Number(list.songs[0]) % 5] : undefined, tuning)))
  })
} else {
  const only = option('only')?.split(',')
  const ids = only ?? readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).sort()
  ids.forEach((id) => runs.push(runStream(id, load(id), [0])))
}
writeFileSync(output, JSON.stringify({ tracker: trackerPath, fps, runs }))
const audioSeconds = runs.reduce((sum, run) => sum + run.seconds, 0)
console.error(`${runs.length} streams, ${(audioSeconds / 60).toFixed(0)} min of audio in ${((Date.now() - started) / 1000).toFixed(1)} s`)
