// Replays a log exported from the running app (`exportSectionLog()` in the console) through the current SectionTracker, tick by tick,
// exactly as it ran live, and writes the same per-slot JSON as run.mts (one stream), so chart.py and score.py can read it.
//
//   tsx replay-log.mts <section-log.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { SectionTick, SectionTracker } from '../../src/audioanalysis/sections.ts'

const [input, output] = [process.argv[2]!, process.argv[3]!]
const log = JSON.parse(readFileSync(input, 'utf8')) as { version: number; ticks?: SectionTick[] }
if (log.version !== 2 || !log.ticks) throw new Error('only version 2 logs (50 ms ticks) can be replayed; version 1 held 250 ms slots')
const first = log.ticks[0]?.t ?? 0
const tracker = new SectionTracker()
const run = { id: 'log', seconds: 0, starts: [0], sections: [] as string[], songs: [] as number[], clock: [] as Array<number | null>, intensity: [] as number[], drops: [] as number[] }
let slots = 0
let lastDrops = 0
for (const tick of log.ticks) {
  tracker.pushTick(tick)
  if (tracker.getHistory().length === 0) continue
  const closed = tracker.getHistory()[tracker.getHistory().length - 1]!
  if (closed.t !== tick.t) continue
  const state = tracker.getState()
  slots++
  run.sections.push(state.section)
  run.songs.push(state.songIndex)
  run.clock.push(state.songMs === null ? null : Math.round(state.songMs / 100) / 10)
  run.intensity.push(Math.round(state.intensity * 100) / 100)
  if (state.dropCount > lastDrops) run.drops.push((tick.t - first) / 1000)
  lastDrops = state.dropCount
}
run.seconds = slots / 4
writeFileSync(output, JSON.stringify({ tracker: 'sections.ts', runs: [run] }))
console.log(input.split('/').pop(), `${run.seconds.toFixed(0)} s replayed, ${run.drops.length} drops, ${Math.max(...run.songs)} songs`)
