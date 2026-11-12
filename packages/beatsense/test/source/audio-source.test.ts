import { afterEach, describe, expect, it, vi } from 'vitest'

import { AudioSource, MIC_CONSTRAINTS, PROCESSOR_NAME, packFrame } from '../../src'

type Port = { onmessage: ((event: { data: Float64Array }) => void) | null; postMessage: ReturnType<typeof vi.fn> }

const setup = () => {
  const port: Port = { onmessage: null, postMessage: vi.fn() }
  const nodes: { name: string }[] = []
  class FakeWorkletNode {
    port = port
    connect = vi.fn()
    disconnect = vi.fn()
    constructor(_context: unknown, name: string) {
      nodes.push({ name })
    }
  }
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode)
  const mute = { gain: { value: 1 }, connect: vi.fn() }
  const mic = { kind: 'mic' }
  const context = {
    destination: {},
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createGain: () => mute,
    createMediaStreamSource: vi.fn().mockReturnValue(mic),
  }
  const getUserMedia = vi.fn().mockResolvedValue({})
  const source = new AudioSource({ context: context as never, workletUrl: '/worklet.js', getUserMedia })
  return { source, port, nodes, context, getUserMedia, mute, mic }
}

describe('AudioSource', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('can be built with no browser globals', () => {
    expect(() => new AudioSource({ context: {} as never, workletUrl: '/w.js' })).not.toThrow()
  })

  it('loads the processor and keeps its node muted in the graph', async () => {
    const { source, context, nodes, mute } = setup()
    await source.start()
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith('/worklet.js')
    expect(nodes[0]?.name).toBe(PROCESSOR_NAME)
    expect(mute.gain.value).toBe(0)
    expect(mute.connect).toHaveBeenCalledWith(context.destination)
  })

  it('opens the microphone with voice processing off', async () => {
    const { source, getUserMedia, mic } = setup()
    expect(await source.connectMicrophone()).toBe(mic)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: MIC_CONSTRAINTS })
    expect(MIC_CONSTRAINTS).toEqual({ autoGainControl: false, noiseSuppression: false, echoCancellation: false })
  })

  it('hands every frame the worklet posts to the listeners, and stops after unsubscribing', async () => {
    const { source, port } = setup()
    await source.start()
    const seen: number[] = []
    const off = source.onFrame(({ index }) => seen.push(index))
    port.onmessage?.({ data: packFrame({ index: 1, levels: [1, 2, 3, 4, 5], energy: 2 }) })
    off()
    port.onmessage?.({ data: packFrame({ index: 2, levels: [1, 2, 3, 4, 5], energy: 2 }) })
    expect(seen).toEqual([1])
  })

  it('tells the worklet when the spectrum is not wanted', async () => {
    const { source, port } = setup()
    await source.start()
    source.setSpectrum(false)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'spectrum', on: false })
  })

  it('refuses `input` before it is started', () => {
    expect(() => setup().source.input).toThrow()
  })
})
