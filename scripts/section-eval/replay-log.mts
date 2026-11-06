// Replays a log exported from the running app (`exportSectionLog()` in the console) through the current SectionTracker, and writes the same
// per-slot JSON that replay.mts does, so render.py and summarize.py work on it. The log holds 250 ms slots, not frames, so each slot is fed back as
// 15 identical frames of its low, mid and high levels (the tracker only uses those three groups) with its beats spread across them.
import { readFileSync, writeFileSync } from 'node:fs'
import { SectionTracker } from '../../src/audioanalysis/sections.ts'

type LogSlot = { t: number; total: number; low: number; mid: number; high: number; beats: number }

const [input, output] = [process.argv[2]!, process.argv[3]!]
const log = JSON.parse(readFileSync(input, 'utf8')) as { slots: LogSlot[] }
const first = log.slots[0]?.t ?? 0
const tracker = new SectionTracker()
const FRAMES = 15
const slots: Array<{ t: number; bands: number[]; beats: number; section: string; song: number; clock: number | null; intensity: number }> = []
for (const slot of log.slots) {
  const start = slot.t - 250
  for (let i = 0; i < FRAMES; i++) {
    const beat = slot.beats > 0 && i % Math.max(1, Math.floor(FRAMES / slot.beats)) === 0 && i / Math.max(1, Math.floor(FRAMES / slot.beats)) < slot.beats
    tracker.push({ t: start + ((i + 1) * 250) / FRAMES, levels: [slot.low, slot.low, slot.mid, slot.high, slot.high], beat })
  }
  const st = tracker.getState()
  slots.push({
    t: (slot.t - first) / 1000,
    bands: [slot.low, slot.low, slot.mid, slot.high, slot.high].map((v) => +v.toFixed(3)),
    beats: slot.beats,
    section: st.section,
    song: st.songIndex,
    clock: st.songMs === null ? null : Math.floor(st.songMs / 1000),
    intensity: +st.intensity.toFixed(2),
  })
}
writeFileSync(output, JSON.stringify({ file: input, seconds: slots.length / 4, slots }))
console.log(input.split('/').pop(), `${(slots.length / 4).toFixed(0)}s`, slots.length, 'slots replayed')
