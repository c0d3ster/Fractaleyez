import { analyserConfig } from './analyser.config'
import { userConfig } from './user.config'
import { visualizerConfig } from './visualizer.config'
import { orbitConfig } from './orbit.config'
import { particleConfig } from './particle.config'
import { colorConfig } from './color.config'
import { videoConfig } from './video.config'
import { fractalConfig } from './fractal.config'
import { logoConfig } from './logo.config'
import { layerConfig } from './layers.config'

export type SliderItem = {
  name: string
  type: 'slider'
  defaultValue: number
  value: number
  min: number
  max: number
  step: number
}

export type CheckboxItem = {
  name: string
  type: 'checkbox'
  defaultValue: boolean
  value: boolean
}

export type MultiselectItem = {
  name: string
  type: 'multiselect'
  defaultValue: string[]
  value: string[]
  min: number
  max: number
}

export type ConfigItem = SliderItem | CheckboxItem | MultiselectItem

export type UserConfigSection = {
  speed: SliderItem
  rotationSpeed: SliderItem
  scaleFactor: SliderItem
  cameraBound: SliderItem
}

export type FractalConfigSection = {
  tour: SliderItem
}

export type AudioConfigSection = {
  soundThreshold: SliderItem
  ignoreTime: SliderItem
}

export type EffectsConfigSection = {
  cyclone: CheckboxItem
  wobWob: CheckboxItem
  switcheroo: CheckboxItem
  colorShift: CheckboxItem
  glow: CheckboxItem
  shockwave: CheckboxItem
}

export type OrbitConfigSection = {
  a: SliderItem
  b: SliderItem
  c: SliderItem
  d: SliderItem
  e: SliderItem
}

export type ColorConfigSection = {
  saturation: SliderItem
  rangeStart: SliderItem // the range handles on the palette strip, 0..1; an end before the start wraps through the seam
  rangeEnd: SliderItem
  palette: MultiselectItem // single-select via min:1,max:1; 'custom' or a named palette id (the default is 'rainbow')
  customStops: MultiselectItem // hex colors of the custom palette
  paletteCycles: SliderItem
  palettePhase: SliderItem
  paletteReverse: CheckboxItem
  paletteHardEdge: CheckboxItem // keeps the seam where a palette wraps instead of playing it out and back
}

export type ParticleConfigSection = {
  particleSize: SliderItem
  particlesPerLayer: SliderItem
  layers: SliderItem
  levels: SliderItem
  sprites: MultiselectItem
}

export type VideoConfigSection = {
  clips: string[]
  allClips: string[]
  index: number
}

/** Stored/authored shape of a preset's video config — allClips is the runtime clip catalog, computed by mergeVideo and never persisted. */
export type StoredVideoSection = Pick<VideoConfigSection, 'clips' | 'index'>

export type LayerKey = 'video' | 'fractal' | 'orbit' | 'logo' // widened as layer types are added
export type BlendMode = 'mask' | 'screen' | 'over' // fixed per layer for now (see createLayerMeta); no UI until it is configurable

export type LayerMeta = {
  enabled: CheckboxItem
  opacity: SliderItem
  blendMode: BlendMode // not a ConfigItem; not stored or loaded, always the layer's default
}

export type LayersConfigSection = {
  order: LayerKey[] // back to front: index 0 is farthest, the last entry is in front
  meta: Record<LayerKey, LayerMeta>
}

export type LogoConfigSection = {
  sprite: MultiselectItem // single-select via min:1,max:1
  threeD: CheckboxItem // off is flat: one plane that spins in the screen plane
  size: SliderItem // multiplier on the logo's base size
  tilt: SliderItem // how far the logo turns toward the camera position, 0 is always facing front
  spinSpeed: SliderItem
  beatScale: SliderItem
  shake: SliderItem
}

export type AppConfig = {
  user: UserConfigSection
  fractal: FractalConfigSection
  audio: AudioConfigSection
  effects: EffectsConfigSection
  color: ColorConfigSection
  particle: ParticleConfigSection
  orbit: OrbitConfigSection
  video: VideoConfigSection
  layers: LayersConfigSection
  logo: LogoConfigSection
}

const createLayerMeta = (enabled: boolean, blendMode: BlendMode = 'mask'): LayerMeta => ({
  enabled: { name: 'Enabled', type: 'checkbox', defaultValue: enabled, value: enabled },
  opacity: { name: 'Opacity', type: 'slider', defaultValue: layerConfig.OPACITY_DEFAULT, value: layerConfig.OPACITY_DEFAULT, min: layerConfig.OPACITY_MIN, max: layerConfig.OPACITY_MAX, step: layerConfig.OPACITY_STEP_SIZE },
  blendMode,
})

const pd = analyserConfig.options.peakDetection.options

export const configDefaults: AppConfig = {
  user: {
    speed: {
      name: 'Speed',
      type: 'slider',
      defaultValue: userConfig.speed_DEFAULT,
      value: userConfig.speed_DEFAULT,
      min: userConfig.speed_MIN,
      max: userConfig.speed_MAX,
      step: userConfig.speed_STEP_SIZE,
    },
    rotationSpeed: {
      name: 'Rotation',
      type: 'slider',
      defaultValue: userConfig.rotationSpeed_DEFAULT,
      value: userConfig.rotationSpeed_DEFAULT,
      min: userConfig.rotationSpeed_MIN,
      max: userConfig.rotationSpeed_MAX,
      step: userConfig.rotationSpeed_STEP_SIZE,
    },
    scaleFactor: {
      name: 'Scale',
      type: 'slider',
      defaultValue: userConfig.scaleFactor_DEFAULT,
      value: userConfig.scaleFactor_DEFAULT,
      min: userConfig.scaleFactor_MIN,
      max: userConfig.scaleFactor_MAX,
      step: userConfig.scaleFactor_STEP_SIZE,
    },
    cameraBound: {
      name: 'Sway',
      type: 'slider',
      defaultValue: userConfig.cameraBound_DEFAULT,
      value: userConfig.cameraBound_DEFAULT,
      min: userConfig.cameraBound_MIN,
      max: userConfig.cameraBound_MAX,
      step: userConfig.cameraBound_SEP_SIZE,
    },
  },
  fractal: {
    tour: {
      name: 'Tour',
      type: 'slider',
      defaultValue: fractalConfig.tour_DEFAULT,
      value: fractalConfig.tour_DEFAULT,
      min: fractalConfig.tour_MIN,
      max: fractalConfig.tour_MAX,
      step: fractalConfig.tour_STEP_SIZE,
    },
  },
  audio: {
    soundThreshold: {
      name: 'Threshold',
      type: 'slider',
      defaultValue: pd.threshold_DEFAULT,
      value: pd.threshold_DEFAULT,
      min: pd.threshold_MIN,
      max: pd.threshold_MAX,
      step: pd.threshold_STEP_SIZE,
    },
    ignoreTime: {
      name: 'Ignore Time',
      type: 'slider',
      defaultValue: pd.ignoreTime_DEFAULT,
      value: pd.ignoreTime_DEFAULT,
      min: pd.ignoreTime_MIN,
      max: pd.ignoreTime_MAX,
      step: pd.ignoreTime_STEP_SIZE,
    },
  },
  effects: {
    cyclone: { name: 'Cyclone', type: 'checkbox', defaultValue: visualizerConfig.cyclone, value: visualizerConfig.cyclone },
    wobWob: { name: 'Wob Wob', type: 'checkbox', defaultValue: visualizerConfig.wobwob, value: visualizerConfig.wobwob },
    switcheroo: { name: 'Switcheroo', type: 'checkbox', defaultValue: visualizerConfig.switcheroo, value: visualizerConfig.switcheroo },
    colorShift: { name: 'Color Shift', type: 'checkbox', defaultValue: visualizerConfig.colorShift, value: visualizerConfig.colorShift },
    glow: { name: 'Glow', type: 'checkbox', defaultValue: visualizerConfig.glow, value: visualizerConfig.glow },
    shockwave: { name: 'Shockwave', type: 'checkbox', defaultValue: visualizerConfig.shockwave, value: visualizerConfig.shockwave },
  },
  color: {
    saturation: { name: 'Saturation', type: 'slider', defaultValue: colorConfig.saturation_DEFAULT, value: colorConfig.saturation_DEFAULT, min: colorConfig.saturation_MIN, max: colorConfig.saturation_MAX, step: colorConfig.saturation_STEP_SIZE },
    rangeStart: { name: 'Range Start', type: 'slider', defaultValue: colorConfig.rangeStart_DEFAULT, value: colorConfig.rangeStart_DEFAULT, min: colorConfig.rangeStart_MIN, max: colorConfig.rangeStart_MAX, step: colorConfig.rangeStart_STEP_SIZE },
    rangeEnd: { name: 'Range End', type: 'slider', defaultValue: colorConfig.rangeEnd_DEFAULT, value: colorConfig.rangeEnd_DEFAULT, min: colorConfig.rangeEnd_MIN, max: colorConfig.rangeEnd_MAX, step: colorConfig.rangeEnd_STEP_SIZE },
    palette: { name: 'Palette', type: 'multiselect', defaultValue: [colorConfig.palette_DEFAULT], value: [colorConfig.palette_DEFAULT], min: 1, max: 1 },
    customStops: { name: 'Custom Colors', type: 'multiselect', defaultValue: [...colorConfig.customStops_DEFAULT], value: [...colorConfig.customStops_DEFAULT], min: colorConfig.customStops_MIN, max: colorConfig.customStops_MAX },
    paletteCycles: { name: 'Cycles', type: 'slider', defaultValue: colorConfig.paletteCycles_DEFAULT, value: colorConfig.paletteCycles_DEFAULT, min: colorConfig.paletteCycles_MIN, max: colorConfig.paletteCycles_MAX, step: colorConfig.paletteCycles_STEP_SIZE },
    palettePhase: { name: 'Phase', type: 'slider', defaultValue: colorConfig.palettePhase_DEFAULT, value: colorConfig.palettePhase_DEFAULT, min: colorConfig.palettePhase_MIN, max: colorConfig.palettePhase_MAX, step: colorConfig.palettePhase_STEP_SIZE },
    paletteReverse: { name: 'Reverse', type: 'checkbox', defaultValue: false, value: false },
    paletteHardEdge: { name: 'Hard Edge', type: 'checkbox', defaultValue: false, value: false },
  },
  particle: {
    particleSize: { name: 'Size', type: 'slider', defaultValue: particleConfig.size_DEFAULT, value: particleConfig.size_DEFAULT, min: particleConfig.size_MIN, max: particleConfig.size_MAX, step: particleConfig.size_STEP_SIZE },
    particlesPerLayer: { name: 'Count', type: 'slider', defaultValue: particleConfig.particles_DEFAULT, value: particleConfig.particles_DEFAULT, min: particleConfig.particles_MIN, max: particleConfig.particles_MAX, step: particleConfig.particles_STEP_SIZE },
    layers: { name: 'Layers', type: 'slider', defaultValue: particleConfig.layers_DEFAULT, value: particleConfig.layers_DEFAULT, min: particleConfig.layers_MIN, max: particleConfig.layers_MAX, step: particleConfig.layers_STEP_SIZE },
    levels: { name: 'Levels', type: 'slider', defaultValue: particleConfig.levels_DEFAULT, value: particleConfig.levels_DEFAULT, min: particleConfig.levels_MIN, max: particleConfig.levels_MAX, step: particleConfig.levels_STEP_SIZE },
    sprites: { name: 'Sprites', type: 'multiselect', defaultValue: [...particleConfig.sprites_DEFAULT], value: [...particleConfig.sprites_DEFAULT], min: particleConfig.sprites_MIN, max: particleConfig.sprites_MAX },
  },
  orbit: {
    a: { name: 'Radius', type: 'slider', defaultValue: orbitConfig.A_DEFAULT, value: orbitConfig.A_DEFAULT, min: orbitConfig.A_MIN, max: orbitConfig.A_MAX, step: orbitConfig.A_STEP_SIZE },
    b: { name: 'Spread', type: 'slider', defaultValue: orbitConfig.B_DEFAULT, value: orbitConfig.B_DEFAULT, min: orbitConfig.B_MIN, max: orbitConfig.B_MAX, step: orbitConfig.B_STEP_SIZE },
    c: { name: 'Sharpness', type: 'slider', defaultValue: orbitConfig.C_DEFAULT, value: orbitConfig.C_DEFAULT, min: orbitConfig.C_MIN, max: orbitConfig.C_MAX, step: orbitConfig.C_STEP_SIZE },
    d: { name: 'Shift', type: 'slider', defaultValue: orbitConfig.D_DEFAULT, value: orbitConfig.D_DEFAULT, min: orbitConfig.D_MIN, max: orbitConfig.D_MAX, step: orbitConfig.D_STEP_SIZE },
    e: { name: 'Drift', type: 'slider', defaultValue: orbitConfig.E_DEFAULT, value: orbitConfig.E_DEFAULT, min: orbitConfig.E_MIN, max: orbitConfig.E_MAX, step: orbitConfig.E_STEP_SIZE },
  },
  video: {
    clips: [...videoConfig.clips],
    allClips: [...videoConfig.allClips],
    index: videoConfig.index,
  },
  layers: {
    order: [...layerConfig.ORDER_DEFAULT],
    meta: {
      video: createLayerMeta(true),
      fractal: createLayerMeta(true),
      orbit: createLayerMeta(true, 'screen'),
      logo: createLayerMeta(false, 'over'),
    },
  },
  logo: {
    sprite: { name: 'Sprite', type: 'multiselect', defaultValue: [logoConfig.sprite_DEFAULT], value: [logoConfig.sprite_DEFAULT], min: 1, max: 1 },
    threeD: { name: '3D', type: 'checkbox', defaultValue: logoConfig.threeD_DEFAULT, value: logoConfig.threeD_DEFAULT },
    size: { name: 'Size', type: 'slider', defaultValue: logoConfig.size_DEFAULT, value: logoConfig.size_DEFAULT, min: logoConfig.size_MIN, max: logoConfig.size_MAX, step: logoConfig.size_STEP_SIZE },
    tilt: { name: 'Camera Tilt', type: 'slider', defaultValue: logoConfig.tilt_DEFAULT, value: logoConfig.tilt_DEFAULT, min: logoConfig.tilt_MIN, max: logoConfig.tilt_MAX, step: logoConfig.tilt_STEP_SIZE },
    spinSpeed: { name: 'Spin Speed', type: 'slider', defaultValue: logoConfig.spinSpeed_DEFAULT, value: logoConfig.spinSpeed_DEFAULT, min: logoConfig.spinSpeed_MIN, max: logoConfig.spinSpeed_MAX, step: logoConfig.spinSpeed_STEP_SIZE },
    beatScale: { name: 'Beat Scale', type: 'slider', defaultValue: logoConfig.beatScale_DEFAULT, value: logoConfig.beatScale_DEFAULT, min: logoConfig.beatScale_MIN, max: logoConfig.beatScale_MAX, step: logoConfig.beatScale_STEP_SIZE },
    shake: { name: 'Shake', type: 'slider', defaultValue: logoConfig.shake_DEFAULT, value: logoConfig.shake_DEFAULT, min: logoConfig.shake_MIN, max: logoConfig.shake_MAX, step: logoConfig.shake_STEP_SIZE },
  },
}
