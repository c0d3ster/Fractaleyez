import { EASINGS } from '../utility/easings';


export default 
{
  /**
   * These are the options the analyser is checking to see which algorithm is going
   * to run. 
   */
  options: {

    /**
     * The peak detection algorithm compares the moment energy to the recent average
     * energy of the signal. 
     */
    peakDetection: {

      // If this boolean is set to true, the analyser will run the algorithm
      enabled: true,

      // options used by the peak detection algorithm
      options: {
        
        // the higher the threshold is, the harder a peak has to hit compared to
        // the rest of the audio 
        threshold: 1.8,

        // time in ms when a peak is not detectable after one has been detected
        ignoreTime: 300,

        // time in ms during energies are compared to the real-time energy value
        energyPersistence: 2000,

        // the time it takes for a peak to go from 1.0 to 0.0
        peakPersistency: 300,

        // This function is used to ease the decreasing value of a peak over time
        easing: EASINGS.linear

      }
    },

    /**
     * The multiband peak detection algorithm splits the signal into multiple bands.
     * For each band, it will run the peak detection algorithm to look for a peak, using
     * the options specified below
     */
    multibandPeakDetection: 
    {
      // If this boolean is set to true, the analuser will run the algorithm
      enabled: true,

      // options used by the multi-band peak detection algorithm
      options: {

        // number of bands in which the frequencies will be split, must be a pow of 2
        bands: 8,

        // the higher the threshold is, the harder a peak has to hit compared to
        // the rest of the audio. It is advised to use a lower threshold since the values
        // are less enclined to fluctuate
        threshold: 1.2,

        // time in ms when a peak is not detectable after one has been detected
        ignoreTime: 300,

        // time in ms during energies are compared to the real-time energy value
        energyPersistence: 1200,

        // the time it takes for a peak to go from 1.0 to 0.0
        peakPersistency: 300,

        // This function is used to ease the decreasing value of a peak over time
        easing: EASINGS.linear

      }
    },

    /**
     * If one of these values are set to true, the analyser will return them with the 
     * getAnalysedDataForVisualization() method. This will not impact the algorithms
     * proccessed on the audio. However, some on these values can't be set to true if
     * the algorithms computing them are not enabled
     */
    returns: {

      // if the analyser returns the time domain data 
      timedomainData: true,

      // if the analyser returns the frequencies data 
      frequenciesData: true,

      // energy of the signal 
      energy: true,

      // history of the last energies 
      energyHistory: true,

      // average of the energiesHistory
      energyAverage: true,

      // informations on the peak
      peak: true,

      // all the peaks detected 
      peakHistory: true,

      // energy of each band
      multibandEnergy: true,

      // history of each band energy
      multibandEnergyHistory: true,

      // average of each band energies history
      multibandEnergyAverage: true,

      // each band peak informations
      multibandPeak: true,

      // history of each band detected peaks !!! MUST BE EQUAL TO peakHistory due to poor conception (also good optimization)
      multibandPeakHistory: true

    }
  },
};