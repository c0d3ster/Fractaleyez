// The package's one entry: everything a consumer can use is a named export here (package.json `exports` has no other path).
// The analysers are classes the caller creates; the package keeps no instances of its own.

// The five onset bands every analyser reads (bass, lo, mid, hi, air), one RMS level each per frame.
export { DEFAULT_ENABLED_BANDS, isValidBandSelection, MAX_BAND_WINDOW_SAMPLES, ONSET_BANDS } from './onset-bands'
export type { OnsetBandSpec } from './onset-bands'

// The beat: a drum onset, and the rolling record of what the detector saw.
export { DEFAULT_ONSET_OPTIONS, OnsetDetector } from './onset-detector'
export type { BandReading, OnsetDetectorOptions, OnsetParams, OnsetReading } from './onset-detector'
export { BEAT_ACTIVE_LEVEL, BeatMonitor, NO_BEAT } from './beat'
export type { BandSample, BeatSample, BeatState, BeatTimeline } from './beat'

// Tempo, and the beat, bar and phrase grid on top of it.
export { DEFAULT_PATTERN_OPTIONS, estimateTempo } from './tempo'
export type { PatternOptions, TempoEstimate, TempoPattern } from './tempo'
export { DEFAULT_TEMPO_OPTIONS, TempoTracker } from './tempo-tracker'
export type { TempoReading, TempoTrackerOptions } from './tempo-tracker'
export { BEAT_NET_MODEL } from './beat-net'
export type { BeatActivation, BeatNetModel } from './beat-net'
export { BeatGrid, DEFAULT_GRID_OPTIONS } from './beat-grid'
export type { BeatGridOptions, GridState } from './beat-grid'

// Rhythm names (four on the floor, breakbeat, two-step).
export { DEFAULT_RHYTHM_HOLD, DEFAULT_RHYTHM_OPTIONS, nameRhythm, readRhythm, RhythmLabeler } from './rhythm-pattern'
export type { RhythmHoldOptions, RhythmInput, RhythmLabel, RhythmOptions, RhythmPattern, RhythmReading } from './rhythm-pattern'

// Song sections, and the log a listening session is saved to.
export { SectionTracker } from './sections'
export type { SectionSample, SectionSlot, SectionState, SectionTick, SectionTuning, SongSection } from './sections'
export type { SectionModelData } from './section-model'
export { buildSectionLog } from './section-log'
export type { SectionLog } from './section-log'

// Drum hits, risers and sweeps.
export { DRUM_CENTER_HZ, DRUM_KINDS, DRUM_SENSITIVITY, DrumHits } from './drum-hits'
export type { DrumCandidate, DrumKind } from './drum-hits'
export { RiserDetector } from './riser'
export type { RiserSlot } from './riser'
export { SPECTRUM_BANDS } from './tick-extras'
export { SpectrumReducer } from './spectrum-reducer'
export { SweepDetector } from './sweep'
export type { SweepSlot } from './sweep'
