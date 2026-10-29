import { ParticleLoadInputs, particleLoad, PARTICLE_LOAD_HEAVY } from './particleLoad.config'

/** Lightest to heaviest. Auto only moves between the first three; Ultra is a manual choice. */
export const QUALITY_TIERS = ['saver', 'balanced', 'quality', 'ultra'] as const
export type QualityTier = typeof QUALITY_TIERS[number]

export type QualitySetting = 'auto' | QualityTier

export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', ...QUALITY_TIERS]

export const QUALITY_SETTING_DEFAULT: QualitySetting = 'auto'

/** The tiers Auto can pick, lightest first. It climbs to Ultra only by trying it (see `AUTO_CLIMB_AFTER_MS`) and falls back if the machine cannot hold it, then waits (see `AUTO_RETRY_BASE_MS`) before trying again. */
export const AUTO_TIERS: readonly QualityTier[] = ['saver', 'balanced', 'quality', 'ultra']

/** Where Auto starts on a first visit, and where it falls back to when nothing has been remembered. The first thing a visitor sees should look good, so it steps down from here only if the machine cannot hold it. */
export const AUTO_START_TIER: QualityTier = 'quality'

/** Auto remembers a tier for the next visit only after it has stayed on it this long, so a dip while the page loads, the window moves or another window covers it is not saved as the starting tier. */
export const AUTO_HINT_HOLD_MS = 30000

export type QualityProfile = {
  /** Frames drawn per second at most (analysis runs with them); null draws on every display frame. A cap above the display's refresh rate changes nothing. */
  frameCapFps: number | null
  /** Fractal render target size against the drawing buffer. Above 1 it is supersampled, and the composite smooths it back down. */
  fractalScale: number
  /** Escape-time iterations per fractal pixel, at most `FRACTAL_MAX_ITERATIONS`. */
  fractalIterations: number
  /** The glow's blur runs at this fraction of the screen size (postprocessing's own default is 0.5). */
  bloomScale: number
  /** The video texture is re-uploaded at most this often; null uploads every decoded frame. */
  videoUploadFps: number | null
  /** How often the pop-out config window repaints its live widgets. */
  uiTickHz: number
  /** Logo copies that are enlarged (the endless zoom) are sampled with a bicubic filter instead of the GPU's bilinear one. */
  logoBicubic: boolean
}

/** The fractal shader's loop bound. A tier's iteration count is a uniform that breaks out of the loop early. */
export const FRACTAL_MAX_ITERATIONS = 192

/** A supersampled render target never gets wider or taller than this, so a big screen does not ask for a huge texture. */
export const SUPERSAMPLE_MAX_SIDE_PX = 4096

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  saver: { frameCapFps: 30, fractalScale: 0.5, fractalIterations: 64, bloomScale: 0.25, videoUploadFps: 30, uiTickHz: 10, logoBicubic: false },
  balanced: { frameCapFps: 60, fractalScale: 0.75, fractalIterations: 96, bloomScale: 0.4, videoUploadFps: 30, uiTickHz: 15, logoBicubic: false },
  // What the app drew before there were tiers, except it stops at 120fps: faster than that only pins an integrated GPU and starves the video.
  quality: { frameCapFps: 120, fractalScale: 1, fractalIterations: 128, bloomScale: 0.5, videoUploadFps: null, uiTickHz: 20, logoBicubic: false },
  ultra: { frameCapFps: null, fractalScale: 1.5, fractalIterations: 192, bloomScale: 0.75, videoUploadFps: null, uiTickHz: 20, logoBicubic: true },
}

export const QUALITY_LABELS: Record<QualitySetting, string> = {
  auto: 'Auto',
  saver: 'Saver',
  balanced: 'Balanced',
  quality: 'Quality',
  ultra: 'Ultra',
}

export const QUALITY_HINTS: Record<QualitySetting, string> = {
  auto: 'Adjusts to your frame rate',
  saver: '30fps and a softer fractal, for weaker machines',
  balanced: 'A bit softer, lighter on the GPU',
  quality: 'Full detail',
  ultra: 'Supersampled fractal and smoother zoomed logos, for strong GPUs',
}

export const isQualitySetting = (value: unknown): value is QualitySetting =>
  typeof value === 'string' && QUALITY_SETTINGS.some((setting) => setting === value)

export const isQualityTier = (value: unknown): value is QualityTier =>
  typeof value === 'string' && QUALITY_TIERS.some((tier) => tier === value)

/** The frame time (ms) Auto treats as too slow is 1.4x the display's refresh interval, kept between these. */
export const AUTO_SLOW_FACTOR = 1.4
export const AUTO_SLOW_MIN_MS = 18
export const AUTO_SLOW_MAX_MS = 24
// A window is also slow when its 95th percentile frame is this many display refresh intervals long: a tier can look fine by its median and still hitch constantly.
export const AUTO_ROUGH_FACTOR = 2.5

/**
 * Whether a tier's frame cap is slow enough that its frame times are the cap's own pace and say nothing about load (Saver's 30fps).
 * A cap faster than Auto's slowness threshold (Balanced's 120fps) only skips frames when the machine is running ahead of it, so
 * a slow machine still shows slow frames and Auto can still step it down.
 */
export const capHidesLoad = (frameCapFps: number | null): boolean => frameCapFps !== null && 1000 / frameCapFps >= AUTO_SLOW_MIN_MS

// Auto steps down after the frame time has been slow for this long without a break.
export const AUTO_SLOW_FOR_MS = 3000
// Frames are judged in windows this long.
export const AUTO_EVAL_MS = 500
// A scene change, resize or tab refocus makes one-off hitches (orbits rebuilding, the browser relaying out), so frames are ignored for this long after, and the clock restarts on each one in a run (a window being dragged).
export const AUTO_DISTURB_MS = 1500
// Loading (see `load-tracker.ts`) is waited out rather than timed: frames are ignored while anything loads, and for this long after the last load finishes.
export const AUTO_BUSY_SETTLE_MS = 500
// A load that has gone on this long (a stalled request) no longer stops Auto judging, so a load that never finishes cannot turn it off.
export const AUTO_BUSY_MAX_MS = 8000
// A median frame this many times the slow threshold is not a slightly heavy scene but a stall, and counts double toward stepping down.
export const AUTO_SEVERE_FACTOR = 2.5
export const AUTO_SEVERE_WEIGHT = 2
// Switching tier resizes render targets and recompiles nothing but still hitches once, so frames are ignored this long after Auto steps.
export const AUTO_STEP_SETTLE_MS = 1500
// A step up that has held this long without having to step back down counts as a success (and the retry wait goes back to the base).
export const AUTO_PROBE_WATCH_MS = 8000
// After stepping down, Auto waits this long before stepping up again. Each step up that has to be undone doubles the wait, up to the max.
export const AUTO_RETRY_BASE_MS = 30000
export const AUTO_RETRY_MAX_MS = 240000
// A change in the scene's estimated cost smaller than this (as a fraction) is not a scene change.
export const AUTO_COST_CHANGE_RATIO = 0.1
// This long with no slow frames and no dropped video frames, and Auto tries the next tier up. It then has `AUTO_PROBE_WATCH_MS` to hold it.
export const AUTO_CLIMB_AFTER_MS = 10000
// The Performance panel's Smooth stat is green from this long without trouble (the stretch after which Auto tries the next tier up), and red from `AUTO_SLOW_FOR_MS` of trouble (where Auto steps down).
export const SMOOTH_GOOD_MS = AUTO_CLIMB_AFTER_MS
// A smoothed share of video frames dropped above this means playback is struggling even when frame times look fine (an iGPU with a busy decoder).
export const AUTO_VIDEO_DROP_LIMIT = 0.03

/** How Auto's cost estimate sees the scene; mirrors the parts of `window.config` that set how heavy it is. */
export type SceneCostInputs = {
  fractal: boolean
  orbit: boolean
  video: boolean
  logo: boolean
  glow: boolean
  kaleidoscope: boolean
  particles: ParticleLoadInputs
}

const COST_FRACTAL = 1
const COST_VIDEO = 0.5
const COST_LOGO = 0.15
const COST_GLOW = 0.2
const COST_KALEIDOSCOPE = 0.1

/** A unitless, rough weight of what the scene draws. Only ever compared against another estimate of the same scene kind. */
export const estimateSceneCost = ({ fractal, orbit, video, logo, glow, kaleidoscope, particles }: SceneCostInputs): number =>
  (fractal ? COST_FRACTAL : 0)
  + (orbit ? particleLoad(particles) / PARTICLE_LOAD_HEAVY : 0)
  + (video ? COST_VIDEO : 0)
  + (logo ? COST_LOGO : 0)
  + (glow ? COST_GLOW : 0)
  + (kaleidoscope ? COST_KALEIDOSCOPE : 0)
