import { AudioSource } from './audiostream/audio-source'
import { AudioStream } from './audiostream/audio-stream'
import { AudioAnalyser } from './audioanalysis/audio-analyser'
import { AudioFeed } from './audioanalysis/audio-feed'
import { beatMonitor } from './audioanalysis/beat'
import { DEFAULT_DETECTOR_MS, detectorCalibration, estimateLag, LagEstimate, median } from './audioanalysis/lag-estimate'
import { LagProbe } from './audioanalysis/lag-probe'
import { DEFAULT_ENABLED_BANDS } from './audioanalysis/onset-bands'
import { LayerKey } from './config/configDefaults'
import { LAYER_REGISTRY } from './config/layers'
import { createLayerPipeline, LayerPipeline } from './visualization/layers'
import { shouldDrawForVideoFrame, shouldDrawUnderCap } from './visualization/frame-cap'
import { loadTracker } from './visualization/load-tracker'
import { qualityController } from './visualization/quality-controller'
import { displayStutters, videoStutters } from './visualization/stutter-monitor'
import { videoFrameSignal } from './visualization/video-frame-signal'

// Size of the fft transform performed on audio stream
const FFT_SIZE = 512

// Create the audio components required for analysis
const audiosource = new AudioSource()
const audiostream = new AudioStream(audiosource, FFT_SIZE)
const audioFeed = new AudioFeed(audiostream, new AudioAnalyser(audiostream.getBufferSize()))
const lagProbe = new LagProbe({
  context: audiosource.getAudioContext(),
  injectClick: audiostream.injectClick,
  subscribeBeat: beatMonitor.subscribe,
  lastBeatTime: beatMonitor.getLastBeatTime,
  now: () => performance.now(),
  frameMs: () => medianFpsFromDeltas(frameDeltaMs).frameMs,
  refreshMs: () => median(displayGapMs),
  workMs: () => median(frameWorkMs),
  predictMs: () => currentLag().totalMs,
  onMeasured: ({ detectorMs }) => detectorCalibration.save(detectorSetup(), detectorMs),
})

// The layer pipeline (created in init) draws every enabled layer; which layers show is layers.meta[key].enabled.
let pipeline: LayerPipeline | null = null

// Where the camera pad's trailing dot sits (see LayerPipeline.getCameraSteer).
window.getCameraSteer = () => pipeline?.getCameraSteer() ?? null

// Layers toggled by a hotkey. The cap is enforced by setLayerEnabled, which refuses an enable past it.
const LAYER_HOTKEYS: LayerKey[] = ['video', 'fractal', 'orbit', 'logo']

const toggleLayer = (key: LayerKey): void => {
  window.setLayerEnabled?.(key, !window.config.layers.meta[key].enabled.value)
}

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.repeat) return
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
  const key = event.key.toLowerCase()
  const hotkeyLayer = LAYER_HOTKEYS.find((layerKey) => LAYER_REGISTRY[layerKey].hotkey === key)
  if (hotkeyLayer) toggleLayer(hotkeyLayer)
  // S turns the shockwave effect on and off (the Effects Shockwave checkbox follows).
  if (key === 's') window.updateConfigItem?.('effects', 'shockwave', !window.config.effects.shockwave.value)
})

// The quality tier (Auto or fixed) as the perf readout and the pop-out config window see it.
window.getQuality = () => qualityController.getStatus()
// For the benchmark script (scripts/bench), which picks a tier from outside the settings page.
window.setQuality = (setting) => qualityController.setSetting(setting)

// Create timing mechanism. A frame is drawn when the tier's frame cap allows; every display frame still goes to Auto,
// which judges the display's pace, not the drawn one.
let lastFrameTime = 0
let lastDisplayFrameTime = 0
// A longer gap between display frames is a background tab or a stall, not load; Auto ignores it. (The perf readout ignores gaps over 250ms, which is below 4fps.)
const DISPLAY_GAP_MAX_MS = 2000

const FRAME_DELTA_SAMPLES = 60
const frameDeltaMs: number[] = []
// How long each drawn frame takes from the start of its callback until it is handed to the GPU; one term of the Lag figure.
const frameWorkMs: number[] = []
// The gap between display frames (the monitor's refresh, whatever the frame cap); the other term of the Lag figure.
const displayGapMs: number[] = []

// What the beat detector's delay depends on: the sample rate (its windows are a number of samples), which bands can set off a beat, the Threshold slider, and the quality mode (its frame rate changes how the detector smooths).
const detectorSetup = (): string => [
  audiosource.getAudioContext().sampleRate,
  (window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS).map((on) => (on ? 1 : 0)).join(''),
  window.config.audio.soundThreshold.value,
  qualityController.getTier(),
].join('|')

const currentLag = (): LagEstimate => estimateLag(
  detectorCalibration.read(detectorSetup(), DEFAULT_DETECTOR_MS[qualityController.getTier()]),
  medianFpsFromDeltas(frameDeltaMs).frameMs,
  median(frameWorkMs),
  median(displayGapMs),
)
// Shader compiles and first uploads make the first frames slow whatever the scene weighs, so Auto does not judge until this many are drawn.
const STARTUP_FRAMES = 45
let endStartupLoad: (() => void) | null = null
let startupFramesLeft = 0

const medianFpsFromDeltas = (deltas: number[]): { fps: number; frameMs: number } => {
  if (deltas.length === 0) return { fps: 0, frameMs: 0 }
  const sorted = [...deltas].sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)]!
  if (mid <= 0) return { fps: 0, frameMs: 0 }
  return { fps: Math.round(1000 / mid), frameMs: Math.round(mid * 10) / 10 }
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
  lastFrameTime = performance.now()
  lastDisplayFrameTime = lastFrameTime

  startupFramesLeft = STARTUP_FRAMES
  endStartupLoad = loadTracker.begin('startup')
  pipeline = createLayerPipeline(qualityController)
  // Frames around a resize or a tab coming back say nothing about load; Auto waits them out.
  window.addEventListener('resize', qualityController.disturb)
  document.addEventListener('visibilitychange', qualityController.disturb)
  // Owned here (not by a visualizer) so the frequency HUD keeps working in every layer combination.
  window.getAudioData = audioFeed.getLatest
  window.getBeatTimeline = beatMonitor.getTimeline
  window.getLastBeatTime = beatMonitor.getLastBeatTime
  window.getBeatTimes = beatMonitor.getBeatTimes
  window.subscribeBeat = beatMonitor.subscribe
  window.measureBeatLag = lagProbe.measure
  window.getPerfData = () => {
    const { fps, frameMs } = medianFpsFromDeltas(frameDeltaMs)
    const now = performance.now()
    return {
      fps,
      frameMs,
      lag: { estimate: currentLag(), measurement: lagProbe.getLast(), measuring: lagProbe.isRunning() },
      quality: qualityController.getStatus(),
      stutters: { display: displayStutters.summary(now), video: videoStutters.summary(now) },
    }
  }
  // TODO create a message modal here telling the user to click anywhere to connect mic as long as audiostream has intialized correctly (aka permissions are good)
  analyze()
}

const setCanvasCursor = (cursor: string): void => {
  Array.from(document.getElementsByTagName('canvas')).forEach((canvas) => {
    canvas.style.cursor = cursor
  })
}

const hideCursorOnInactivity = (): void => {
  document.addEventListener('mousemove', () => {
    if (!forceMouseHide && document.getElementsByTagName('canvas').length > 0) {
      setCanvasCursor('crosshair')

      clearTimeout(idleMouseTimer as number)
      idleMouseTimer = setTimeout(() => {
        setCanvasCursor('none')

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
  const displayGap = now - lastDisplayFrameTime
  lastDisplayFrameTime = now
  if (displayGap > 0 && displayGap < DISPLAY_GAP_MAX_MS) {
    qualityController.recordFrame(displayGap, now)
    displayStutters.record(now, displayGap)
    displayGapMs.push(displayGap)
    if (displayGapMs.length > FRAME_DELTA_SAMPLES) displayGapMs.shift()
  }

  // Analysis and drawing share the cap: a skipped frame does neither, so a beat is never detected on a frame that is not drawn.
  // A new video frame is also drawn when it arrives if the cap's next draw is not close, so no frame is shown for longer than another.
  const { frameCapFps } = qualityController.getProfile()
  const sinceLastDraw = now - lastFrameTime
  if (frameCapFps !== null && !shouldDrawUnderCap(sinceLastDraw, frameCapFps, displayGap)) {
    if (!videoFrameSignal.isPending() || !shouldDrawForVideoFrame(sinceLastDraw, frameCapFps, displayGap)) return
  }
  videoFrameSignal.clear()

  const deltaTime = now - lastFrameTime
  lastFrameTime = now
  const currentTimer = new Date()

  // Ignore tab-background gaps and bogus zero-length intervals (Date had 1ms resolution; RAF can be sub-ms).
  if (deltaTime > 0 && deltaTime < 250) {
    frameDeltaMs.push(deltaTime)
    if (frameDeltaMs.length > FRAME_DELTA_SAMPLES) frameDeltaMs.shift()
  }

  // Analyse once per frame; every layer and HUD reads this same snapshot
  const visualizationData = audioFeed.tick(deltaTime, currentTimer)

  if (audioFeed.isSilent()) { // if the user hasnt clicked the page, the audio context wont be allowed to start automatically
    idleSoundTimer++
    if (idleSoundTimer > 100) {
      console.info('retrying sound')
      idleSoundTimer = 0
      audiosource.getAudioContext().resume()
    }
  }

  pipeline?.render(deltaTime, visualizationData)
  const submittedAt = performance.now()
  lagProbe.frameSubmitted(submittedAt)
  frameWorkMs.push(submittedAt - now)
  if (frameWorkMs.length > FRAME_DELTA_SAMPLES) frameWorkMs.shift()
  if (endStartupLoad && --startupFramesLeft <= 0) {
    endStartupLoad()
    endStartupLoad = null
  }
}
