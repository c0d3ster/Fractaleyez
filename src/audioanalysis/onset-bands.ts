/**
 * The five frequency bands the Frequency HUD shows and the beat detector listens to. One definition drives both, so
 * a band's label, its bar and what it triggers on always agree. Each band is a band-pass filter (see AudioStream), so
 * the edges are real frequencies. The HUD's toggles choose which of them can set off a beat.
 *
 * Rough guide to where things live: kick thump and bass guitar in bass, snare body in lo, clap body in mid, snare crack
 * and clap snap (and the kick's click) in hi, hats and cymbals in air. Bass guitar, guitars and vocals overlap the drum
 * ranges, so what tells a hit from a held note is the detector looking for sudden rises, not the band edges.
 */
export type OnsetBandSpec = {
  label: string
  lowHz: number
  highHz: number
  /** Analysis window. The lowest bands need longer ones: a 40Hz wave is only ~1 cycle in 21ms. */
  windowSamples: number
}

export const ONSET_BANDS: OnsetBandSpec[] = [
  { label: 'bass', lowHz: 40, highHz: 150, windowSamples: 2048 },
  { label: 'lo', lowHz: 150, highHz: 500, windowSamples: 1024 },
  { label: 'mid', lowHz: 500, highHz: 2000, windowSamples: 1024 },
  { label: 'hi', lowHz: 2000, highHz: 6000, windowSamples: 1024 },
  { label: 'air', lowHz: 6000, highHz: 16000, windowSamples: 1024 },
]

export const MAX_BAND_WINDOW_SAMPLES = Math.max(...ONSET_BANDS.map(({ windowSamples }) => windowSamples))

/** Used until the HUD (or a saved setting) says otherwise: the kick (bass) and the snare/clap (hi), no hats. */
export const DEFAULT_ENABLED_BANDS = [true, false, false, true, false]

/** A saved selection only applies if it was made for this many bands; an older layout would map to the wrong ones. */
export const isValidBandSelection = (selection: boolean[]): boolean => selection.length === ONSET_BANDS.length
