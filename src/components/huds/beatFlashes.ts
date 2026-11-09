import type { BeatSample } from '../../audioanalysis/beat'

// How long a band's bar flashes after it sets off a beat.
export const HIT_FLASH_MS = 250
// A beat another band set off also flashes bass when bass has its own onset this close to it, before or after. The kick's click often
// reaches hi first (median 33 ms) and the beat goes there, and an off-beat hat can hold the beat for the ignore time, so on its own the bass
// bar flashed on about half of real drop kicks; with this, about 69% (scripts/section-eval/DRUM-HITS.md, Low kicks).
export const BASS_CREDIT_MS = 60
const BASS = 0

/** How bright each band's flash is now (0 to 1), newest beat first, from the beat monitor's samples (oldest first). */
export const beatFlashes = (samples: readonly BeatSample[], now: number, bandCount: number): number[] => {
  const flashes = new Array<number>(bandCount).fill(0)
  const flashOf = (t: number): number => Math.max(0, 1 - (now - t) / HIT_FLASH_MS)
  // Bass onsets recent enough to credit a beat still flashing.
  const bassOnsets: number[] = []
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]!
    if (now - sample.t > HIT_FLASH_MS + BASS_CREDIT_MS) break
    if (sample.bands[BASS]?.rising) bassOnsets.push(sample.t)
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]!
    if (now - sample.t > HIT_FLASH_MS) break
    const { beatBand, rebandTo } = sample
    // A beat handed to a lower band a frame or two late (rebandTo, onset-detector.ts) flashes that band too.
    if (rebandTo != null && flashes[rebandTo] === 0) flashes[rebandTo] = flashOf(sample.t)
    if (beatBand === null) continue
    if (flashes[beatBand] === 0) flashes[beatBand] = flashOf(sample.t)
    if (beatBand !== BASS && flashes[BASS] === 0 && bassOnsets.some((t) => Math.abs(t - sample.t) <= BASS_CREDIT_MS)) {
      flashes[BASS] = flashOf(sample.t)
    }
  }
  return flashes
}
