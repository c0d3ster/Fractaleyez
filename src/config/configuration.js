import AnalyserConfig from './analyser.config';
import UserConfig from './user.config';
import VisualizerConfig from './visualizer.config';
import OrbitConfig from './orbit.config';

export default {
  user : {
    speed : {
      name: 'Speed',
      type: 'slider',
      defaultValue: UserConfig.speed,
      value: UserConfig.speed,
      min: 0, max: 40, step: .5
    },
    rotationSpeed : {
      name: 'Rotation Speed',
      type: 'slider',
      defaultValue: UserConfig.rotationSpeed,
      value: UserConfig.rotationSpeed,
      min: -50, max: 50, step: .25
    },
    scaleFactor : {
      name: 'Scale Factor',
      type: 'slider',
      defaultValue: UserConfig.scaleFactor,
      value: UserConfig.scaleFactor,
      min: 100, max: 2000, step: 100
    },
    cameraBound : {
      name: 'Camera Bound',
      type: 'slider',
      defaultValue: UserConfig.cameraBound,
      value: UserConfig.cameraBound,
      min: 0, max: 500, step: 20
    }
  },
  audio : {
    threshold: {
      name: 'Sound Threshold',
      type: 'slider',
      defaultValue: AnalyserConfig.options.peakDetection.options.threshold,
      value: AnalyserConfig.options.peakDetection.options.threshold,
      min: 0, max: 5, step: 0.1
    },
    ignoreTime : {
      name: 'Ignore Time',
      type: 'slider',
      defaultValue: AnalyserConfig.options.peakDetection.options.ignoreTime,
      value: AnalyserConfig.options.peakDetection.options.ignoreTime,
      min: 0, max: 2500, step: 50
    },
  },
  effects: {
    cyclone: {
      name: 'Cyclone',
      type: 'checkbox',
      defaultValue: VisualizerConfig.cyclone,
      value: VisualizerConfig.cyclone
    },
    wobwob: {
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
      min: OrbitConfig.A_MIN, max: OrbitConfig.A_MAX, step: OrbitConfig.A_STEP_SIZE
    },
    b : {
      name: 'B',
      type: 'slider',
      defaultValue: OrbitConfig.B_DEFAULT,
      value: OrbitConfig.B_DEFAULT,
      min: OrbitConfig.B_MIN, max: OrbitConfig.B_MAX, step: OrbitConfig.B_STEP_SIZE
    },
    c : {
      name: 'C',
      type: 'slider',
      defaultValue: OrbitConfig.C_DEFAULT,
      value: OrbitConfig.C_DEFAULT,
      min: OrbitConfig.C_MIN, max: OrbitConfig.C_MAX, step: OrbitConfig.C_STEP_SIZE
    },
    d : {
      name: 'D',
      type: 'slider',
      defaultValue: OrbitConfig.D_DEFAULT,
      value: OrbitConfig.D_DEFAULT,
      min: OrbitConfig.D_MIN, max: OrbitConfig.D_MAX, step: OrbitConfig.D_STEP_SIZE
    },
    e : {
      name: 'E',
      type: 'slider',
      defaultValue: OrbitConfig.E_DEFAULT,
      value: OrbitConfig.E_DEFAULT,
      min: OrbitConfig.E_MIN, max: OrbitConfig.E_MAX, step: OrbitConfig.E_STEP_SIZE
    },
  }
};
