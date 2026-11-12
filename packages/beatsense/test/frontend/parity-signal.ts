// The synthetic signal of scripts/section-eval/levels-fixture.py, same formula, so a test can rebuild what levels.py filtered.
export const PARITY_SECONDS = 3

const mod = (value: number, by: number): number => ((value % by) + by) % by

export const parityPcm = (sampleRate: number): Float64Array => {
  const out = new Float64Array(Math.floor(PARITY_SECONDS * sampleRate))
  for (let n = 0; n < out.length; n++) {
    const t = n / sampleRate
    const kick = 0.5 * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-30 * mod(t, 0.5))
    const snare = 0.2 * Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-40 * mod(t + 0.25, 0.5))
    const hat = 0.1 * Math.sin(2 * Math.PI * 9000 * t) * Math.exp(-90 * mod(t + 0.125, 0.25))
    out[n] = kick + snare + hat + 0.05 * Math.sin(2 * Math.PI * 440 * t) + 0.02 * Math.sin(2 * Math.PI * 250 * t)
  }
  return out
}
