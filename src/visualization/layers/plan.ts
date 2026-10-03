import { LayerKey, LayersConfigSection } from '../../config/configDefaults'

export type LayerPlanEntry = {
  key: LayerKey
  opacity: number
}

/**
 * The layers to draw this frame, front to back (the compositor's accumulation order). A disabled layer, or one at
 * zero effective opacity, is left out entirely, so it costs no render and takes no composite slot.
 */
export const planLayers = ({ order, meta }: LayersConfigSection): LayerPlanEntry[] =>
  [...order]
    .reverse()
    .map((key) => ({ key, opacity: meta[key].enabled.value ? meta[key].opacity.value : 0 }))
    .filter(({ opacity }) => opacity > 0)
