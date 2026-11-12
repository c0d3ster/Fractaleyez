// Runs a synthetic 120 bpm track through beatsense in Node: PCM in, a reading per frame out. No dataset, no browser.
//
//   pnpm example
import { analyze } from '../src/index'

const SAMPLE_RATE = 44100
const SECONDS = 30

/** A kick on every beat, a snare on the 2 and 4, a hat on the off beats. */
const track = (): Float32Array => {
  const out = new Float32Array(SECONDS * SAMPLE_RATE)
  const beatSeconds = 0.5
  for (let n = 0; n < out.length; n++) {
    const t = n / SAMPLE_RATE
    const sinceBeat = t % beatSeconds
    const beatIndex = Math.floor(t / beatSeconds)
    const sinceOffBeat = (t + beatSeconds / 2) % beatSeconds
    let x = 0.6 * Math.sin(2 * Math.PI * 60 * sinceBeat) * Math.exp(-25 * sinceBeat)
    if (beatIndex % 2 === 1) x += 0.3 * Math.sin(2 * Math.PI * 1800 * sinceBeat) * Math.exp(-35 * sinceBeat)
    x += 0.1 * Math.sin(2 * Math.PI * 9000 * t) * Math.exp(-100 * sinceOffBeat)
    out[n] = x
  }
  return out
}

const { frames } = await analyze({ pcm: track(), sampleRate: SAMPLE_RATE })
const beats = frames.filter(({ beat }) => beat)
const last = frames[frames.length - 1]!

console.log(`${frames.length} frames, ${beats.length} beats`)
console.log(`first beats at ${beats.slice(0, 6).map(({ t }) => `${(t / 1000).toFixed(2)}s`).join(', ')}`)
console.log(`tempo at the end: ${last.bpm === null ? 'none yet' : `${last.bpm.toFixed(1)} bpm`}`)
console.log(`section at the end: ${last.section}`)
