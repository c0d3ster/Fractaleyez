import { AudioSource } from './audiostream/audio-source'
import { AudioStream } from './audiostream/audio-stream'
import { AudioAnalyser } from './audioanalysis/audio-analyser'
import HopalongManager from './visualization/hopalong-manager.js'

// Size of the fft transform performed on audio stream
const FFT_SIZE = 512

// Create the audio components required for analysis
const audiosource = new AudioSource()
const audiostream = new AudioStream( audiosource, FFT_SIZE )
const audioAnalyser = new AudioAnalyser( audiostream.getBufferSize() )

// Create the Visualization Manager
const hopalongManager = new HopalongManager()

// Create timing mechanism
let startTimer = null
let lastFrameTimer = null

// Initialize variables to track mouse movement and hide mouse after timeout
let idleMouseTimer = 0
let forceMouseHide = false
let idleSoundTimer = 0

// Intiatialize Mic input stream & then set up Audio Analysis
export const initWithMicrophone = () => {
  audiosource.getStreamFromMicrophone(false).then(init) // set input to be from mic by default
}

// Set up the Audio Analysis, Visualization manager
const init = () => {
  hideCursorOnInactivity()

  audiostream.init()
  startTimer = new Date()
  lastFrameTimer = startTimer

  hopalongManager.init(startTimer)
  // TODO create a message modal here telling the user to click anywhere to connect mic as long as audiostream has intialized correctly (aka permissions are good)
  analyze()
}

const hideCursorOnInactivity = () => {
  document.addEventListener('mousemove', (ev) => {
    const canvas = document.getElementsByTagName('canvas')
    if(!forceMouseHide) {
      canvas[0].style.cursor = 'crosshair'

      clearTimeout(idleMouseTimer)
      idleMouseTimer = setTimeout(() => {
        canvas[0].style.cursor = 'none'

        forceMouseHide = true
        setTimeout(() => {
          forceMouseHide = false
        }, 200)
      }, 1000)
    }
  })
}

// This function will be called in a loop for each frame
const analyze = () => {
  window.requestAnimationFrame( analyze )

  // console.info("Analyzing Audio Data...");
  const currentTimer = new Date()
  const deltaTime    = currentTimer - lastFrameTimer

  // Send the audio data to the analyser for analysis
  audioAnalyser.analyse( audiostream.getAudioData(), deltaTime, currentTimer )
  const analysedData = audioAnalyser.getAnalysedData() // we get the analysed data

  // console.info("Analyzed Data:\nTime Domain Data = " + analysedData.getTimedomainData());
  // console.info("\nFrequencies Data = " + analysedData.getFrequenciesData());
  // console.info("\nEnergy Data = " + analysedData.getEnergy());
  // console.info("\nEnergy Average = " + analysedData.getEnergyAverage());
  // console.info("\nMultiBand Energy = " + analysedData.getMultibandEnergy());
  // console.info("\npeak.value = " + analysedData.peak.value);
  // console.info("\npeak.energy = " + analysedData.peak.energy);
  if(!analysedData.getEnergy()) { // if the user hasnt clicked the page, the audio context wont be allowed to start automatically
    idleSoundTimer++
    if(idleSoundTimer > 100) {
      console.info('retrying sound')
      idleSoundTimer = 0
      audiosource.getAudioContext().resume()
    }
  }

  // feed data to our visualization manager for next frame
  hopalongManager.update( deltaTime, analysedData )
  lastFrameTimer = currentTimer
}
