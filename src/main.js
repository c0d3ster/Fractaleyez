import * as THREE from 'three';
import {HUD} from './hud/hud-controller';
import {Stats} from './tools/stats';
import { CameraManager } from './visualization/camera-manager.js';

import AppConfig from './config/app.config';
import { AudioSource } from './audiostream/audio-source';
import { AudioStream } from './audiostream/audio-stream';
import { AudioAnalyser } from './audioanalysis/audio-analyser';
import { AnalysedDataVisualizer } from './audioanalysis/utility/analysed-data-visualizer';

import { HopalongManager } from './visualization/hopalong-manager.js';
import Sidebar from './sidebar/sidebar';

import './main.css';
import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import {slider} from 'jquery-ui/ui/widgets/slider';


// Size of the fft transform performed on audio stream
const FFT_SIZE = 512;

// 1- we create the audio components required for analysis
let audiosource = new AudioSource();
let audiostream = new AudioStream( audiosource, FFT_SIZE, AppConfig.volume );
let audioAnalyser = new AudioAnalyser( audiostream.getBufferSize() );

//Create the Visualization Manager
let hopalongManager = new HopalongManager();

//Create the Config sidebar
let sidebar = new Sidebar();


let startTimer = null,
    lastFrameTimer = null,
    deltaTime = null;

//Intiatialize Mic input stream & then set up Audio Anaysis
audiosource.getStreamFromMicrophone(false).then(init); //set input to be from mic by default

<<<<<<< HEAD

let jacky = $(`<div class='slider'></div>`);
let sliderHandle = $(`<div class="ui-slider-handle"></div>`);

//Set up the Audio Analysis
=======
//Set up the Audio Analysis, Visualization manager
>>>>>>> sidebar
function init() {
  audiostream.init();
  startTimer = new Date();
  lastFrameTimer = startTimer;


  $(document.body).append(jacky);
  jacky.append(sliderHandle);

  var handle = $( ".ui-slider-handle" );
  $( ".slider" ).slider({
    create: function() {
      handle.text( $( this ).slider( "value" ) );
    },
    slide: function( event, ui ) {
      handle.text( ui.value );
    }
  });


  hopalongManager.init(startTimer);
  sidebar.init();
  analyze();
}

function analyze() {
  window.requestAnimationFrame( analyze );

  //console.log("Analyzing Audio Data...");
  let currentTimer = new Date(),
        deltaTime    = currentTimer - lastFrameTimer;

  // we send the audio data to the analyser for analysis
  audioAnalyser.analyse( audiostream.getAudioData(), deltaTime, currentTimer )
  let analysedData = audioAnalyser.getAnalysedData(); // we ge the analysed data

  //console.log("Analyzed Data:\nTime Domain Data = " + analysedData.getTimedomainData());
  //console.log("\nFrequencies Data = " + analysedData.getFrequenciesData());
  //console.log("\nEnergy Data = " + analysedData.getEnergy());
  //console.log("\nEnergy Average = " + analysedData.getEnergyAverage());
  //console.log("\nMultiBand Energy = " + analysedData.getMultibandEnergy());
<<<<<<< HEAD
  //console.log("\npeak.value = " + analysedData.peak.value);
  //console.log("\npeak.energy = " + analysedData.peak.energy);
=======

>>>>>>> sidebar
  // we ask the helper to draw the analysed data
  // this is where we can send the data to a proper visualizer
  hopalongManager.update( deltaTime, analysedData );
  lastFrameTimer = currentTimer;
}
