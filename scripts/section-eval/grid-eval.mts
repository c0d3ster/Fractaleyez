// Replays saved band levels through TempoTracker and BeatGrid and records every beat the grid fires (time, place in bar, place in phrase).
// Scored by grid-score.py against hand-marked beats and downbeats (the Ballroom set) or section starts.
//
//   tsx grid-eval.mts <levels dir> <out.json> [--fps 60] [--opts '{"latencyMs":20}'] [--tempo-opts '{}'] [--beat-net model.json] [--ids ids.txt]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { TempoTracker } from '../../packages/beatsense/src/tempo/tempo-tracker.ts'
import type { BeatNetModel } from '../../packages/beatsense/src/grid/beat-net.ts'
import { BeatGrid } from '../../packages/beatsense/src/grid/beat-grid.ts'
import { BANDS, SOURCE_FPS, loadLevels } from './stream.mts'

const args = process.argv.slice(2)
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1]! : fallback
}
const [dir, output] = [args[0]!, args[1]!]
const fps = Number(option('fps', '60'))
const gridOptions = JSON.parse(option('opts', '{}')) as Record<string, number>
const tempoOptions = JSON.parse(option('tempo-opts', '{}')) as Record<string, number>
const netPath = option('beat-net', '')
const beatNet = netPath ? (JSON.parse(readFileSync(netPath, 'utf8')) as BeatNetModel) : null
// --ids keeps only the tracks listed (one id a line), e.g. Raveform's held-out folds.
const idsPath = option('ids', '')
const only = idsPath ? new Set(readFileSync(idsPath, 'utf8').split(/\s+/).filter(Boolean)) : null

const runs: Array<{ id: string; beats: Array<[number, number, number]> }> = []
const ids = readdirSync(dir).filter((name) => name.endsWith('.f32')).map((name) => name.slice(0, -4)).filter((id) => !only || only.has(id)).sort()
for (const id of ids) {
  const frames = loadLevels(dir, id)
  const tempo = new TempoTracker(tempoOptions)
  const grid = new BeatGrid(tempo, gridOptions, beatNet)
  const count = frames.length / BANDS
  const step = SOURCE_FPS / fps
  const levels = new Array<number>(BANDS).fill(0)
  const beats: Array<[number, number, number]> = []
  for (let i = 0, k = 0; i < count; i += step, k++) {
    const f = Math.floor(i)
    for (let b = 0; b < BANDS; b++) levels[b] = frames[f * BANDS + b]!
    const t = k * (1000 / fps)
    tempo.push(t, levels)
    if (grid.push(t, levels)) {
      const state = grid.getState()
      if (state) beats.push([Math.round(state.lastBeatMs) / 1000, state.beatInBar, state.barInPhrase])
    }
  }
  runs.push({ id, beats })
}
writeFileSync(output, JSON.stringify({ fps, opts: gridOptions, runs }))
console.error(`${runs.length} tracks`)
