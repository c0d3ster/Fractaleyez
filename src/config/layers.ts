import { AppConfig, LayerKey } from './configDefaults'
import { layerConfig } from './layers.config'

export const LAYER_CAP = layerConfig.CAP

export type GlobalKey = 'user' | 'color' | 'effects' | 'audio'
export type DisplayKey = GlobalKey | LayerKey

export type LayerDescriptor = {
  key: LayerKey
  label: string
  hotkey: string
  hasBody: boolean
  /** Config sections rendered in this layer's popup column. */
  popupColumn: (keyof AppConfig)[]
}

export const LAYER_REGISTRY: Record<LayerKey, LayerDescriptor> = {
  video: { key: 'video', label: 'Video', hotkey: 'v', hasBody: true, popupColumn: ['video'] },
  fractal: { key: 'fractal', label: 'Fractal', hotkey: 'f', hasBody: true, popupColumn: ['fractal'] },
  orbit: { key: 'orbit', label: 'Orbit', hotkey: 'o', hasBody: true, popupColumn: ['orbit', 'particle'] },
  logo: { key: 'logo', label: 'Logo', hotkey: 'l', hasBody: true, popupColumn: ['logo'] },
}

/** Global (non-layer) entries. */
export const GLOBAL_ENTRIES: Record<GlobalKey, { key: GlobalKey; label: string; sections: (keyof AppConfig)[] }> = {
  user: { key: 'user', label: 'User', sections: ['user'] },
  color: { key: 'color', label: 'Color', sections: ['color'] },
  effects: { key: 'effects', label: 'Effects', sections: ['effects'] },
  audio: { key: 'audio', label: 'Audio', sections: ['audio'] },
}

/** Fixed display order shared by the sidebar and popup. Independent of `layers.order` (the z-stack). */
export const DISPLAY_ORDER: DisplayKey[] = ['user', 'color', 'effects', 'audio', 'video', 'fractal', 'orbit', 'logo']

export const isLayerKey = (key: DisplayKey): key is LayerKey => key in LAYER_REGISTRY

/** Config sections for a display entry, in render order. */
export const getEntrySections = (key: DisplayKey): (keyof AppConfig)[] =>
  isLayerKey(key) ? LAYER_REGISTRY[key].popupColumn : GLOBAL_ENTRIES[key].sections

export const DEFAULT_LAYER_ORDER: LayerKey[] = [...layerConfig.ORDER_DEFAULT]
