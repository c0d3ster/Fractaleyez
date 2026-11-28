import { AudioSource, DEFAULT_ENABLED_BANDS, nameRhythm, RhythmLabel, RhythmLabeler, RhythmPattern, RollLevel } from 'beatsense'
import { audioAnalysis, createReadWatch } from './audio'
import { AudioFeed } from './audioanalysis/audio-feed'
import { AudioLifecycle, isMobileShell, MicPermission } from './audioanalysis/audio-lifecycle'
import { soundHint } from './audioanalysis/sound-hint'
import { VisualTap } from './audioanalysis/visual-tap'
import { exportSectionLog } from './audioanalysis/section-export'
import { DEFAULT_DETECTOR_MS, detectorCalibration, estimateLag, LagEstimate, median } from './audioanalysis/lag-estimate'
import { LagProbe } from './audioanalysis/lag-probe'
import { LayerKey } from './config/configDefaults'
import { LAYER_REGISTRY } from './config/layers'
import { createLayerPipeline, LayerPipeline } from './visualization/layers'
import { shouldDrawForVideoFrame, shouldDrawUnderCap } from './visualization/frame-cap'
import { loadTracker } from './visualization/load-tracker'
import { logStartupReport, perfProbe, STARTUP_WATCH_MS, startupTimeline } from './visualization/perf'
import { qualityController } from './visualization/quality-controller'
import { displayStutters, videoStutters } from './visualization/stutter-monitor'
import { videoFrameSignal } from './visualization/video-frame-signal'
import { previewLock } from './components/presets/previewLock'

// Size of the fft transform performed on audio stream
startupTimeline.mark('main')

const FFT_SIZE = 512

// Create the audio components required for analysis
const { beatMonitor, tempoTracker, beatGrid, sectionTracker, drumHits, riserDetector, sweepDetector, snareRoll } = audioAnalysis
const audioContext = new (window.AudioContext || window.webkitAudioContext)()
// Measures for the detectors in an AudioWorklet at a fixed 60 frames a second (the bundle is its own webpack entry, see webpack.config.js).
const capture = new AudioSource({ context: audioContext, workletUrl: '/beatsense-worklet.js' })
const visualTap = new VisualTap(audioContext, FFT_SIZE)
// The riser and sweep detectors only feed the Frequency HUD, which polls their scores each frame while it is open.
const riserSweepReads = createReadWatch(1000)
const audioFeed = new AudioFeed(visualTap, audioAnalysis, { readsRiserAndSweep: riserSweepReads.isActive })
const lagProbe = new LagProbe({
  context: audioContext,
  injectClick: visualTap.injectClick,
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
  // Ctrl+C, Ctrl+V and the like are the browser's, not hotkeys (the pop-out skips them the same way before forwarding).
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const focused = document.activeElement?.tagName
  if (focused === 'INPUT' || focused === 'TEXTAREA' || focused === 'SELECT') return
  // A premium preview locks the config, hotkeys included.
  if (previewLock.isLocked()) return
  const key = event.key.toLowerCase()
  const hotkeyLayer = LAYER_HOTKEYS.find((layerKey) => LAYER_REGISTRY[layerKey].hotkey === key)
  if (hotkeyLayer) toggleLayer(hotkeyLayer)
  // S turns the shockwave effect on and off (the Effects Shockwave checkbox follows).
  if (key === 's') window.updateConfigItem?.('effects', 'shockwave', !window.config.effects.shockwave.value)
  // C switches the video layer between the live camera and the clips.
  if (key === 'c') window.toggleLiveVideo?.()
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

// What the beat detector's delay depends on: the sample rate (its windows are a number of samples), which bands can set off a beat, and the Threshold slider. The quality tier no longer does: the detectors run on the worklet's fixed hop.
const detectorSetup = (): string => [
  audioContext.sampleRate,
  (window.enabledFreqBands ?? DEFAULT_ENABLED_BANDS).map((on) => (on ? 1 : 0)).join(''),
  window.config.audio.soundThreshold.value,
].join('|')

const currentLag = (): LagEstimate => estimateLag(
  detectorCalibration.read(detectorSetup(), DEFAULT_DETECTOR_MS),
  medianFpsFromDeltas(frameDeltaMs).frameMs,
  median(frameWorkMs),
  median(displayGapMs),
)
// Shader compiles and first uploads make the first frames slow whatever the scene weighs, so Auto does not judge until this many are drawn.
const STARTUP_FRAMES = 45
let endStartupLoad: (() => void) | null = null
let startupFramesLeft = 0
let loggedStartup = false

// Counts the first frames for the startup timeline, and with the perf probe on logs the timeline once its watch is over.
const noteStartupFrame = (now: number): void => {
  startupTimeline.frame(now)
  if (loggedStartup) return
  loggedStartup = true
  if (perfProbe.isEnabled()) window.setTimeout(() => logStartupReport(startupTimeline.report()), STARTUP_WATCH_MS + 500)
}

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

// The mobile shell (touch first, at most 820px wide) starts the sound on the first tap instead of at load; decided once, at load.
const mobileShell = isMobileShell(window)

// The draw loop's next frame, so a locked phone or a background tab can stop it (mobile only) and its return start it once.
let frameRequest: number | null = null
let drawingPaused = false

const pauseDrawing = (): void => {
  drawingPaused = true
  if (frameRequest !== null) window.cancelAnimationFrame(frameRequest)
  frameRequest = null
}

const resumeDrawing = (): void => {
  if (!drawingPaused) return
  drawingPaused = false
  // The frame clocks restart now, so the first frame back is not one huge step.
  lastFrameTime = performance.now()
  lastDisplayFrameTime = lastFrameTime
  frameRequest = window.requestAnimationFrame(analyze)
}

const queryMicPermission = async (): Promise<MicPermission | null> => {
  try {
    return await navigator.permissions?.query({ name: 'microphone' as PermissionName }) ?? null
  } catch {
    // Firefox has no `microphone` permission name.
    return null
  }
}

// Mobile: the visual starts at load on silence, and the first tap starts the context and opens the microphone (see AudioLifecycle).
const initForFirstTap = (): void => {
  const captureReady = capture.start().then(() => true, (err: unknown) => {
    console.error('Audio capture setup failed:', err)
    return false
  })
  const lifecycle = new AudioLifecycle({
    context: audioContext,
    connectMicrophone: capture.connectMicrophone,
    onMicrophone: (microphone) => {
      void captureReady.then((ready) => {
        if (ready) visualTap.connect(microphone, capture.input)
      })
    },
    queryMicPermission,
    pauseDrawing,
    resumeDrawing,
    onContextResumed: audioFeed.resetClock,
    setHint: soundHint.set,
  })
  lifecycle.attach(document, window)
  init(null)
}

// Intiatialize Mic input stream & then set up Audio Analysis
export const initWithMicrophone = (): void => {
  if (mobileShell) {
    initForFirstTap()
    return
  }
  capture.start()
    .then(() => capture.connectMicrophone())
    .then(init)
    .catch((err: unknown) => {
      console.error('Audio capture setup failed:', err)
      init(null)
    })
}

// Set up the Audio Analysis, Visualization manager
const init = (microphone: MediaStreamAudioSourceNode | null): void => {
  hideCursorOnInactivity()

  // Without a microphone (denied, or the capture worklet failed to load) the visuals still run, on silence.
  if (microphone) visualTap.connect(microphone, capture.input)
  // Every frame the worklet measures goes to the detectors, whatever the display is doing (a slow tier, a hidden tab): they run off its sample clock, not the drawn frames.
  capture.onFrame((frame) => {
    audioFeed.push(frame)
    capture.setSpectrum(audioFeed.wantsSpectrum())
  })
  lastFrameTime = performance.now()
  lastDisplayFrameTime = lastFrameTime

  startupTimeline.mark('audio-ready')
  startupFramesLeft = STARTUP_FRAMES
  endStartupLoad = loadTracker.begin('startup')
  pipeline = startupTimeline.span('pipeline', () => createLayerPipeline(qualityController))
  // Frames around a resize or a tab coming back say nothing about load; Auto waits them out.
  window.addEventListener('resize', qualityController.disturb)
  document.addEventListener('visibilitychange', qualityController.disturb)
  // Owned here (not by a visualizer) so the frequency HUD keeps working in every layer combination.
  window.getBeatTimeline = beatMonitor.getTimeline
  window.getLastBeatTime = beatMonitor.getLastBeatTime
  window.getBeatTimes = beatMonitor.getBeatTimes
  window.getSongSection = sectionTracker.getState
  window.getTempo = tempoTracker.getReading
  window.getBeatGrid = beatGrid.getState
  const rhythmInput = (): { bandOnsets: ReadonlyArray<readonly number[]>; periodMs: number | null } => {
    const bpm = tempoTracker.getBpm()
    return { bandOnsets: beatMonitor.getBandOnsets(), periodMs: bpm === null ? null : 60000 / bpm }
  }
  window.getRhythmPattern = (): RhythmPattern | null => nameRhythm(rhythmInput())
  const rhythmLabeler = new RhythmLabeler()
  window.getRhythmLabel = (): RhythmLabel => rhythmLabeler.read(rhythmInput(), performance.now())
  window.getDrumHits = drumHits.getLastHits
  window.getRiser = riserSweepReads.wrap(riserDetector.getScore)
  window.getSweep = riserSweepReads.wrap(sweepDetector.getScore)
  window.getSnareRoll = (): RollLevel | null => snareRoll.current()
  window.getSectionHistory = sectionTracker.getHistory
  window.exportSectionLog = (): void => exportSectionLog(sectionTracker.getRecording())
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
  // TODO create a message modal here telling the user to click anywhere to connect mic as long as the audio capture has intialized correctly (aka permissions are good)
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
  frameRequest = window.requestAnimationFrame(analyze)

  const now = performance.now()
  const displayGap = now - lastDisplayFrameTime
  lastDisplayFrameTime = now
  if (displayGap > 0 && displayGap < DISPLAY_GAP_MAX_MS) {
    qualityController.recordFrame(displayGap, now)
    displayStutters.record(now, displayGap)
    displayGapMs.push(displayGap)
    if (displayGapMs.length > FRAME_DELTA_SAMPLES) displayGapMs.shift()
  }

  // The cap limits drawing only; the beat detectors run on the worklet's frames and never skip. A new video frame is also drawn when it arrives if the cap's next draw is not close, so no frame is shown for longer than another.
  const { frameCapFps } = qualityController.getProfile()
  const sinceLastDraw = now - lastFrameTime
  if (frameCapFps !== null && !shouldDrawUnderCap(sinceLastDraw, frameCapFps, displayGap)) {
    if (!videoFrameSignal.isPending() || !shouldDrawForVideoFrame(sinceLastDraw, frameCapFps, displayGap)) return
  }
  videoFrameSignal.clear()

  perfProbe.frameStart()
  const deltaTime = now - lastFrameTime
  lastFrameTime = now

  // Ignore tab-background gaps and bogus zero-length intervals (Date had 1ms resolution; RAF can be sub-ms).
  if (deltaTime > 0 && deltaTime < 250) {
    frameDeltaMs.push(deltaTime)
    if (frameDeltaMs.length > FRAME_DELTA_SAMPLES) frameDeltaMs.shift()
  }

  // Analyse once per frame; every layer and HUD reads this same snapshot
  perfProbe.begin('audio')
  const visualizationData = audioFeed.tick(deltaTime)
  perfProbe.end('audio')

  // If the user hasnt clicked the page, the audio context wont be allowed to start automatically. On mobile the first tap starts it instead.
  if (!mobileShell && audioFeed.isSilent()) {
    idleSoundTimer++
    if (idleSoundTimer > 100) {
      console.info('retrying sound')
      idleSoundTimer = 0
      audioContext.resume()
    }
  }

  pipeline?.render(deltaTime, visualizationData)
  perfProbe.frameEnd()
  if (pipeline) noteStartupFrame(now)
  const submittedAt = performance.now()
  lagProbe.frameSubmitted(submittedAt)
  frameWorkMs.push(submittedAt - now)
  if (frameWorkMs.length > FRAME_DELTA_SAMPLES) frameWorkMs.shift()
  if (endStartupLoad && --startupFramesLeft <= 0) {
    startupTimeline.mark('settled')
    endStartupLoad()
    endStartupLoad = null
  }
}
