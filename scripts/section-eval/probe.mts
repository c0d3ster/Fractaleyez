import { readFileSync } from 'node:fs'
import { SectionTracker } from '../../src/audioanalysis/sections.ts'

const [input, from, to, stepArg] = [process.argv[2]!, Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5] ?? 2)]
const d = JSON.parse(readFileSync(input, 'utf8')) as { levels: number[][]; beats: number[] }
const tracker = new SectionTracker()
type Internals = {
  trend: (t: number, g: string) => { slope: number; fit: number; rise: number } | null
  relative: (t: number, g: string) => number | null
  section: string
  reference: { total: number }
  mean: (t: number, a: number, b: number, g: string) => number | null
}
const x = tracker as unknown as Internals
let next = from
for (let f = 0; f < d.levels.length; f++) {
  const t = (f * 1000) / 60
  tracker.push({ t, levels: d.levels[f]!, beat: d.beats[f]! >= 0 })
  if (t / 1000 >= next && t / 1000 <= to && f % 15 === 14) {
    next += stepArg
    const tt = (x.trend(t, 'total'))
    const th = (x.trend(t, 'high'))
    const tm = (x.trend(t, 'mid'))
    const fmt = (tr: { slope: number; fit: number; rise: number } | null): string => (tr ? `${tr.slope.toFixed(2)}/${tr.fit.toFixed(2)}/${tr.rise.toFixed(1)}` : '--')
    console.log(`${(t / 1000).toFixed(0).padStart(4)}s ${x.section.padEnd(7)} relTot ${x.relative(t, 'total')?.toFixed(1)} relLow ${x.relative(t, 'low')?.toFixed(1)} relHigh ${x.relative(t, 'high')?.toFixed(1)}  trend(slope/fit/rise) tot ${fmt(tt)} mid ${fmt(tm)} high ${fmt(th)}`)
  }
}
