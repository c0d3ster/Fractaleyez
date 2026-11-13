// The package's one entry: everything a consumer can use is a named export here (package.json `exports` has no other path).
// The HUDs read the analysis through the nearest HudProvider; each imports its own stylesheet.

export { BeatHud } from './BeatHud'
export { FrequencyHud, type FrequencyHudProps } from './FrequencyHud'
export { SectionHud } from './SectionHud'
export { HudProvider, useHud, titleHint, type AnalysisSource, type Hint, type HintProps, type HudContextValue } from './HudContext'
export { animationFrameTicker, createFrameTicker, type Ticker, type TickListener } from './ticker'
