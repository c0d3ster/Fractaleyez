import { LayerKey, LayersConfigSection } from '../../config/configDefaults'

export type LayerPlanEntry = {
  key: LayerKey
  opacity: number
}

/** Opacity a layer is heading toward: its configured opacity if enabled, else 0. */
export const targetOpacity = (
  meta: LayersConfigSection['meta'],
  key: LayerKey,
): number => (meta[key].enabled.value ? meta[key].opacity.value : 0)

/**
 * The layers to draw this frame, front to back (the compositor's accumulation order). A layer at zero opacity is
 * left out entirely, so it costs no render and takes no composite slot. `effective` overrides the target opacity
 * for layers mid-fade.
 */
export const planLayers = (
  { order, meta }: LayersConfigSection,
  effective: Partial<Record<LayerKey, number>> = {},
): LayerPlanEntry[] =>
  [...order]
    .reverse()
    .map((key) => ({
      key,
      opacity: effective[key] ?? targetOpacity(meta, key),
    }))
    .filter(({ opacity }) => opacity > 0)
