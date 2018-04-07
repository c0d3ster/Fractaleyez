/**
 * How does it works
 * 1- Load audio from a source
 * 2- Init the audiostream component by providing an audio source
 *    The audiostream class provides methods to get data from the loaded source
 * 3- Init the AudioAnalyser
 *    This is different from the Audio API analyser node
 *    This component can process audio data provided by the audiostream to get
 *    informations on the audio, such as amplitude, peak, multi-band analysis
 * 4- (optional) Preview the audio data using DataVisualizer
 *    This draws informations provided by the AudioAnalyser under the <body> tag
 * 5- In the main loop, follow the example to see how data cycle is processed
 */

import { UserSelection } from './user-selection/user-selection';
import { AudioSource } from './audiostream/audio-source';
import { AudioStream } from './audiostream/audio-stream';
import { AudioAnalyser } from './audioanalysis/audio-analyser';
import { AnalysedDataVisualizer } from './audioanalysis/utility/analysed-data-visualizer';
import { Loader } from './loader/loader';
import { HUD } from './hud/hud-controller';
import { Stats } from './tools/stats';
import Sidebar from './sidebar/sidebar';
import UserControls from './user-controls';
import AppConfig from './config/app.config';
import css from './main.css';


// Size of the fft transform performed on audio stream
const FFT_SIZE = 512;


// first we want to stop the application until the user has selected an input
let userSelection = new UserSelection( (selectionType, info) => {

  // we start to load everything
  let loader = new Loader();

  // 1- we create the audio components required for analysis
  let audiosource = new AudioSource();
  let audiostream = new AudioStream( audiosource, FFT_SIZE, AppConfig.volume );
  let audioAnalyser = new AudioAnalyser( audiostream.getBufferSize() );

  // We set up the volume control
  UserControls[0][1].callback = (value) => { audiostream.setVolume(value); };

  // Visual informations on the analysed data
  let visuHelper = new AnalysedDataVisualizer();
  visuHelper.init();

  let startTimer = null,
      lastFrameTimer = null,
      deltaTime = null;

  let hud = new HUD();
  let stats = new Stats( Stats.POSITIONS.BOTTOM_RIGHT );
  hud.add(stats);

  switch( selectionType )
  {
    case UserSelection.LOAD_TYPE.LIBRARY_FILE:
      audiosource.loadAudioFromLibrary( info ).then(init);
      break;

    case UserSelection.LOAD_TYPE.INPUT_MICROPHONE:
      audiosource.getStreamFromMicrophone().then(init);
      break;

    case UserSelection.LOAD_TYPE.INPUT_FILE:
      audiosource.loadAudioFromFile( info ).then(init);
      break;
  }

  function init()
  {
    audiostream.init();
    if( selectionType != UserSelection.LOAD_TYPE.INPUT_MICROPHONE )
      audiosource.play();
    startTimer = new Date();
    lastFrameTimer = startTimer;
    loader.loaded();
    analysis();
  }

  function analysis()
  {
    window.requestAnimationFrame( analysis );

    stats.begin();
    let currentTimer = new Date(),
        deltaTime    = currentTimer - lastFrameTimer;

    // we send the audio data to the analyser for analysis
    audioAnalyser.analyse( audiostream.getAudioData(), deltaTime, currentTimer )
    let analysedData = audioAnalyser.getAnalysedData(); // we ge the analysed data

    // we ask the helper to draw the analysed data
    // this is where we can send the data to a proper visualizer
    visuHelper.draw( analysedData, startTimer );

    lastFrameTimer = currentTimer;
    stats.end();
  }

});
