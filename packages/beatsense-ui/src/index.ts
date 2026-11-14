// The package's one entry: everything a consumer can use is a named export here (package.json `exports` has no other path).
// The HUDs read the analysis through the nearest HudProvider; each imports its own stylesheet.

export { BeatHud, type BeatHudProps } from './BeatHud'
export { FrequencyHud, type FrequencyHudProps } from './FrequencyHud'
export { SectionHud, type SectionHudProps } from './SectionHud'
export { agoTicks, formatAgo } from './agoTicks'
export { DRUM_COLORS, DRUM_SHAPES, drawDrumMark, type DrumShape, type MarkContext, type MarkStyle } from './drumMarks'
export { HudProvider, useHud, titleHint, type AnalysisSource, type Hint, type HintProps, type HudContextValue } from './HudContext'
export { animationFrameTicker, createFrameTicker, type Ticker, type TickListener } from './ticker'
