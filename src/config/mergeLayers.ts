import { BlendMode, LayerKey, LayerMeta, LayersConfigSection, configDefaults } from './configDefaults'
import { DEFAULT_LAYER_ORDER } from './layers'

const LAYER_KEYS: LayerKey[] = [...DEFAULT_LAYER_ORDER]

/** Which layers a stored preset includes. */
export type LayerPresence = Record<LayerKey, boolean>

const BLEND_MODES: Record<BlendMode, true> = { mask: true, screen: true, over: true }

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

const isLayerKey = (value: unknown): value is LayerKey => typeof value === 'string' && LAYER_KEYS.some(key => key === value)

const isBlendMode = (value: unknown): value is BlendMode => typeof value === 'string' && value in BLEND_MODES

/** Presets store bare values; older ones stored the whole item object, so unwrap its `value`. */
const unwrapStoredValue = (stored: unknown): unknown => (isRecord(stored) && 'value' in stored ? stored.value : stored)

/**
 * A layer is on when the preset stores its sections (video also needs clips). Switched-off layers are left out of a
 * stored preset, so presence says which layers it includes.
 */
export const presentLayers = (stored: Record<string, unknown>, clipCount: number): LayerPresence => ({
  video: clipCount > 0,
  fractal: isRecord(stored.fractal),
  orbit: isRecord(stored.orbit) || isRecord(stored.particle),
  logo: isRecord(stored.logo),
})

/** A preset with no layer sections at all still shows something: orbit, as every pre-layers preset did. */
const withOrbitFloor = (present: LayerPresence): LayerPresence =>
  LAYER_KEYS.some(key => present[key]) ? present : { ...present, orbit: true }

/**
 * Puts `relative` (the stored order of the layers a preset includes) into the slots those layers hold in `base`, so a
 * layer left out of `relative` keeps its place. Unknown and repeated keys are dropped; a full order replaces `base`.
 */
export const applyRelativeOrder = (base: LayerKey[], relative: unknown): LayerKey[] => {
  const wanted = Array.isArray(relative) ? [...new Set(relative.filter(isLayerKey))] : []
  const queue = [...wanted]
  return base.map(key => (wanted.includes(key) ? (queue.shift() ?? key) : key))
}

const mergeMeta = (key: LayerKey, loaded: unknown, present: boolean): LayerMeta => {
  const base = configDefaults.layers.meta[key]
  const l = isRecord(loaded) ? loaded : {}
  const storedEnabled = unwrapStoredValue(l.enabled)
  const storedOpacity = unwrapStoredValue(l.opacity)
  // Older presets stored `enabled` for every layer and win over presence; newer ones leave it out.
  const enabled = typeof storedEnabled === 'boolean' ? storedEnabled : present
  const opacity = typeof storedOpacity === 'number' && Number.isFinite(storedOpacity) ? storedOpacity : base.opacity.defaultValue
  return {
    enabled: { ...base.enabled, value: enabled },
    opacity: { ...base.opacity, value: opacity },
    blendMode: isBlendMode(l.blendMode) ? l.blendMode : base.blendMode,
  }
}

/**
 * Merges a loaded `layers` section over defaults. `present` says which layers the preset includes, which decides
 * `enabled` wherever the section does not store it. `order` may list only the included layers (see applyRelativeOrder).
 */
export const mergeLayers = (loaded: unknown, present: LayerPresence): LayersConfigSection => {
  const l = isRecord(loaded) ? loaded : {}
  const meta = isRecord(l.meta) ? l.meta : {}
  const on = withOrbitFloor(present)
  return {
    order: applyRelativeOrder(LAYER_KEYS, l.order),
    meta: {
      video: mergeMeta('video', meta.video, on.video),
      fractal: mergeMeta('fractal', meta.fractal, on.fractal),
      orbit: mergeMeta('orbit', meta.orbit, on.orbit),
      logo: mergeMeta('logo', meta.logo, on.logo),
    },
  }
}
