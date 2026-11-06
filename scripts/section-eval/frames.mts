import { MPEGDecoder } from 'mpg123-decoder'
import { readFileSync, writeFileSync } from 'node:fs'
import { OnsetDetector } from '../../src/audioanalysis/onset-detector.ts'
import { ONSET_BANDS, DEFAULT_ENABLED_BANDS } from '../../src/audioanalysis/onset-bands.ts'

const [input, output] = [process.argv[2]!, process.argv[3]!]
const decoder = new MPEGDecoder()
await decoder.ready
const decoded = decoder.decode(new Uint8Array(readFileSync(input)))
decoder.free()
const rate = decoded.sampleRate
const n = decoded.samplesDecoded
const mono = new Float32Array(n)
for (let c = 0; c < decoded.channelData.length; c++) {
  const ch = decoded.channelData[c]!
  for (let i = 0; i < n; i++) mono[i]! += ch[i]! / decoded.channelData.length
}

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number }
const biquad = (type: 'hp' | 'lp', f: number): Biquad => {
  const w = (2 * Math.PI * f) / rate
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2)
  const cos = Math.cos(w)
  const a0 = 1 + alpha
  const [b0, b1, b2] = type === 'lp' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 }
}
const step = (q: Biquad, x: number): number => {
  const y = q.b0 * x + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2
  q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y
  return y
}
const filtered = ONSET_BANDS.map(({ lowHz, highHz }) => {
  const chain = [biquad('hp', lowHz), biquad('hp', lowHz), biquad('lp', Math.min(highHz, rate / 2.2)), biquad('lp', Math.min(highHz, rate / 2.2))]
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let x = mono[i]!
    for (const q of chain) x = step(q, x)
    out[i] = x
  }
  return out
})

const detector = new OnsetDetector(ONSET_BANDS.length)
const FRAME_MS = 1000 / 60
const frames = Math.floor((n / rate) * 60)
const levelsOut: number[][] = []
const beatsOut: number[] = []
for (let f = 0; f < frames; f++) {
  const t = f * FRAME_MS
  const end = Math.floor((t / 1000) * rate)
  const levels = ONSET_BANDS.map(({ windowSamples }, b) => {
    const start = Math.max(0, end - windowSamples)
    let sum = 0
    for (let i = start; i < end; i++) sum += filtered[b]![i]! ** 2
    return Math.sqrt(sum / Math.max(1, end - start)) * 100
  })
  const onset = detector.update(levels, FRAME_MS, 0, { enabledBands: DEFAULT_ENABLED_BANDS, sensitivity: 2, ignoreMs: 250, decayMs: 300 })
  levelsOut.push(levels.map((l) => +l.toFixed(3)))
  beatsOut.push(onset.beatBand === null ? -1 : onset.beatBand)
}
writeFileSync(output, JSON.stringify({ file: input, seconds: n / rate, levels: levelsOut, beats: beatsOut }))
console.log(input.split('/').pop(), (n / rate).toFixed(0) + 's', frames, 'frames')
