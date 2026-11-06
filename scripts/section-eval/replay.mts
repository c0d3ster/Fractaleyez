import { readFileSync, writeFileSync } from 'node:fs'
import { SectionTracker } from '../../src/audioanalysis/sections.ts'

const [input, output] = [process.argv[2]!, process.argv[3]!]
const d = JSON.parse(readFileSync(input, 'utf8')) as { file: string; seconds: number; levels: number[][]; beats: number[] }
const tracker = new SectionTracker()
const FRAME_MS = 1000 / 60
const slots: Array<{ t: number; bands: number[]; beats: number; section: string; song: number; clock: number | null; intensity: number }> = []
let acc = { bands: [0, 0, 0, 0, 0], beats: 0, n: 0 }
for (let f = 0; f < d.levels.length; f++) {
  const t = f * FRAME_MS
  const levels = d.levels[f]!
  const beat = d.beats[f]! >= 0
  tracker.push({ t, levels, beat })
  levels.forEach((l, b) => { acc.bands[b]! += l })
  acc.n++
  if (beat) acc.beats++
  if (f % 15 === 14) {
    const st = tracker.getState()
    slots.push({ t: t / 1000, bands: acc.bands.map((v) => +(v / acc.n).toFixed(3)), beats: acc.beats, section: st.section, song: st.songIndex, clock: st.songMs === null ? null : Math.floor(st.songMs / 1000), intensity: +st.intensity.toFixed(2) })
    acc = { bands: [0, 0, 0, 0, 0], beats: 0, n: 0 }
  }
}
writeFileSync(output, JSON.stringify({ file: d.file, seconds: d.seconds, slots }))
