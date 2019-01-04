import AnalyserConfig from './analyser.config';
import UserConfig from './user.config';
import VisualizerConfig from './visualizer.config';
import OrbitConfig from './orbit.config';
import ParticleConfig from './particle.config';

export default {
  user : {
    speed : {
      name: 'Speed',
      type: 'slider',
      defaultValue: UserConfig.speed_DEFAULT,
      value: UserConfig.speed_DEFAULT,
      min: UserConfig.speed_MIN,
      max: UserConfig.speed_MAX,
      step: UserConfig.speed_STEP_SIZE
    },
    rotationSpeed : {
      name: 'Rotation Speed',
      type: 'slider',
      defaultValue: UserConfig.rotationSpeed_DEFAULT,
      value: UserConfig.rotationSpeed_DEFAULT,
      min: UserConfig.rotationSpeed_MIN,
      max: UserConfig.rotationSpeed_MAX,
      step: UserConfig.rotationSpeed_STEP_SIZE
    },
    scaleFactor : {
      name: 'Scale Factor',
      type: 'slider',
      defaultValue: UserConfig.scaleFactor_DEFAULT,
      value: UserConfig.scaleFactor_DEFAULT,
      min: UserConfig.scaleFactor_MIN,
      max: UserConfig.scaleFactor_MAX,
      step: UserConfig.scaleFactor_STEP_SIZE
    },
    cameraBound : {
      name: 'Camera Bound',
      type: 'slider',
      defaultValue: UserConfig.cameraBound_DEFAULT,
      value: UserConfig.cameraBound_DEFAULT,
      min: UserConfig.cameraBound_MIN,
      max: UserConfig.cameraBound_MAX,
      step: UserConfig.cameraBound_SEP_SIZE
    }
  },
  audio : {
    soundThreshold: {
      name: 'Sound Threshold',
      type: 'slider',
      defaultValue: AnalyserConfig.options.peakDetection.options.threshold_DEFAULT,
      value: AnalyserConfig.options.peakDetection.options.threshold_DEFAULT,
      min: AnalyserConfig.options.peakDetection.options.threshold_MIN,
      max: AnalyserConfig.options.peakDetection.options.threshold_MAX,
      step: AnalyserConfig.options.peakDetection.options.threshold_STEP_SIZE
    },
    ignoreTime : {
      name: 'Ignore Time',
      type: 'slider',
      defaultValue: AnalyserConfig.options.peakDetection.options.ignoreTime_DEFAULT,
      value: AnalyserConfig.options.peakDetection.options.ignoreTime_DEFAULT,
      min: AnalyserConfig.options.peakDetection.options.ignoreTime_MIN,
      max: AnalyserConfig.options.peakDetection.options.ignoreTime_MAX,
      step: AnalyserConfig.options.peakDetection.options.ignoreTime_STEP_SIZE
    },
  },
  effects: {
    cyclone: {
      name: 'Cyclone',
      type: 'checkbox',
      defaultValue: VisualizerConfig.cyclone,
      value: VisualizerConfig.cyclone
    },
    wobWob: {
      name: 'Wob Wob',
      type: 'checkbox',
      defaultValue: VisualizerConfig.wobwob,
      value: VisualizerConfig.wobwob
    },
    switcheroo: {
      name: 'Switcheroo',
      type: 'checkbox',
      defaultValue: VisualizerConfig.switcheroo,
      value: VisualizerConfig.switcheroo
    },
    colorShift: {
      name: 'Color Shift',
      type: 'checkbox',
      defaultValue: VisualizerConfig.colorShift,
      value: VisualizerConfig.colorShift
    },
    glow: {
      name: 'Glow',
      type: 'checkbox',
      defaultValue: VisualizerConfig.glow,
      value: VisualizerConfig.glow
    },
    shockwave: {
      name: 'Shockwave',
      type: 'checkbox',
      defaultValue: VisualizerConfig.shockwave,
      value: VisualizerConfig.shockwave
    },
  },
  orbit: {
    a : {
      name: 'A',
      type: 'slider',
      defaultValue: OrbitConfig.A_DEFAULT,
      value: OrbitConfig.A_DEFAULT,
      min: OrbitConfig.A_MIN,
      max: OrbitConfig.A_MAX,
      step: OrbitConfig.A_STEP_SIZE
    },
    b : {
      name: 'B',
      type: 'slider',
      defaultValue: OrbitConfig.B_DEFAULT,
      value: OrbitConfig.B_DEFAULT,
      min: OrbitConfig.B_MIN,
      max: OrbitConfig.B_MAX,
      step: OrbitConfig.B_STEP_SIZE
    },
    c : {
      name: 'C',
      type: 'slider',
      defaultValue: OrbitConfig.C_DEFAULT,
      value: OrbitConfig.C_DEFAULT,
      min: OrbitConfig.C_MIN,
      max: OrbitConfig.C_MAX,
      step: OrbitConfig.C_STEP_SIZE
    },
    d : {
      name: 'D',
      type: 'slider',
      defaultValue: OrbitConfig.D_DEFAULT,
      value: OrbitConfig.D_DEFAULT,
      min: OrbitConfig.D_MIN,
      max: OrbitConfig.D_MAX,
      step: OrbitConfig.D_STEP_SIZE
    },
    e : {
      name: 'E',
      type: 'slider',
      defaultValue: OrbitConfig.E_DEFAULT,
      value: OrbitConfig.E_DEFAULT,
      min: OrbitConfig.E_MIN,
      max: OrbitConfig.E_MAX,
      step: OrbitConfig.E_STEP_SIZE
    },
  },
  particle : {
    particlesPerLayer: {
      name: 'Particles Per Layer',
      type: 'slider',
      defaultValue: ParticleConfig.particles_DEFAULT,
      value: ParticleConfig.particles_DEFAULT,
      min: ParticleConfig.particles_MIN,
      max: ParticleConfig.particles_MAX,
      step: ParticleConfig.particles_STEP_SIZE
    }
  }
};
