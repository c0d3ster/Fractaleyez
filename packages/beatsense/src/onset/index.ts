// The five onset bands every analyser reads (bass, lo, mid, hi, air), one RMS level each per frame.
export { DEFAULT_ENABLED_BANDS, isValidBandSelection, MAX_BAND_WINDOW_SAMPLES, ONSET_BANDS } from './onset-bands'
export type { OnsetBandSpec } from './onset-bands'
// The beat: a drum onset, and the rolling record of what the detector saw.
export { DEFAULT_ONSET_OPTIONS, OnsetDetector } from './onset-detector'
export type { BandReading, OnsetDetectorOptions, OnsetParams, OnsetReading } from './onset-detector'
export { BEAT_ACTIVE_LEVEL, BeatMonitor, NO_BEAT } from './beat'
export type { BandSample, BeatSample, BeatState, BeatTimeline } from './beat'
