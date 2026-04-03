import { EASINGS } from '../tools/easings'

export const analyserConfig = {
  options: {
    peakDetection: {
      enabled: true,
      options: {
        threshold_DEFAULT: 2,
        threshold_MIN: 0,
        threshold_MAX: 5,
        threshold_STEP_SIZE: 0.1,

        ignoreTime_DEFAULT: 250,
        ignoreTime_MIN: 0,
        ignoreTime_MAX: 2500,
        ignoreTime_STEP_SIZE: 50,

        energyPersistence: 2000,
        peakPersistency: 300,
        easing: EASINGS.linear,
      },
    },
    multibandPeakDetection: {
      enabled: true,
      options: {
        bands: 8,
        threshold: 1.2,
        ignoreTime: 300,
        energyPersistence: 1200,
        peakPersistency: 300,
        easing: EASINGS.linear,
      },
    },
    returns: {
      timedomainData: true,
      frequenciesData: true,
      energy: true,
      energyHistory: true,
      energyAverage: true,
      peak: true,
      peakHistory: true,
      multibandEnergy: true,
      multibandEnergyHistory: true,
      multibandEnergyAverage: true,
      multibandPeak: true,
      multibandPeakHistory: true,
    },
  },
}
