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
let lastFrameTime = 0

const FRAME_DELTA_SAMPLES = 60
const frameDeltaMs: number[] = []
let httpPingMs: number | null = null

const PING_PROBE = '/site.webmanifest'

const medianFpsFromDeltas = (deltas: number[]): { fps: number; frameMs: number } => {
  if (deltas.length === 0) return { fps: 0, frameMs: 0 }
  const sorted = [...deltas].sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)]!
  if (mid <= 0) return { fps: 0, frameMs: 0 }
  return { fps: Math.round(1000 / mid), frameMs: Math.round(mid * 10) / 10 }
}

const refreshHttpPing = (): void => {
  const tryFetch = (path: string): void => {
    const t0 = performance.now()
    fetch(`${window.location.origin}${path}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('ping probe failed')
        httpPingMs = Math.round(performance.now() - t0)
      })
      .catch(() => {
        if (path === PING_PROBE) tryFetch('/index.html')
      })
  }
  tryFetch(PING_PROBE)
}

const getPingMs = (): number | null => {
  if (httpPingMs != null) return httpPingMs
  const c = (navigator as Navigator & { connection?: { rtt?: number } }).connection
  if (c?.rtt != null && !Number.isNaN(c.rtt) && c.rtt > 0) return Math.round(c.rtt)
  return null
}

/** Rough mic→screen delay: Web Audio latencies + half FFT window + half frame (not measured end-to-end). */
const getEstimatedAudioVisualLagMs = (frameMs: number): number => {
  const ctx = audiosource.getAudioContext()
  const sr = ctx.sampleRate
  const base = ctx.baseLatency ?? 0
  const output = ctx.outputLatency ?? 0
  const engineMs = (base + output) * 1000
  const fftHalfMs = sr > 0 ? (FFT_SIZE / sr) * 1000 * 0.5 : 0
  const renderMs = frameMs > 0 ? frameMs * 0.5 : 0
  const total = engineMs + fftHalfMs + renderMs
  return Math.round(total * 10) / 10
}

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
  lastFrameTime = performance.now()

  hopalongManager.init(startTimer)
  window.getPerfData = () => {
    const { fps, frameMs } = medianFpsFromDeltas(frameDeltaMs)
    return {
      fps,
      frameMs,
      pingMs: getPingMs(),
      estimatedLagMs: getEstimatedAudioVisualLagMs(frameMs),
    }
  }
  refreshHttpPing()
  window.setInterval(refreshHttpPing, 5000)
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

  const now = performance.now()
  const deltaTime = now - lastFrameTime
  lastFrameTime = now
  const currentTimer = new Date()

  // Ignore tab-background gaps and bogus zero-length intervals (Date had 1ms resolution; RAF can be sub-ms).
  if (deltaTime > 0 && deltaTime < 250) {
    frameDeltaMs.push(deltaTime)
    if (frameDeltaMs.length > FRAME_DELTA_SAMPLES) frameDeltaMs.shift()
  }

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
}
