import { AudioSource } from './audiostream/audio-source'
import { AudioStream } from './audiostream/audio-stream'
import { AudioAnalyser } from './audioanalysis/audio-analyser'
import { HopalongManager } from './visualization/hopalong-manager'

// Size of the fft transform performed on audio stream
const FFT_SIZE = 512

// Create the audio components required for analysis
const audiosource = new AudioSource()
const audiostream = new AudioStream(audiosource, FFT_SIZE)
const audioAnalyser = new AudioAnalyser(audiostream.getBufferSize())

// Create the Visualization Manager
const hopalongManager = new HopalongManager()

// Create timing mechanism
let startTimer: Date | null = null
let lastFrameTimer: Date | null = null

// Initialize variables to track mouse movement and hide mouse after timeout
let idleMouseTimer: ReturnType<typeof setTimeout> | number = 0
let forceMouseHide = false
let idleSoundTimer = 0

// Intiatialize Mic input stream & then set up Audio Analysis
export const initWithMicrophone = (): void => {
  audiosource
    .getStreamFromMicrophone(false)
    .then(init)
    .catch((err) => {
      console.error('Microphone setup failed:', err)
      init()
    })
}

// Set up the Audio Analysis, Visualization manager
const init = (): void => {
  hideCursorOnInactivity()

  audiostream.init()
  startTimer = new Date()
  lastFrameTimer = startTimer

  hopalongManager.init(startTimer)
  // TODO create a message modal here telling the user to click anywhere to connect mic as long as audiostream has intialized correctly (aka permissions are good)
  analyze()
}

const hideCursorOnInactivity = (): void => {
  document.addEventListener('mousemove', () => {
    const canvas = document.getElementsByTagName('canvas')
    const el = canvas[0]
    if (!forceMouseHide && el) {
      el.style.cursor = 'crosshair'

      clearTimeout(idleMouseTimer as number)
      idleMouseTimer = setTimeout(() => {
        if (el) el.style.cursor = 'none'

        forceMouseHide = true
        setTimeout(() => {
          forceMouseHide = false
        }, 200)
      }, 1000)
    }
  })
}

// This function will be called in a loop for each frame
const analyze = (): void => {
  window.requestAnimationFrame(analyze)

  const currentTimer = new Date()
  const deltaTime = currentTimer.getTime() - lastFrameTimer!.getTime()

  // Send the audio data to the analyser for analysis
  audioAnalyser.analyse(audiostream.getAudioData(), deltaTime, currentTimer)
  const analysedData = audioAnalyser.getAnalysedData()

  if (!analysedData.getEnergy()) { // if the user hasnt clicked the page, the audio context wont be allowed to start automatically
    idleSoundTimer++
    if (idleSoundTimer > 100) {
      console.info('retrying sound')
      idleSoundTimer = 0
      audiosource.getAudioContext().resume()
    }
  }

  // feed data to our visualization manager for next frame
  hopalongManager.update(deltaTime, audioAnalyser.getAnalysedDataForVisualization())
  lastFrameTimer = currentTimer
}
