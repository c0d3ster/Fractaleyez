import * as THREE from 'three';
import { HUD } from './hud/hud-controller';
import { Stats } from './tools/stats';
import { slider } from 'jquery-ui/ui/widgets/slider';
import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';

import './main.css';
import { AudioSource } from './audiostream/audio-source';
import { AudioStream } from './audiostream/audio-stream';
import { AudioAnalyser } from './audioanalysis/audio-analyser';
import { AnalysedDataVisualizer } from './audioanalysis/utility/analysed-data-visualizer';
import CameraManager from './visualization/camera-manager.js';
import HopalongManager from './visualization/hopalong-manager.js';
import Sidebar from './sidebar/sidebar';
import config from './config/visualizer.config.js';


// Size of the fft transform performed on audio stream
const FFT_SIZE = 512;

// 1- we create the audio components required for analysis
let audiosource = new AudioSource();
let audiostream = new AudioStream( audiosource, FFT_SIZE );
let audioAnalyser = new AudioAnalyser( audiostream.getBufferSize() );

//Create the Visualization Manager
let hopalongManager = new HopalongManager();

//Create the Config sidebar
let sidebar = new Sidebar();

//Create timing mechanism
let startTimer = null,
    lastFrameTimer = null,
    deltaTime = null;

//Intiatialize Mic input stream & then set up Audio Anaysis
audiosource.getStreamFromMicrophone(false).then(init); //set input to be from mic by default

//JQuery selector variables are prepended by $
let $slider = $(`<div class='slider'></div>`);
let $sliderHandle = $(`<div class="ui-slider-handle"></div>`);

//Set up the Audio Analysis, Visualization manager
function init() {
  audiostream.init();
  startTimer = new Date();
  lastFrameTimer = startTimer;


  $(document.body).append($slider);
  $slider.append($sliderHandle);

  var handle = $( ".ui-slider-handle" );
  $( ".slider" ).slider({
    range: "max",
    min: config.minSpeed,
    max: config.maxSpeed,
    value: config.speed,
    step: config.step,

    create: function() {
      handle.text( $( this ).slider( "value" ) );
    },
    slide: function( event, ui ) {
      handle.text( ui.value );
      config.speed = ui.value;
    }
  });

  hopalongManager.init(startTimer);
  sidebar.init();
  analyze();
}

//This function will be called in a loop for each frame
function analyze() {
  window.requestAnimationFrame( analyze );

  //console.log("Analyzing Audio Data...");
  let currentTimer = new Date(),
        deltaTime    = currentTimer - lastFrameTimer;

  //Send the audio data to the analyser for analysis
  audioAnalyser.analyse( audiostream.getAudioData(), deltaTime, currentTimer )
  let analysedData = audioAnalyser.getAnalysedData(); //we get the analysed data

  //console.log("Analyzed Data:\nTime Domain Data = " + analysedData.getTimedomainData());
  //console.log("\nFrequencies Data = " + analysedData.getFrequenciesData());
  //console.log("\nEnergy Data = " + analysedData.getEnergy());
  //console.log("\nEnergy Average = " + analysedData.getEnergyAverage());
  //console.log("\nMultiBand Energy = " + analysedData.getMultibandEnergy());
  //console.log("\npeak.value = " + analysedData.peak.value);
  //console.log("\npeak.energy = " + analysedData.peak.energy);

  //feed data to our visualization manager for next frame
  hopalongManager.update( deltaTime, analysedData );
  lastFrameTimer = currentTimer;
}
