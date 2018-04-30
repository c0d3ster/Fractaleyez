import AnalyserConfig from './analyser.config';
import UserConfig from './user.config';
import VisualizerConfig from './visualizer.config';

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
      min: -1, max: 1, step: .001
    }
  },
  audio : {
    threshold: {
      name: 'Sound Threshold',
      type: 'slider',
      defaultValue: AnalyserConfig.options.peakDetection.options.threshold,
      value: AnalyserConfig.options.peakDetection.options.threshold,
      min: 0, max: 6, step: 0.1
    },
    ignoreTime : {
      name: 'Ignore Time',
      type: 'slider',
      defaultValue: AnalyserConfig.options.peakDetection.options.ignoreTime,
      value: AnalyserConfig.options.peakDetection.options.ignoreTime,
      min: 0, max: 5000, step: 10
    },
  },
  visualizer: {
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

  }
};
