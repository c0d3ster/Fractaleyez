import AppConfig from '../config/app.config';
import AnalyserConfig from '../config/analyser.config';

import { AudioData } from '../audiostream/audio-data';
import { AudioAnalysedData, AudioAnalysedDataForVisualization, Peak } from './audio-analysed-data';
import { EASINGS } from '../utility/easings';


/**
 * Provides a flexible analysis to an audio stream
 * Some papers I used for the peak detection algorithms
 * [http://archive.gamedev.net/archive/reference/programming/features/beatdetection/]
 * [http://joesul.li/van/beat-detection-using-web-audio/]
 * This implementation differs from those shown in those papers, but they are
 * a good start to understand how peaks can be detected
 */
export class AudioAnalyser
{
  /**
   * @param {number} bufferSize Size of the data buffer
   */
  constructor( bufferSize )
  {
    this.bufferSize = bufferSize;
    this.data = new AudioAnalysedData( bufferSize );
    this.iterations = 0;

    if( AppConfig.checkConfig ) this.checkOptions( AnalyserConfig );
    if( AppConfig.showloginfos ) console.log( `Analyser initialized\n------------` );
  }


  /**
   * Analyse the data provided by the AudioStream
   * @param {AudioData} audioData Data provided by the AudioStream.getAudioData()
   * @param deltaTime Elapsed time since last analysis
   * @param currentTimer The timer of the current loop
   */
  analyse( audioData, deltaTime, currentTimer )
  {
    this.iterations++;

    /**
     * This method looks horrible but the logical tests are useful to save CPU usage
     * if all the analysis are not required by the visualizer
     */

    this.data.setTimedomainData( audioData.timedomainData );
    this.data.setFrequenciesData( audioData.frequencyData );

    // Peak detection
    let returns = AnalyserConfig.options.returns;

    if( returns.energy || returns.energyAverage || returns.energyHistory || returns.peak || returns.peakHistory )
    {
      // we first compute the energy and push it to the energy history
      this.data.pushNewEnergy( this.computeEnergy(this.data.getTimedomainData()), deltaTime );

      if( returns.energyAverage || returns.peak || returns.peakHistory )
      {
        this.data.setEnergyAverage( this.computeLocalEnergyAverage(this.data.getEnergyHistory()) );

        if( returns.peak || returns.peakHistory )
        {
          this.computePeakDetection( this.data.getEnergy(), this.data.getEnergyAverage(), this.data.peak, this.data.peakHistory, currentTimer, 
                                     AnalyserConfig.options.peakDetection.options.threshold, AnalyserConfig.options.peakDetection.options.peakPersistency, AnalyserConfig.options.peakDetection.options.ignoreTime, EASINGS.linear );
        }
      }
    }
    
    if( returns.multibandEnergy || returns.multibandEnergyAverage || returns.multibandEnergyHistory || returns.multibandPeak || returns.multibandPeakHistory )
    {
      this.data.pushNewMultibandEnergy( this.computeMultibandEnergy( audioData.frequencyData, AnalyserConfig.options.multibandPeakDetection.options.bands ), deltaTime );
      
      if( returns.multibandEnergyAverage || returns.multibandPeak || returns.multibandPeakHistory )
      {
        this.data.setMultibandEnergyAverage( this.computeMultibandLocalEnergyAverage(this.data.getMultibandEnergyHistory()) );

        if( returns.multibandPeakHistory || returns.multibandPeak )
        {
          this.computeMultibandPeakDetection( this.data.getMultibandEnergy(), this.data.getMultibandEnergyAverage(), this.data.multibandPeak, this.data.multibandPeakHistory, currentTimer,
                                              AnalyserConfig.options.multibandPeakDetection.options.threshold, AnalyserConfig.options.multibandPeakDetection.options.peakPersistency, AnalyserConfig.options.multibandPeakDetection.options.ignoreTime, EASINGS.linear );  
        }
      }
    }
  }


  /**
   * This function check if the config is set correctly. It only shows an error if needed.
   * @param {AnalyserConfig} config Config to check
   */
  checkOptions( config )
  {
    if( AppConfig.showloginfos ) console.log( `Checking if the analyser configuration is correct` );

    // we first check if some values are correct 
    if( config.options.multibandPeakDetection.enabled )
    {
      if( !(config.options.multibandPeakDetection.options.bands && (config.options.multibandPeakDetection.options.bands & (config.options.multibandPeakDetection.options.bands - 1)) === 0) )
        if( AppConfig.showerrors ) console.error( `The number of bands for the multiband detection algorithm must be a pow of 2.` );
    }

    if( config.options.returns.peakHistory != config.options.returns.multibandPeakHistory )
    {
      if( AppConfig.showerrors ) console.error( `Due to the conception of the analyser, the ` );
    }

    // we check if the return values can be returned
    if( !config.options.multibandPeakDetection.enabled )
    {
      if( config.options.returns.multibandPeak )
        if( AppConfig.showerrors ) console.error( `The multiband peak can't be computed if the multiband peak detection algorithm is disabled.` );
      if( config.options.returns.multibandPeakHistory )
        if( AppConfig.showerrors ) console.error( `The multiband peak history can't be computed if the multiband peak detection algorithm is disabled.` );
    }
    if( !config.options.peakDetection.enabled )
    {
      if( config.options.returns.peak )
        if( AppConfig.showerrors ) console.error( `The peak can't be computed if the peak detection algorithm is disabled.` );
      if( config.options.returns.peakHistory )
        if( AppConfig.showerrors ) console.error( `The peak history can't be computed if the peak detection algorithm is disabled.` );
    }

    if( AppConfig.showloginfos ) console.log( `Config checked.\n------------` );
  }


  /**
   * @return {AudioAnalysedData} Full analysed data
   */
  getAnalysedData()
  {
    return this.data;
  }


  /**
   * @return {AudioAnalysedDataForVisualization} Only the data specified in the analyser config
   */
  getAnalysedDataForVisualization()
  {
    return new AudioAnalysedDataForVisualization( this.data );
  }


  /**
   * Computes the energy of a signal
   * @param {Uint8Array} timedomainData The timedomain data of the signal
   * @return {number} The energy of the timedomain data
   */
  computeEnergy( timedomainData )
  {
    let energy = 0;
    for( let i = 0; i < timedomainData.length; i++ )
      energy+= Math.abs( timedomainData[i] - 128 );
    return energy/timedomainData.length;
  }


  /**
   * Computes the local average of the energy history
   * @param {Array} energyHistory 
   * @returns {number} the average energy of the history
   */
  computeLocalEnergyAverage( energyHistory )
  {
    return energyHistory.reduce( (a,b) => a+b, 0 ) / energyHistory.length;
  }


  /**
   * Uses the [at]param peak to check if a peak has been detected recently and updates 
   * its values, if not it checks if a peak is detected
   * @param {number} energy energy of the moment
   * @param {number} energyAverage average of the last energies
   * @param {Peak} peak Informations on the peak
   * @param {Array} peakHistory History of the recorded peaks
   * @param {*} currentTimer the absolute timer on the current loop 
   * @param {number} threshold the higher this value is, the harder the peak has to hit to be detected
   * @param {number} peakPersistency the time it takes for the peak valeu to go from 1 to 0
   * @param {number} ignoreTime time when a peak can't be detected after a detection
   * @param {*} interpolationFunction [0;1] => [0;1]
   */
  computePeakDetection( energy, energyAverage, peak, peakHistory, currentTimer, threshold, peakPersistency, ignoreTime, interpolationFunction )
  {
    // if a peak has already been detected
    if( peak.timer != null )
    {
      // if a peak has been detected recently, we can't detect a new peak during ignoreTime
      // we only decrease the value of the peak
      if( currentTimer - peak.timer <= ignoreTime )
      {
        // we decrease the value of the peak if it's not 0
        if( peak.value > 0.0 )
        {
          peak.value = this.peakInterpolation( currentTimer, peak.timer, peakPersistency, interpolationFunction );
        }
      }
      else
      {
        // we try a peak detection
        if( energy / energyAverage > threshold ) // we have a peak
        {
          let detectedPeak = new Peak( 1.0, currentTimer, energy );
          if( AnalyserConfig.options.returns.peakHistory )
            peakHistory.push( detectedPeak );
          peak.copy( detectedPeak );
        }
        else if( peak.value > 0.0 ) // if the detected peak is still not to 0 we decrease its value
        {
          peak.value = this.peakInterpolation( currentTimer, peak.timer, peakPersistency, interpolationFunction );
        }
      }
    }
    else // we try a peak detection
    {
      if( energy / energyAverage > threshold ) // we have a peak
      {
        let detectedPeak = new Peak( 1.0, currentTimer, energy );
        if( AnalyserConfig.options.returns.peakHistory )
          peakHistory.push( detectedPeak );
        peak.copy( detectedPeak );
      }
    }
  }


  /**
   * @param {Uint8Array} frequencyData the frequencies data
   * @param {number} nbBands Number of bands
   * @returns {Array} the array energy of each band
   */
  computeMultibandEnergy( frequencyData, nbBands )
  {
    let fSize = frequencyData.length,
        bandsEnergy = new Array( nbBands );

    // we parse each band
    for( let band = 0; band < nbBands; band++ )
    {
      let firstIndex = this.bandInterpolation( band / nbBands ) * fSize,
          lastIndex = this.bandInterpolation( (band+1) / nbBands ) * fSize,
          bandEnergy = 0;

      // for each band we parse the frequencies
      for( let f = firstIndex; f < lastIndex; f++ )
        bandEnergy+= frequencyData[f]; 
      
      bandsEnergy[band] = bandEnergy/(lastIndex-firstIndex);
    }

    return bandsEnergy;
  }


  /**
   * @param {Array} energiesHistory The history of each band energy
   * @returns {Array} the array of each band energy average
   */
  computeMultibandLocalEnergyAverage( energiesHistory )
  {
    let energiesAverage = new Array( AnalyserConfig.options.multibandPeakDetection.options.bands );

    // we init the values
    for( let i = 0; i < AnalyserConfig.options.multibandPeakDetection.options.bands; i++ )
      energiesAverage[i] = 0;

    // first we go through the history 
    for( let i = 0; i < energiesHistory.length; i++ )
    {
      // then we go though each band
      for( let b = 0; b < energiesHistory[i].length; b++ )
      {
        energiesAverage[b]+= energiesHistory[i][b];
      }
    }

    for( let i = 0; i < AnalyserConfig.options.multibandPeakDetection.options.bands; i++ )
      energiesAverage[i]/= energiesHistory.length;
    
    return energiesAverage;
  }


  /**
   * Parse each band to see if there is a local peak on each one 
   * of them. Uses the computePeakDetection method in that purpose.
   * @param {Array} multibandEnergy array of the computed energy of each band
   * @param {Array} multibandEnergyAverage array of the computed average local energy of each band
   * @param {Array} multibandPeak array of each band peak
   * @param {Array} multibandPeakHistory array of each band peaks history
   * @param {*} currentTimer absolute timer on the current frame
   * @param {number} threshold the higher it is, the harder a peak has to hit to be detected
   * @param {number} peakPersistency time it takes for a peak to go from 1 to 0
   * @param {number} ignoreTime time during a peak can't be detected after a detection
   * @param {*} interpolationFunction [0; 1] => [0; 1] decrease function of the peak
   */
  computeMultibandPeakDetection( multibandEnergy, multibandEnergyAverage, multibandPeak, multibandPeakHistory, currentTimer, threshold, peakPersistency, ignoreTime, interpolationFunction )
  {
    let bandsNb = multibandPeak.length;
    for( let band = 0; band < bandsNb; band++ ){
      this.computePeakDetection( multibandEnergy[band], multibandEnergyAverage[band], multibandPeak[band], multibandPeakHistory[band], currentTimer, threshold, peakPersistency, ignoreTime, interpolationFunction );
    }
  }


  /**
   * This function must be growing and continue on [0; 1]
   * in this case f(x) = x²
   * @param {number} bandposition [0; 1] the band / total of bands
   * @returns {number} [0; 1] the new position of the band
   */
  bandInterpolation( bandposition )
  {
    return bandposition*bandposition;
  }


  /**
   * @param {*} currentTimer The current timer on the frame
   * @param {*} peakTimer The absolute timer of the peak
   * @param {*} peakPersistency The time a peak takes to go down to 0
   * @param {*} easingFunction Function interpolation
   * @returns {number} the value of the peak
   */
  peakInterpolation( currentTimer, peakTimer, peakPersistency, easingFunction )
  {
    return Math.max( 0.0, easingFunction( 1.0 - (currentTimer - peakTimer) / peakPersistency ) );
  }
};