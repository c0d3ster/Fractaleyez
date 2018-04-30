import AnalyserConfig from './analyser.config';
import UserConfig from './user.config';
import VisualizerConfig from './visualizer.config';


export default {
  user : {
    speed : {
    defaultValue: UserConfig.speed,
    value: UserConfig.speed,
    property: "Speed",
    min: 0, max: 40, step: .5
    }
  },
  audio : {
    threshold: {
      defaultValue: AnalyserConfig.options.peakDetection.options.threshold,
      value: AnalyserConfig.options.peakDetection.options.threshold,
      property: "Sound Threshold",
      min: 0, max: 6, step: 0.1,
    },
    ignoreTime : {
      property: AnalyserConfig.options.peakDetection.options.ignoreTime,
      name: "Ignore Time",
      min: 0, max: 5000, step: 10
    },

  },
  visualizer: [{

    }
  ]

};
