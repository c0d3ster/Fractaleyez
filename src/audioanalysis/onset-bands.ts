/**
 * The seven frequency bands the Frequency HUD shows and the beat detector listens to. One definition drives both, so
 * a band's label, its bar and what it triggers on always agree. Each band is a band-pass filter (see AudioStream), so
 * the edges are real frequencies. The HUD's toggles choose which of them can set off a beat.
 *
 * Rough guide to where things live: kick thump in bass, bass guitar in bass and lo, snare body in lo and its crack in
 * mid and hi, claps in mid and hi, hats in pre and bri.
 */
export type OnsetBandSpec = {
  label: string
  lowHz: number
  highHz: number
  /** Analysis window. The lowest bands need longer ones: a 40Hz wave is only ~1 cycle in 21ms. */
  windowSamples: number
}

export const ONSET_BANDS: OnsetBandSpec[] = [
  { label: 'sub', lowHz: 20, highHz: 60, windowSamples: 2048 },
  { label: 'bass', lowHz: 60, highHz: 150, windowSamples: 2048 },
  { label: 'lo', lowHz: 150, highHz: 400, windowSamples: 1024 },
  { label: 'mid', lowHz: 400, highHz: 2000, windowSamples: 1024 },
  { label: 'hi', lowHz: 2000, highHz: 5000, windowSamples: 1024 },
  { label: 'pre', lowHz: 5000, highHz: 9000, windowSamples: 1024 },
  { label: 'bri', lowHz: 9000, highHz: 16000, windowSamples: 1024 },
]

export const MAX_BAND_WINDOW_SAMPLES = Math.max(...ONSET_BANDS.map(({ windowSamples }) => windowSamples))

/** Used until the HUD (or a saved setting) says otherwise: everything up to the hats' lowest part. */
export const DEFAULT_ENABLED_BANDS = [true, true, true, true, true, true, false]
