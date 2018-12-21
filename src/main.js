import './main.css';
import { AudioSource } from './audiostream/audio-source';
import { AudioStream } from './audiostream/audio-stream';
import { AudioAnalyser } from './audioanalysis/audio-analyser';
import HopalongManager from './visualization/hopalong-manager.js';
import Sidebar from './sidebar/sidebar';


// Size of the fft transform performed on audio stream
const FFT_SIZE = 512;

// 1- we create the audio components required for analysis
let audiosource = new AudioSource();
let audiostream = new AudioStream( audiosource, FFT_SIZE );
let audioAnalyser = new AudioAnalyser( audiostream.getBufferSize() );

//Create the Visualization Manager
let hopalongManager = new HopalongManager();

//Create the Config sidebar
//let sidebar = new Sidebar();

//Create timing mechanism
let startTimer = null,
    lastFrameTimer = null,
    deltaTime = null;

//Intiatialize Mic input stream & then set up Audio Anaysis
audiosource.getStreamFromMicrophone(false).then(init); //set input to be from mic by default

//Initialize variables to track mouse movement and hide mouse after timeout
let idleMouseTimer = 0;
let forceMouseHide = false;
let idleSoundTimer = 0;

//Set up the Audio Analysis, Visualization manager
function init() {
  hideCursorOnInactivity();

  audiostream.init();
  startTimer = new Date();
  lastFrameTimer = startTimer;

  hopalongManager.init(startTimer);
  //sidebar.init();
  //TODO create a message modal here telling the user to click anywhere to connect mic as long as audiostream has intialized correctly (aka permissions are good)
  analyze();
}

function hideCursorOnInactivity() {
  $('body').mousemove(function(ev) {
    if(!forceMouseHide) {
      $('canvas').css('cursor', 'crosshair');

      clearTimeout(idleMouseTimer);

      idleMouseTimer = setTimeout(function() {
        $('canvas').css('cursor', 'none');

        forceMouseHide = true;
        setTimeout(function() {
          forceMouseHide = false;
        }, 200);
      }, 1000);
    }
  });
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
  if(!analysedData.getEnergy()) { //if the user hasnt clicked the page, the audio context wont be allowed to start automatically
    console.log(idleSoundTimer);
    idleSoundTimer++;
    if(idleSoundTimer > 100) {
      console.log('retrying sound');
      idleSoundTimer = 0;
      audiosource.getAudioContext().resume();
    }
  }

  //feed data to our visualization manager for next frame
  hopalongManager.update( deltaTime, analysedData );
  lastFrameTimer = currentTimer;
}
