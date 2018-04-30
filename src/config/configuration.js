import AnalyserConfig from './analyser.config';
import UserConfig from './user.config';
import VisualizerConfig from './visualizer.config';


export default {
  user : {
    speed : {
    defaultValue: UserConfig.speed,
    value: UserConfig.speed,
    name: "Speed",
    min: 0, max: 40, step: .5
    },
    rotationSpeed : {
      defaultValue: UserConfig.rotationSpeed,
      value: UserConfig.rotationSpeed,
      name: "Rotation Speed",
      min: -1, max: 1, step: .001
    }
  },
  audio : {
    threshold: {
      defaultValue: AnalyserConfig.options.peakDetection.options.threshold,
      value: AnalyserConfig.options.peakDetection.options.threshold,
      name: "Sound Threshold",
      min: 0, max: 6, step: 0.1
    },
    ignoreTime : {
      defaultValue: AnalyserConfig.options.peakDetection.options.ignoreTime,
      value: AnalyserConfig.options.peakDetection.options.ignoreTime,
      name: "Ignore Time",
      min: 0, max: 5000, step: 10
    },

  },
  visualizer: {

    }
};
