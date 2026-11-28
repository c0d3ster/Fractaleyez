import type { LayerKey } from '../../config/configDefaults'
import type { CameraFacing, CameraState } from '../../visualization/camera-source'

// What each layer's page in the menu sheet holds (docs/mobile-design/MenuLayerDetail.html, FractalShape.html, OrbitShape.html,
// OrbitParticles.html, OrbitSprites.html, LogoLook.html): its sub-tabs, and the settings each one-slider section shows. Pure, so
// the flag's effect and the defaults are tested without a DOM.

export type LayerSubTab = 'type' | 'shape' | 'particles' | 'sprites' | 'look' | 'motion' | 'pad'

export const SUB_TAB_LABELS: Record<LayerSubTab, string> = {
  type: 'Type',
  shape: 'Shape',
  particles: 'Particles',
  sprites: 'Sprites',
  look: 'Look',
  motion: 'Motion',
  pad: 'Pad',
}

/**
 * A layer page's sub-tabs, in order; the first is where the page opens. Without the fractal Types (the `fractalTypes` flag) the
 * Fractal page is its Shape alone. Video is one page, so it has none.
 */
export const layerSubTabs = (layer: LayerKey, fractalTypes: boolean): readonly LayerSubTab[] => {
  switch (layer) {
  case 'fractal':
    return fractalTypes ? ['type', 'shape'] : ['shape']
  case 'orbit':
    return ['shape', 'particles', 'sprites']
  case 'logo':
    return ['look', 'motion', 'pad']
  default:
    return []
  }
}

/** A page shows its sub-tabs only when there is more than one to pick from. */
export const showsSubTabs = (tabs: readonly LayerSubTab[]): boolean => tabs.length > 1

/** The sub-tab on show: the one picked if this page has it, otherwise the page's first. */
export const resolveSubTab = (tabs: readonly LayerSubTab[], picked: LayerSubTab | null): LayerSubTab | null =>
  (picked !== null && tabs.includes(picked) ? picked : tabs[0] ?? null)

export type OneSliderSet = { section: 'orbit' | 'particle' | 'logo' | 'color'; items: readonly string[]; label: string }

/** The settings of each one-slider section, in button order (the first is selected when it opens). */
export const ONE_SLIDER_SETS = {
  orbitShape: { section: 'orbit', items: ['a', 'b', 'c', 'd', 'e'], label: 'Orbit shape' },
  orbitParticles: { section: 'particle', items: ['particlesPerLayer', 'particleSize', 'layers', 'levels'], label: 'Particles' },
  logoMotion: { section: 'logo', items: ['size', 'spinSpeed', 'shake'], label: 'Logo motion' },
  // The Color tab (ColorTab.html), under the palettes and the range bar.
  color: { section: 'color', items: ['paletteCycles', 'palettePhase', 'saturation'], label: 'Color' },
} as const satisfies Record<string, OneSliderSet>

/** The selected setting of a one-slider section: the one picked if the section has it, otherwise its first. */
export const resolveOneSliderItem = (items: readonly string[], picked: string | null): string =>
  (picked !== null && items.includes(picked) ? picked : items[0] ?? '')

type CameraLineState = Pick<CameraState, 'status' | 'error' | 'facing'>

/** The camera stopped for good (access blocked, no camera support): not a drop it is still retrying, whose message ends in `…`. */
export const cameraGaveUp = ({ status, error }: CameraLineState): boolean => status === 'error' && !(error ?? '').endsWith('…')

const FACING_NAMES: Record<CameraFacing, string> = { user: 'front', environment: 'rear' }

/** The Video page's info line under the camera switch. A camera that gave up keeps saying why after its switch turned off. */
export const cameraLine = (state: CameraLineState, active: boolean): string => {
  if (state.status === 'error' && state.error && (active || cameraGaveUp(state))) return state.error
  if (!active) return 'Off. Turn it on to show a camera on the video layer.'
  if (state.status === 'live') return `Live from the ${state.facing ? `${FACING_NAMES[state.facing]} ` : ''}camera.`
  return 'Starting the camera…'
}
