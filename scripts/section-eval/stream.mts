// Loading saved band levels (levels.py) and joining songs into one stream, the way a player or a DJ would play them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BANDS = 5
export const SOURCE_FPS = 60

export const loadLevels = (dir: string, id: string): Float32Array => {
  const buffer = readFileSync(join(dir, `${id}.f32`))
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

/** Songs back to back with `gapSeconds` of silence between them, or overlapping by `crossfadeSeconds` (linear fades, mixed in power). `starts` is where each song's audio begins, in seconds. */
export const joinSongs = (songs: Float32Array[], gapSeconds: number, crossfadeSeconds: number): { frames: Float32Array; starts: number[] } => {
  const gap = Math.round(gapSeconds * SOURCE_FPS)
  const fade = Math.round(crossfadeSeconds * SOURCE_FPS)
  const lengths = songs.map((song) => song.length / BANDS)
  const total = lengths.reduce((sum, n) => sum + n, 0) + (gap - fade) * (songs.length - 1)
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
