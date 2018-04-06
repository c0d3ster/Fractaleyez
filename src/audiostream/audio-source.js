import config from '../config/app.config';

/**
 * \brief Loads audio from a source
 * The source can only be, for now, a file or a microphone
 * Relies on the web audio API
 * [https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API]
 */
export class AudioSource
{
  /** */
  constructor()
  {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.source = false;
    this.sourceType = "";
  }


  /**
   * Loads audio from a file stored in the library
   * @param {string} filepath Path to the file to be loaded 
   * @returns {Promise} A promise that resolves if the file is loaded, rejected if the file 
   * cannot be loaded or if the file isn't a valid audio file
   */
  loadAudioFromLibrary( filepath )
  {
    if( config.showloginfos ) console.log( `Loading file ${filepath}` );

    return new Promise( (resolve, reject) => {  
      this.loadFile( filepath ).then( (audioData) => {
        this.audioContext.decodeAudioData( audioData ).then( (buffer) => {
          this.source = this.audioContext.createBufferSource();
          this.source.buffer = buffer;
          this.sourceType = "audiofile";
          if( config.showloginfos ) console.log( `Audio from file ${filepath} loaded\n------------` );
          resolve();
        }).catch( (error) => {
          if( config.showerrors ) console.error( `File ${filepath} loaded, but can't decode audio data.\n${error}`);
          reject( error );
        });
      }).catch( (error) => {
        if( config.showerrors ) console.error( `File ${filepath} cannot be loaded.\n${error}`)
        reject( error );
      });
    });
  }


  /**
   * Loads audio stream from a file provided by the user
   * @param {File} file The inpit file loaded into the browser
   * @returns {Promise} a promise that resolves once the audio is loaded
   */
  loadAudioFromFile( file )
  {
    return new Promise( (resolve, reject) => {

      let reader = new FileReader();
      reader.addEventListener( 'load', (e) => {
        let data = e.target.result;
        this.audioContext.decodeAudioData(data).then( (buffer) => {
          this.source = this.audioContext.createBufferSource();
          this.source.buffer = buffer;
          this.sourceType = "audiofile";
          if( config.showloginfos ) console.log( `Audio from file loaded\n------------` );
          resolve();
        });
      });
      reader.readAsArrayBuffer( file );

    });
  }


  /**
   * Grab stream from user media
   * if user media is not available, throws an error
   * @param {boolean=} audioFeedback If the microphone stream is sent to the destination
   * @returns {Promise} A promise that resolves if the stream from the microphone can be loaded,
   * rejected if getUserMedia is not supported or if access to microphone is denied by the user
   */
  getStreamFromMicrophone( audioFeedback )
  {
    if( config.showloginfos ) console.log( 'Setting up microphone' );

    if( typeof(audioFeedback) == "undefined" ) 
      this.audioFeedback = false;
    else 
      this.audioFeedback = audioFeedback;

    return new Promise( (resolve, reject) => {
      if( navigator.mediaDevices )
      {
        navigator.mediaDevices.getUserMedia( { audio: true } ).then( (stream) => {
          this.source = this.audioContext.createMediaStreamSource( stream );
          this.sourceType = "microphone";
          if( config.showloginfos ) console.log( "Audio stream is coming from microphone" );
          resolve();
        }).catch( (error) => {
          if( config.showerrors ) console.error( `The following gUM error occured: ${error}` );
          reject( `The following gUM error occured: ${error}` );
        });
      }
      else
      {
        if( config.showerrors ) console.log( 'getUserMedia is not supported on this browser');
        reject( "getUserMedia is not supported on this browser" );
      }
    });
  }


  /**
   * Private method
   * Loads a file using XMLHttpRequest
   * @param {string} filepath Path to the file to load
   */
  loadFile( filepath )
  {
    return new Promise( (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'arraybuffer';
      xhr.open( "GET", filepath, true );
      xhr.onloadend = () => {
        if( xhr.status == 404 ) 
          reject( xhr.statusText );
        else 
          resolve( xhr.response );
      }
      xhr.send();
    });
  }


  /**
   * Starts the audio 
   * Can only be used if audio was loaded from a fil
   * @param {number=} when When the the audio will start to play, in s (optional)
   * @param {number=} offset Offset on the sound to play, in s (optional)
   */
  play( when, offset )
  {
    if( typeof(when) == "undefined" )
      when = 0;
    if( typeof(offset) == "undefined" )
      offset = 0;

    if( this.sourceType == "audiofile" )
      this.source.start(when, offset);
    else 
    {
      if( config.showerrors ) console.error( `Couldn't start the audio source. Source is a microphone.` );
    }
  }


  /**
   * @returns {boolean} true if there is feedback
   */
  isThereFeedback()
  {
    if( this.sourceType == "microphone" )
      return this.audioFeedback;
    else 
      return true;
  }


  /**
   * @return The audio context
   */
  getAudioContext()
  {
    return this.audioContext;
  }


  /**
   * @returns Node containing the source stream if set up, false instead
   */
  getSourceNode()
  {
    if( config.showerrors && !this.source ) console.error( `Audio source has not bet set up` );
    return this.source;
  }
};