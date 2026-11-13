import type { FeedSettings } from '../driver/audio-feed'
import type { FrameReading } from '../driver/analyze'
import { packFrame } from '../worklet/frame-message'
import type { CaptureFrame } from '../worklet/frame-message'
import { AnalysisHost } from './analysis-host'
import type { FromWorker, PortLike, ToWorker } from './protocol'

export type ReadingListener = (reading: FrameReading) => void

/** The same surface whether the analysis runs in a Web Worker or on this thread. */
export type AnalysisClient = {
  mode: 'worker' | 'thread'
  push: (frame: CaptureFrame) => void
  setSettings: (settings: FeedSettings) => void
  setSpectrum: (on: boolean) => void
  onReading: (listener: ReadingListener) => () => void
  /** The analysers, when the analysis runs on this thread (null in a worker, which keeps its own). */
  host: AnalysisHost | null
  terminate: () => void
}

export type WorkerLike = PortLike<ToWorker, FromWorker> & { terminate: () => void }

const listenerSet = (): { add: (l: ReadingListener) => () => void; emit: ReadingListener } => {
  const listeners = new Set<ReadingListener>()
  return {
    add: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit: (reading) => listeners.forEach((listener) => listener(reading)),
  }
}

export const createWorkerClient = (worker: WorkerLike): AnalysisClient => {
  const { add, emit } = listenerSet()
  worker.onmessage = ({ data }): void => emit(data.reading)
  return {
    mode: 'worker',
    host: null,
    push: (frame): void => {
      const packed = packFrame(frame)
      worker.postMessage({ type: 'frame', packed }, [packed.buffer])
    },
    setSettings: (settings) => worker.postMessage({ type: 'settings', settings }),
    setSpectrum: (on) => worker.postMessage({ type: 'spectrum', on }),
    onReading: add,
    terminate: () => worker.terminate(),
  }
}

export const createThreadClient = (host: AnalysisHost = new AnalysisHost()): AnalysisClient => {
  const { add, emit } = listenerSet()
  return {
    mode: 'thread',
    host,
    push: (frame) => emit(host.push(frame)),
    setSettings: host.setSettings,
    setSpectrum: host.setSpectrum,
    onReading: add,
    terminate: () => undefined,
  }
}

/** A worker client when `createWorker` gives one, else (no Worker support, or it throws, e.g. a blocked script) the in-thread fallback. */
export const createAnalysisClient = (createWorker?: () => WorkerLike): AnalysisClient => {
  if (!createWorker) return createThreadClient()
  try {
    return createWorkerClient(createWorker())
  } catch {
    return createThreadClient()
  }
}
