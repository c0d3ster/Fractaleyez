import { readFileSync } from 'node:fs'
import { estimateTempo } from '../../src/audioanalysis/tempo.ts'
const d = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { beats: number[] }
const from = Number(process.argv[3]), to = Number(process.argv[4])
const times: number[] = []
d.beats.forEach((b, f) => { if (b >= 0) times.push((f * 1000) / 60) })
for (let s = from; s <= to; s += 4) {
  const t = s * 1000
  const r = estimateTempo(times.filter((x) => t - x <= 12000 && x <= t))
  console.log(`${s}s  bpm ${r?.bpm.toFixed(1)}  cons ${r?.consistency.toFixed(2)}  pattern ${r?.pattern}  beats ${times.filter((x) => t - x <= 12000 && x <= t).length}`)
}
