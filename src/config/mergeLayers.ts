import { LayerKey, LayerMeta, LayersConfigSection, configDefaults } from './configDefaults'
import { DEFAULT_LAYER_ORDER } from './layers'

const LAYER_KEYS: LayerKey[] = [...DEFAULT_LAYER_ORDER]

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Presets store bare values; older ones stored the whole item object, so unwrap its `value`. */
const unwrapStoredValue = (stored: unknown): unknown => (isRecord(stored) && 'value' in stored ? stored.value : stored)

/** Keeps known keys once each (first occurrence wins), then appends any missing keys in default order. */
const repairOrder = (loaded: unknown): LayerKey[] => {
  const known = Array.isArray(loaded) ? loaded.filter((k): k is LayerKey => typeof k === 'string' && LAYER_KEYS.some(key => key === k)) : []
  const deduped = [...new Set(known)]
  return [...deduped, ...LAYER_KEYS.filter(k => !deduped.includes(k))]
}

const withEnabled = (meta: LayerMeta, enabled: boolean): LayerMeta => ({
  ...meta,
  enabled: { ...meta.enabled, defaultValue: enabled, value: enabled },
})

/** Pre-layers presets: orbit on, video on only if the preset had clips, fractal and logo off. */
const legacyEnabled = (key: LayerKey, clipCount: number): boolean => {
  if (key === 'orbit') return true
  if (key === 'video') return clipCount > 0
  return false
}

const mergeMeta = (key: LayerKey, loaded: unknown, clipCount: number): LayerMeta => {
  const base = configDefaults.layers.meta[key]
  const l = isRecord(loaded) ? loaded : {}
  const storedEnabled = unwrapStoredValue(l.enabled)
  const storedOpacity = unwrapStoredValue(l.opacity)
  const enabled = typeof storedEnabled === 'boolean' ? storedEnabled : legacyEnabled(key, clipCount)
  const opacity = typeof storedOpacity === 'number' && Number.isFinite(storedOpacity) ? storedOpacity : base.opacity.defaultValue
  return {
    enabled: { ...base.enabled, value: enabled },
    opacity: { ...base.opacity, value: opacity },
    blendMode: base.blendMode,
  }
}

/**
 * Merges a loaded `layers` section over defaults. A missing/non-object section is a pre-layers preset
 * and gets the legacy defaults rather than `configDefaults.layers`. `clipCount` is the loaded preset's video clip count.
 */
export const mergeLayers = (loaded: unknown, clipCount: number): LayersConfigSection => {
  if (!isRecord(loaded)) {
    return {
      order: [...DEFAULT_LAYER_ORDER],
      meta: {
        video: withEnabled(configDefaults.layers.meta.video, legacyEnabled('video', clipCount)),
        fractal: withEnabled(configDefaults.layers.meta.fractal, legacyEnabled('fractal', clipCount)),
        orbit: withEnabled(configDefaults.layers.meta.orbit, legacyEnabled('orbit', clipCount)),
        logo: withEnabled(configDefaults.layers.meta.logo, legacyEnabled('logo', clipCount)),
      },
    }
  }
  const meta = isRecord(loaded.meta) ? loaded.meta : {}
  return {
    order: repairOrder(loaded.order),
    meta: {
      video: mergeMeta('video', meta.video, clipCount),
      fractal: mergeMeta('fractal', meta.fractal, clipCount),
      orbit: mergeMeta('orbit', meta.orbit, clipCount),
      logo: mergeMeta('logo', meta.logo, clipCount),
    },
  }
}
