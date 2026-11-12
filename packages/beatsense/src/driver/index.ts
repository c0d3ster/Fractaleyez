// The driver: audio frames in, every analyser pushed in a fixed order. `analyze` runs a whole recording through the front end and the driver.
export { createAnalysers } from './analysers'
export type { Analysers } from './analysers'
export { AudioFeed, DEFAULT_FEED_SETTINGS } from './audio-feed'
export type { AudioFeedOptions, AudioFrame, FeedResult, FeedSettings } from './audio-feed'
export { analyze } from './analyze'
export type { Analysis, AnalyzeOptions, FrameReading, LevelsInput, PcmInput } from './analyze'
