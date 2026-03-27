import { analyserConfig } from './analyser.config'
import { userConfig } from './user.config'
import { visualizerConfig } from './visualizer.config'
import { orbitConfig } from './orbit.config'
import { particleConfig } from './particle.config'
import { videoConfig } from './video.config'

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

export type ParticleConfigSection = {
  particleSize: SliderItem
  particlesPerLayer: SliderItem
  layers: SliderItem
  levels: SliderItem
  saturation: SliderItem
  sprites: MultiselectItem
}

export type VideoConfigSection = {
  clips: string[]
  allClips: string[]
  index: number
}

export type AppConfig = {
  user: UserConfigSection
  audio: AudioConfigSection
  effects: EffectsConfigSection
  orbit: OrbitConfigSection
  particle: ParticleConfigSection
  video: VideoConfigSection
}

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
      name: 'Rotation Speed',
      type: 'slider',
      defaultValue: userConfig.rotationSpeed_DEFAULT,
      value: userConfig.rotationSpeed_DEFAULT,
      min: userConfig.rotationSpeed_MIN,
      max: userConfig.rotationSpeed_MAX,
      step: userConfig.rotationSpeed_STEP_SIZE,
    },
    scaleFactor: {
      name: 'Scale Factor',
      type: 'slider',
      defaultValue: userConfig.scaleFactor_DEFAULT,
      value: userConfig.scaleFactor_DEFAULT,
      min: userConfig.scaleFactor_MIN,
      max: userConfig.scaleFactor_MAX,
      step: userConfig.scaleFactor_STEP_SIZE,
    },
    cameraBound: {
      name: 'Camera Bound',
      type: 'slider',
      defaultValue: userConfig.cameraBound_DEFAULT,
      value: userConfig.cameraBound_DEFAULT,
      min: userConfig.cameraBound_MIN,
      max: userConfig.cameraBound_MAX,
      step: userConfig.cameraBound_SEP_SIZE,
    },
  },
  audio: {
    soundThreshold: {
      name: 'Sound Threshold',
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
  orbit: {
    a: { name: 'Radius', type: 'slider', defaultValue: orbitConfig.A_DEFAULT, value: orbitConfig.A_DEFAULT, min: orbitConfig.A_MIN, max: orbitConfig.A_MAX, step: orbitConfig.A_STEP_SIZE },
    b: { name: 'Spread', type: 'slider', defaultValue: orbitConfig.B_DEFAULT, value: orbitConfig.B_DEFAULT, min: orbitConfig.B_MIN, max: orbitConfig.B_MAX, step: orbitConfig.B_STEP_SIZE },
    c: { name: 'Sharpness', type: 'slider', defaultValue: orbitConfig.C_DEFAULT, value: orbitConfig.C_DEFAULT, min: orbitConfig.C_MIN, max: orbitConfig.C_MAX, step: orbitConfig.C_STEP_SIZE },
    d: { name: 'Shift', type: 'slider', defaultValue: orbitConfig.D_DEFAULT, value: orbitConfig.D_DEFAULT, min: orbitConfig.D_MIN, max: orbitConfig.D_MAX, step: orbitConfig.D_STEP_SIZE },
    e: { name: 'Drift', type: 'slider', defaultValue: orbitConfig.E_DEFAULT, value: orbitConfig.E_DEFAULT, min: orbitConfig.E_MIN, max: orbitConfig.E_MAX, step: orbitConfig.E_STEP_SIZE },
  },
  particle: {
    particleSize: { name: 'Particle Size', type: 'slider', defaultValue: particleConfig.size_DEFAULT, value: particleConfig.size_DEFAULT, min: particleConfig.size_MIN, max: particleConfig.size_MAX, step: particleConfig.size_STEP_SIZE },
    particlesPerLayer: { name: 'Particles Per Layer', type: 'slider', defaultValue: particleConfig.particles_DEFAULT, value: particleConfig.particles_DEFAULT, min: particleConfig.particles_MIN, max: particleConfig.particles_MAX, step: particleConfig.particles_STEP_SIZE },
    layers: { name: 'Layers', type: 'slider', defaultValue: particleConfig.layers_DEFAULT, value: particleConfig.layers_DEFAULT, min: particleConfig.layers_MIN, max: particleConfig.layers_MAX, step: particleConfig.layers_STEP_SIZE },
    levels: { name: 'Levels', type: 'slider', defaultValue: particleConfig.levels_DEFAULT, value: particleConfig.levels_DEFAULT, min: particleConfig.levels_MIN, max: particleConfig.levels_MAX, step: particleConfig.levels_STEP_SIZE },
    saturation: { name: 'Saturation', type: 'slider', defaultValue: particleConfig.saturation_DEFAULT, value: particleConfig.saturation_DEFAULT, min: particleConfig.saturation_MIN, max: particleConfig.saturation_MAX, step: particleConfig.saturation_STEP_SIZE },
    sprites: { name: 'Sprites', type: 'multiselect', defaultValue: [...particleConfig.sprites_DEFAULT], value: [...particleConfig.sprites_DEFAULT], min: particleConfig.sprites_MIN, max: particleConfig.sprites_MAX },
  },
  video: {
    clips: [...videoConfig.clips],
    allClips: [...videoConfig.allClips],
    index: videoConfig.index,
  },
}
