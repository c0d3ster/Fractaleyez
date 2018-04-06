/**
 * @struct
 */
export class AudioData
{
  /**
   * @param {Uint8Array} timedomainData 
   * @param {Uint8Array} frequencyData
   * @param {number} bufferSize
   */
  constructor( timedomainData, frequencyData, bufferSize )
  {
    this.bufferSize = bufferSize;
    this.timedomainData = timedomainData;
    this.frequencyData = frequencyData;
  }
};