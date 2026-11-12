import { describe, expect, it } from 'vitest'

import { AnalysisHost, FrameEmitter, createAnalysisClient, createThreadClient, createWorkerClient, serveAnalysis } from '../../src'
import type { AnalysisClient, CaptureFrame, FrameReading, FromWorker, ToWorker, WorkerLike } from '../../src'

const RATE = 48000

const fourOnTheFloor = (seconds: number): Float32Array =>
  Float32Array.from({ length: seconds * RATE }, (_, n) => {
    const t = n / RATE
    const sinceKick = t % 0.5
    return 0.6 * Math.sin(2 * Math.PI * 60 * sinceKick) * Math.exp(-25 * sinceKick) + 0.15 * Math.sin(2 * Math.PI * 9000 * t) * Math.exp(-120 * ((t + 0.25) % 0.5))
  })

/** The frames a worklet would post for this audio, delivered in 128-sample quanta. */
const framesOf = (pcm: Float32Array): CaptureFrame[] => {
  const emitter = new FrameEmitter(RATE)
  const frames: CaptureFrame[] = []
  for (let at = 0; at < pcm.length; at += 128) frames.push(...emitter.push(pcm.subarray(at, at + 128)))
  return frames
}

/** A Worker stand-in wired straight to serveAnalysis, with messages structured-cloned the way a real port does. */
const fakeWorker = (): WorkerLike => {
  let toWorker: ((event: { data: ToWorker }) => void) | null = null
  const worker: WorkerLike = {
    onmessage: null,
    postMessage: (message) => toWorker?.({ data: structuredClone(message) }),
    terminate: () => undefined,
  }
  serveAnalysis({
    get onmessage() {
      return toWorker
    },
    set onmessage(handler) {
      toWorker = handler
    },
    postMessage: (message: FromWorker) => worker.onmessage?.({ data: structuredClone(message) }),
  })
  return worker
}

const run = (client: AnalysisClient, deliver: (push: (frame: CaptureFrame) => void) => void): FrameReading[] => {
  const readings: FrameReading[] = []
  client.onReading((reading) => readings.push(reading))
  deliver(client.push)
  return readings
}

describe('analysis host', () => {
  const frames = framesOf(fourOnTheFloor(20))
  const all = (push: (frame: CaptureFrame) => void): void => frames.forEach(push)

  it('finds the beats of a steady kick', () => {
    const beats = run(createThreadClient(), all).filter(({ beat }) => beat)
    expect(beats.length).toBeGreaterThan(25)
  })

  it('gives the same readings in a Worker as in the in-thread fallback', () => {
    expect(run(createWorkerClient(fakeWorker()), all)).toEqual(run(createThreadClient(), all))
  })

  it('gives identical readings whatever cadence the frames are handed over at (30, 60 or 144 fps)', () => {
    const reference = run(createThreadClient(), all)
    // The display's frame rate only decides how often the main thread looks: frames queue up and arrive in bursts, never dropped or resized.
    for (const fps of [30, 60, 144]) {
      const readings = run(createThreadClient(), (push) => {
        let delivered = 0
        for (let tick = 1; delivered < frames.length; tick++) {
          const upTo = Math.min(frames.length, Math.floor((tick * 60) / fps))
          frames.slice(delivered, upTo).forEach(push)
          delivered = Math.max(delivered, upTo)
        }
      })
      expect(readings).toEqual(reference)
    }
  })

  it('falls back to the thread when the Worker cannot be made', () => {
    expect(createAnalysisClient(() => { throw new Error('blocked') }).mode).toBe('thread')
    expect(createAnalysisClient().mode).toBe('thread')
    expect(createAnalysisClient(fakeWorker).mode).toBe('worker')
  })

  it('exposes the analysers of the in-thread host only', () => {
    expect(createThreadClient(new AnalysisHost()).host?.analysers.tempoTracker).toBeDefined()
    expect(createWorkerClient(fakeWorker()).host).toBeNull()
  })
})
