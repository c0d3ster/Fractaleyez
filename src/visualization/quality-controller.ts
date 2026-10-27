import { AppConfig } from '../config/configDefaults'
import {
  AUTO_EVAL_MS,
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
import { AutoCeiling, QualityGovernor } from './quality-governor'

// Where Auto starts next time: the tier it settled on, so a weak machine does not spend every load stepping down again.
const AUTO_TIER_HINT_KEY = 'autoQualityTier'
// A tier Auto stepped down from, with the scene cost it did so at, so a later visit does not retry it from scratch.
const AUTO_CEILING_KEY = 'autoQualityCeiling'

type TierListener = (tier: QualityTier, profile: QualityProfile) => void

/** What `window.getQuality` reports, for the perf readout and for the pop-out config window (which reads it through the opener). */
export type QualityStatus = {
  setting: QualitySetting
  tier: QualityTier
  profile: QualityProfile
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

const isCeiling = (value: unknown): value is AutoCeiling =>
  typeof value === 'object' && value !== null && 'tier' in value && 'cost' in value && isQualityTier(value.tier) && typeof value.cost === 'number'

const readCeiling = (): AutoCeiling | null => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(AUTO_CEILING_KEY) ?? 'null')
    return isCeiling(stored) && AUTO_TIERS.includes(stored.tier) ? stored : null
  } catch {
    return null
  }
}

const writeCeiling = (ceiling: AutoCeiling | null): void => {
  try {
    if (ceiling) window.localStorage.setItem(AUTO_CEILING_KEY, JSON.stringify(ceiling))
    else window.localStorage.removeItem(AUTO_CEILING_KEY)
  } catch {
    // Not worth failing a frame over.
  }
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
  private ceiling: AutoCeiling | null

  constructor() {
    this.ceiling = readCeiling()
    this.governor = new QualityGovernor(readTierHint(), { ceiling: this.ceiling })
    this.tier = this.governor.getTier()
  }

  /** Where Auto reads how many video frames are being dropped; the video layer sets it while it exists. */
  setVideoDropProvider = (provider: (() => number) | null): void => {
    this.videoDropRate = provider ?? (() => 0)
  }

  getSetting = (): QualitySetting => this.setting

  getTier = (): QualityTier => this.tier

  getProfile = (): QualityProfile => QUALITY_PROFILES[this.tier]

  getStatus = (): QualityStatus => ({ setting: this.setting, tier: this.tier, profile: this.getProfile() })

  /** Calls `listener` now and again whenever the tier changes. Returns the unsubscribe. */
  subscribe = (listener: TierListener): (() => void) => {
    this.listeners.add(listener)
    listener(this.tier, this.getProfile())
    return () => { this.listeners.delete(listener) }
  }

  /** Picking a tier fixes it. Picking Auto starts the governor over from where it last settled. */
  setSetting = (setting: unknown): void => {
    if (!isQualitySetting(setting) || setting === this.setting) return
    this.setting = setting
    if (setting === 'auto') {
      // Choosing Auto again is a request to try the heavier tiers afresh.
      this.ceiling = null
      writeCeiling(null)
      this.governor = new QualityGovernor(readTierHint())
      this.governor.disturb(performance.now())
      this.setTier(this.governor.getTier())
      return
    }
    this.setTier(setting)
  }

  /** Something other than the scene changed what the frame times mean (a resize, a tab coming back). */
  disturb = (): void => {
    this.governor.disturb(performance.now())
  }

  /** Call once per display frame with the time since the previous one. Auto looks at them in windows of `AUTO_EVAL_MS`. */
  recordFrame = (frameMs: number, now: number): void => {
    if (this.setting !== 'auto') return
    this.governor.push(frameMs)
    if (now < this.nextEvalAt) return
    this.nextEvalAt = now + AUTO_EVAL_MS
    const capped = capHidesLoad(QUALITY_PROFILES[this.tier].frameCapFps)
    const next = this.governor.evaluate(now, readSceneCost(window.config), capped, this.videoDropRate())
    this.rememberCeiling()
    if (next === this.tier) return
    this.setTier(next)
    writeTierHint(next)
  }

  private rememberCeiling = (): void => {
    const ceiling = this.governor.getCeiling()
    if (ceiling?.tier === this.ceiling?.tier && ceiling?.cost === this.ceiling?.cost) return
    this.ceiling = ceiling
    writeCeiling(ceiling)
  }

  private setTier = (tier: QualityTier): void => {
    if (tier === this.tier) return
    this.tier = tier
    const profile = QUALITY_PROFILES[tier]
    this.listeners.forEach((listener) => listener(tier, profile))
  }
}

export const qualityController = new QualityController()
