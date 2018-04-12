/*
 * AUTHOR: Iacopo Sassarini
 */
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

import css from './main.css';

// Size of the fft transform performed on audio stream
const FFT_SIZE = 512;

// 1- we create the audio components required for analysis
let audiosource = new AudioSource();
let audiostream = new AudioStream( audiosource, FFT_SIZE, AppConfig.volume );
let audioAnalyser = new AudioAnalyser( audiostream.getBufferSize() );

//Create the Visualization Manager
let hopalongManager = new HopalongManager();

let startTimer = null,
    lastFrameTimer = null,
    deltaTime = null;

//Intiatialize Mic input stream & then set up Audio Anaysis
audiosource.getStreamFromMicrophone(false).then(init); //set input to be from mic by default

//Set up the Audio Analysis
function init() {
  audiostream.init();
  startTimer = new Date();
  lastFrameTimer = startTimer;
  hopalongManager.init(startTimer);
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
  console.log("\nEnergy Data = " + analysedData.getEnergy());
  console.log("\nEnergy Average = " + analysedData.getEnergyAverage());
  console.log("\nMultiBand Energy = " + analysedData.getMultibandEnergy());
  console.log("\npeak.value = " + analysedData.peak.value);
  console.log("\npeak.energy = " + analysedData.peak.energy);
  // we ask the helper to draw the analysed data
  // this is where we can send the data to a proper visualizer
  hopalongManager.update( deltaTime, analysedData );
  lastFrameTimer = currentTimer;
}
