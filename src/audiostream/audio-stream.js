import config from '../config/app.config';

import { AudioSource } from './audio-source';
import { AudioData } from './audio-data';


/**
 * Reads data from an audio source
 * The audio source provided to this class must be an 
 * instance of AudioSource
 */
export class AudioStream
{
  /**
   * @param {AudioSource} audiosource Audio source from which the data is gathered
   * @param {number} fftSize Size of the fourier transform. Must be pow of 2
   * @param {number} volume [0.0; 1.0] Volume used by default 
   */
  constructor( audiosource, fftsize, volume )
  {
    this.audioSource = audiosource;
    this.audioContext = audiosource.getAudioContext();
    this.volume = volume;
    this.fftsize = fftsize;
    this.sourceNode = null;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.setValueAtTime( volume, this.audioContext.currentTime );

    /*this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.setValueAtTime( 500, this.audioContext.currentTime );*/

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = fftsize;
    //this.analyserNode.smoothingConstant = 0.9;
    this.bufferLength = this.analyserNode.frequencyBinCount;
    this.dataArray = new Uint8Array( this.bufferLength );
  }


  /**
   * Function called once the audio source is set up
   */
  init()
  {
    this.sourceNode = this.audioSource.getSourceNode();
    if( !this.sourceNode )
    {
      if( config.showerrors ) console.error( `Couldn't init the audio stream class. The audio source is empty.` );
    }
    else 
    {
      this.sourceNode.connect( this.gainNode );
      this.gainNode.connect( this.analyserNode );
      //this.filterNode.connect( this.analyserNode );
      if( this.audioSource.isThereFeedback() )
        this.analyserNode.connect( this.audioContext.destination );
      if( config.showloginfos ) console.log( `AudioStream class initialized\n------------` );
    }
  }


  /**
   * @returns {AudioData} Audio data containing time domain data and frequency data
   */
  getAudioData()
  {
    let tdData = new Uint8Array( this.bufferLength ),
        fData = new Uint8Array( this.bufferLength );
    this.analyserNode.getByteTimeDomainData( tdData );
    this.analyserNode.getByteFrequencyData( fData );
    
    return new AudioData( tdData, fData, this.bufferLength );
  }


  /**
   * Changes the volume
   * @param {number} volume [0.0; 1.0] New Volume
   */
  setVolume( volume )
  {
    this.volume = volume;
    this.gainNode.gain.setValueAtTime( volume, this.audioContext.currentTime );
  }


  /**
   * @returns The current volume
   */
  getVolume()
  {
    return this.volume;
  }


  /**
   * @return Size of the data buffer
   */
  getBufferSize()
  {
    return this.bufferLength;
  }
};