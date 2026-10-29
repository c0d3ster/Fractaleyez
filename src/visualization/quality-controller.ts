import { AppConfig } from '../config/configDefaults'
import {
  AUTO_EVAL_MS,
  AUTO_HINT_HOLD_MS,
  AUTO_START_TIER,
  AUTO_TIERS,
  capHidesLoad,
  estimateSceneCost,
  isQualitySetting,
  isQualityTier,
  QUALITY_PROFILES,
  QUALITY_SETTING_DEFAULT,
  QualityProfile,
  QualitySetting,
  QualityTier,
} from '../config/quality.config'
import { loadTracker } from './load-tracker'
import { AutoDiagnostics, QualityGovernor, Smoothness } from './quality-governor'

// Where Auto starts next time: the tier it settled on, so a weak machine does not spend every load stepping down again.
const AUTO_TIER_HINT_KEY = 'autoQualityTier'

type TierListener = (tier: QualityTier, profile: QualityProfile) => void

/** What `window.getQuality` reports, for the perf readout and for the pop-out config window (which reads it through the opener). */
export type QualityStatus = {
  setting: QualitySetting
  tier: QualityTier
  profile: QualityProfile
  /** What decides Auto's next move and why it last moved; null when a tier is fixed. */
  auto: AutoDiagnostics | null
  /** How smooth the page has been, whatever the setting, and what is loading while it says so (see `LoadTracker`). */
  smooth: Smoothness & { reasons: string[] }
}

const readTierHint = (): QualityTier => {
  try {
    const stored = window.localStorage.getItem(AUTO_TIER_HINT_KEY)
    if (isQualityTier(stored) && AUTO_TIERS.includes(stored)) return stored
  } catch {
    // Storage can be blocked; Auto then starts at the top.
  }
  return AUTO_START_TIER
}

const writeTierHint = (tier: QualityTier): void => {
  try {
    window.localStorage.setItem(AUTO_TIER_HINT_KEY, tier)
  } catch {
    // Not worth failing a frame over.
  }
}

/** A rough weight of what the live config draws, for Auto to tell a lighter scene from a heavier one. */
export const readSceneCost = (config: AppConfig): number => {
  const { meta } = config.layers
  const { particlesPerLayer, layers, levels, particleSize } = config.particle
  return estimateSceneCost({
    fractal: meta.fractal.enabled.value,
    orbit: meta.orbit.enabled.value,
    video: meta.video.enabled.value && config.video.clips.length > 0,
    logo: meta.logo.enabled.value,
    glow: config.effects.glow.value,
    kaleidoscope: config.effects.kaleidoscope.value,
    particles: {
      particlesPerLayer: particlesPerLayer.value,
      layers: layers.value,
      levels: levels.value,
      particleSize: particleSize.value,
    },
  })
}

/**
 * The one place that knows which quality tier the visualizer draws at. A fixed setting is that tier; Auto asks the
 * governor, which is fed every display frame's time. Layers and effects subscribe and re-apply their profile when the
 * tier changes.
 */
export class QualityController {
  private setting: QualitySetting = QUALITY_SETTING_DEFAULT
  private tier: QualityTier
  private governor: QualityGovernor
  private readonly listeners = new Set<TierListener>()
  private nextEvalAt = 0
  private videoDropRate: () => number = () => 0
  // The tier Auto last moved to and when; it becomes the saved starting tier once it has held for `AUTO_HINT_HOLD_MS`.
  private hintCandidate: { tier: QualityTier; since: number } | null = null

  constructor() {
    this.governor = new QualityGovernor(readTierHint())
    this.tier = this.governor.getTier()
  }

  /** Where Auto reads how many video frames are being dropped; the video layer sets it while it exists. */
  setVideoDropProvider = (provider: (() => number) | null): void => {
    this.videoDropRate = provider ?? (() => 0)
  }

  getSetting = (): QualitySetting => this.setting

  getTier = (): QualityTier => this.tier

  getProfile = (): QualityProfile => QUALITY_PROFILES[this.tier]

  getStatus = (): QualityStatus => ({
    setting: this.setting,
    tier: this.tier,
    profile: this.getProfile(),
    auto: this.setting === 'auto' ? this.governor.getDiagnostics(performance.now()) : null,
    smooth: { ...this.governor.getSmoothness(), reasons: loadTracker.reasons() },
  })

  /** Calls `listener` now and again whenever the tier changes. Returns the unsubscribe. */
  subscribe = (listener: TierListener): (() => void) => {
    this.listeners.add(listener)
    listener(this.tier, this.getProfile())
    return () => { this.listeners.delete(listener) }
  }

  /** Picking a tier fixes it (the governor then only watches, so the panel can still say how smooth it is). Picking Auto starts the governor over from where it last settled. */
  setSetting = (setting: unknown): void => {
    if (!isQualitySetting(setting) || setting === this.setting) return
    this.setting = setting
    this.hintCandidate = null
    if (setting === 'auto') {
      // Choosing Auto again starts the governor over, with no wait before it may step up.
      this.governor = new QualityGovernor(readTierHint())
      this.governor.disturb(performance.now())
      this.setTier(this.governor.getTier())
      return
    }
    this.governor = new QualityGovernor(setting, { observeOnly: true })
    this.governor.disturb(performance.now())
    this.setTier(setting)
  }

  /** Something other than the scene changed what the frame times mean (a resize, a tab coming back). */
  disturb = (): void => {
    this.governor.disturb(performance.now())
  }

  /** Call once per display frame with the time since the previous one. The governor looks at them in windows of `AUTO_EVAL_MS`, and only Auto acts on what it finds. */
  recordFrame = (frameMs: number, now: number): void => {
    this.governor.push(frameMs)
    if (now < this.nextEvalAt) return
    this.nextEvalAt = now + AUTO_EVAL_MS
    const capped = capHidesLoad(QUALITY_PROFILES[this.tier].frameCapFps)
    const next = this.governor.evaluate(now, readSceneCost(window.config), capped, this.videoDropRate(), loadTracker.isBusy())
    if (this.setting !== 'auto') return
    if (next !== this.tier) {
      this.setTier(next)
      this.hintCandidate = { tier: next, since: now }
    }
    this.rememberHint(now)
  }

  // A tier is saved for the next visit once Auto has stayed on it long enough to be a real settling, not a dip.
  private rememberHint = (now: number): void => {
    const candidate = this.hintCandidate
    if (!candidate || now - candidate.since < AUTO_HINT_HOLD_MS) return
    this.hintCandidate = null
    writeTierHint(candidate.tier)
  }

  private setTier = (tier: QualityTier): void => {
    if (tier === this.tier) return
    this.tier = tier
    const profile = QUALITY_PROFILES[tier]
    this.listeners.forEach((listener) => listener(tier, profile))
  }
}

export const qualityController = new QualityController()
