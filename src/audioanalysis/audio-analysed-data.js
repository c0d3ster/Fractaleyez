import AnalyserConfig from '../config/analyser.config';
import AppConfig from '../config/app.config';


/**
 * Stores the analysed data into a structured object
 * Handles the history of required datas
 */
export class AudioAnalysedData
{
  /**
   * frequenciesData
   * timedomainData
   * 
   * energy
   * energyHistory
   * energyHistoryDeltaTime
   * energyAverage
   * 
   * globalPeak
   * globalPeakValuesHistory
   * 
   * multibandEnergy
   * multibandEnergyHistory
   * multibandEnergyHistoryDeltaTime
   * multibandEnergyAverage
   * 
   * multibandPeakHistory
   * multibandPeakValuesHistory
   * 
   */

  /**
   * @param {number} bufferSize Size of the data buffer
   */
  constructor( bufferSize )
  {
    this.bufferSize = bufferSize;

    this.frequenciesData = new Uint8Array( bufferSize );  
    this.timedomainData = new Uint8Array( bufferSize );

    this.energy = 0;
    this.energyHistory = [];
    this.energyHistoryDeltaTime = [];
    this.energyAverage = 0;

    this.peak = new Peak( 0.0, null, 0 );
    this.peakHistory = new Array();

    this.multibandEnergy = new Array( AnalyserConfig.options.multibandPeakDetection.options.bands );
    this.multibandEnergyHistory = [];
    this.multibandEnergyHistoryDeltaTime = [];
    this.multibandEnergyAverage = new Array( AnalyserConfig.options.multibandPeakDetection.options.bands );

    this.multibandPeak = new Array( AnalyserConfig.options.multibandPeakDetection.options.bands );
    this.multibandPeakHistory = new Array( AnalyserConfig.options.multibandPeakDetection.options.bands );
    for( let i = 0; i < AnalyserConfig.options.multibandPeakDetection.options.bands; i++ )
    {
      this.multibandPeak[i] = new Peak( 0.0, null, 0 );
      this.multibandPeakHistory[i] = new Array();
    }
  }


  /**
   * Set the timedomain data to the new values
   * @param {Uint8Array} newTimedomainData New timedomain informations
   */
  setTimedomainData( newTimedomainData )
  {
    this.timedomainData = newTimedomainData;
  }


  /**
   * Get the timedomain data values
   * @return {Uint8Array} Timedomain data values
   */
  getTimedomainData()
  {
    return this.timedomainData;
  }


  /**
   * Set the frequenciesData to the new values
   * @param {Uint8Array} newFrequenciesData New frequencies informations
   */
  setFrequenciesData( newFrequenciesData )
  {
    this.frequenciesData = newFrequenciesData;
  }


  /**
   * Get the frequencies data values
   * @return {Uint8Array} Frequencies data values
   */
  getFrequenciesData()
  {
    return this.frequenciesData;
  }


  /**
   * set energy
   * @param {number} newEnergy New energy
   */
  setEnergy( newEnergy )
  {
    this.energy = newEnergy;
  }


  /**
   * Get the energy of the signal
   * The harder the signal is, the more energy it will have
   * @return {number} Current energy of the signal
   */
  getEnergy()
  {
    return this.energy;
  }


  /**
   * @param {number} newEnergyAverage New energy Average
   */
  setEnergyAverage( newEnergyAverage )
  {
    this.energyAverage = newEnergyAverage;
  }


  /**
   * @return {number} Current local energy average of the signal
   */
  getEnergyAverage()
  {
    return this.energyAverage;
  }

  
  /**
   * @param {Array} newEnergies The energies to set
   */
  setMultibandEnergy( newEnergies )
  {
    this.multibandEnergy = newEnergies;
  }


  /**
   * @returns an array of all the bands energy
   */
  getMultibandEnergy()
  {
    return this.multibandEnergy;
  }

  /**
   * @param {Array} newEnergiesAverage the new energies average to set
   */
  setMultibandEnergyAverage( newEnergiesAverage )
  {
    this.multibandEnergyAverage = newEnergiesAverage;
  }


  /**
   * @returns an array of all the bands average energy
   */
  getMultibandEnergyAverage()
  {
    return this.multibandEnergyAverage;
  }


  /**
   * Push the new energy to the history
   * and saves it
   * @param {number} energy New energy to push
   * @param deltaTime Time since the last registered energy
   */
  pushNewEnergy( energy, deltaTime )
  {    
    this.setEnergy( energy );
    this.energyHistory.push( energy );
    this.energyHistoryDeltaTime.push( deltaTime );

    let deltaTimeSum = 0;
    for( let i = this.energyHistoryDeltaTime.length-1; i >= 0; i-- )
    {
      deltaTimeSum+= this.energyHistoryDeltaTime[i];
      if( deltaTimeSum >= AnalyserConfig.options.peakDetection.options.energyPersistence )
      {
        this.energyHistoryDeltaTime.splice( 0, i-1 );
        this.energyHistory.splice( 0, i-1 );
        break;
      }
    }
  }


  /**
   * @return {Array} The history of the energies
   */
  getEnergyHistory()
  {
    return this.energyHistory;
  }


  /**
   * @return {Array} the history of each band energies
   */
  getMultibandEnergyHistory()
  {
    return this.multibandEnergyHistory;
  }

  
  /**
   * Push a new Array of energies to the history
   * @param {Array} multibandEnergy An array of each band energy
   * @param {*} deltaTime Time since the last mesure
   */
  pushNewMultibandEnergy( multibandEnergy, deltaTime )
  {
    this.setMultibandEnergy( multibandEnergy );
    this.multibandEnergyHistory.push( multibandEnergy );
    this.multibandEnergyHistoryDeltaTime.push( deltaTime );

    let deltaTimeSum = 0;
    for( let i = this.multibandEnergyHistory.length-1; i >= 0; i-- )
    {
      deltaTimeSum+= this.multibandEnergyHistoryDeltaTime[i];
      if( deltaTimeSum >= AnalyserConfig.options.multibandPeakDetection.options.energyPersistence )
      {
        this.multibandEnergyHistory.splice( 0, i-1 );
        this.multibandEnergyHistoryDeltaTime.splice( 0, i-1 );
        break;
      }
    }
  }
};



/**
 * This class is used to select only the desired options
 * for the visualization
 */
export class AudioAnalysedDataForVisualization
{
  /**
   * 
   * @param {AudioAnalysedData} analysedData 
   */
  constructor( analysedData )
  {
    this.bufferSize = analysedData.bufferSize;

    if( AnalyserConfig.options.returns.frequenciesData )
      this.frequenciesData = analysedData.frequenciesData;
    if( AnalyserConfig.options.returns.timedomainData )
      this.timedomainData = analysedData.timedomainData;
    if( AnalyserConfig.options.returns.energy )
      this.energy = analysedData.energy;
    if( AnalyserConfig.options.returns.energyHistory )
    {
      this.energyHistory = analysedData.energyHistory;
      this.energyHistoryDeltaTime = analysedData.energyHistoryDeltaTime;
    }
    if( AnalyserConfig.options.returns.energyAverage )
      this.energyAverage = analysedData.energyAverage;
    if( AnalyserConfig.options.returns.peak )
      this.peak = analysedData.peak;
    if( AnalyserConfig.options.returns.peakHistory )
      this.peakHistory = analysedData.peakHistory;

    if( AnalyserConfig.options.returns.multibandEnergy )
      this.multibandEnergy = analysedData.multibandEnergy;
    if( AnalyserConfig.options.returns.multibandEnergyHistory )
    {
      this.multibandEnergyHistory = analysedData.multibandEnergyHistory;
      this.multibandEnergyHistoryDeltaTime = analysedData.multibandEnergyHistoryDeltaTime;
    }
    if( AnalyserConfig.options.returns.multibandEnergyAverage )
      this.multibandEnergyAverage = analysedData.multibandEnergyAverage;
    if( AnalyserConfig.options.returns.multibandPeak )
      this.multibandPeak = analysedData.multibandPeak;
    if( AnalyserConfig.options.returns.multibandPeakHistory )
      this.multibandPeakHistory = analysedData.multibandPeakHistory;
  }
};


/**
 * Peak data informations
 */
export class Peak 
{
  /**
   * 
   * @param {number} value [0.0; 1.0] Current value of the peak - decrease over time depending on the 
   * interpolation function specified
   * @param {*} timer Absolute timer on which the peak has been detected. 
   * @param {number} energy Strength of the peak
   */
  constructor( value, timer, energy )
  {
    this.value = value;
    this.timer = timer;
    this.energy = energy;
  }


  copy( peak )
  {
    this.value = peak.value;
    this.timer = peak.timer;
    this.energy = peak.energy;
  }
};