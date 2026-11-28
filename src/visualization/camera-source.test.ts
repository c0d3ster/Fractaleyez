import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIVE_CLIP, normalizeClips } from '../config/video.config'
import { canChooseFacing, CameraSource } from './camera-source'

type FakeTrack = { stop: ReturnType<typeof vi.fn>; addEventListener: () => void }

const fakeStream = (): { stream: MediaStream; track: FakeTrack } => {
  const track: FakeTrack = { stop: vi.fn(), addEventListener: () => undefined }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

const stubDevices = (getUserMedia: () => Promise<MediaStream>): void => {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(getUserMedia), enumerateDevices: async () => [], addEventListener: () => undefined },
  })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeClips', () => {
  it('keeps a list of clips as it is', () => {
    expect(normalizeClips(['a.mp4', 'b.mp4'])).toEqual(['a.mp4', 'b.mp4'])
  })

  it('plays only the camera when it is in the list', () => {
    expect(normalizeClips(['a.mp4', LIVE_CLIP])).toEqual([LIVE_CLIP])
  })
})

describe('CameraSource', () => {
  it('shares one stream and stops it when the last user lets go', async () => {
    const { stream, track } = fakeStream()
    stubDevices(async () => stream)
    const source = new CameraSource()
    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = source.acquire(first, () => undefined)
    const releaseSecond = source.acquire(second, () => undefined)
    await flush()
    expect(first).toHaveBeenCalledWith(stream)
    expect(second).toHaveBeenCalledWith(stream)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
    expect(source.getState().status).toBe('live')
    releaseFirst()
    expect(track.stop).not.toHaveBeenCalled()
    releaseSecond()
    expect(track.stop).toHaveBeenCalled()
    expect(source.getState().status).toBe('idle')
  })

  it('stops a stream that arrives after it was released', async () => {
    const { stream, track } = fakeStream()
    stubDevices(async () => stream)
    const source = new CameraSource()
    const onStream = vi.fn()
    source.acquire(onStream, () => undefined)()
    await flush()
    expect(onStream).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalled()
  })

  it('reports a blocked camera', async () => {
    stubDevices(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    })
    const source = new CameraSource()
    const onError = vi.fn()
    source.acquire(() => undefined, onError)
    await flush()
    expect(onError).toHaveBeenCalledWith('Camera access was blocked')
    expect(source.getState()).toMatchObject({ status: 'error', error: 'Camera access was blocked' })
  })
})

describe('CameraSource facing', () => {
  const constraintsOf = (call: number): MediaTrackConstraints =>
    (vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls[call]?.[0] as MediaStreamConstraints).video as MediaTrackConstraints

  it('asks for the camera facing the chosen way and moves a running feed to it', async () => {
    stubDevices(async () => fakeStream().stream)
    const source = new CameraSource()
    source.acquire(() => undefined, () => undefined)
    await flush()
    expect(constraintsOf(0).facingMode).toBeUndefined()
    source.setFacing('environment')
    await flush()
    expect(source.getState()).toMatchObject({ facing: 'environment', deviceId: null, status: 'live' })
    expect(constraintsOf(1).facingMode).toEqual({ ideal: 'environment' })
  })

  it('lets a camera chosen by id take over from the facing', async () => {
    stubDevices(async () => fakeStream().stream)
    const source = new CameraSource()
    source.setFacing('user')
    source.setDevice('cam-2')
    expect(source.getState()).toMatchObject({ facing: null, deviceId: 'cam-2' })
    source.acquire(() => undefined, () => undefined)
    await flush()
    expect(constraintsOf(0)).toMatchObject({ deviceId: { exact: 'cam-2' } })
    expect(constraintsOf(0).facingMode).toBeUndefined()
  })

  it('offers the choice only with more than one camera', () => {
    expect(canChooseFacing([])).toBe(false)
    expect(canChooseFacing([{ deviceId: 'a', label: 'Camera 1' }])).toBe(false)
    expect(canChooseFacing([{ deviceId: 'a', label: 'Front' }, { deviceId: 'b', label: 'Back' }])).toBe(true)
  })
})

describe('CameraSource reconnect', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tries again while the camera is missing and hands the stream over once it is back', async () => {
    vi.useFakeTimers()
    const { stream } = fakeStream()
    let available = false
    stubDevices(async () => {
      if (!available) throw Object.assign(new Error('none'), { name: 'NotFoundError' })
      return stream
    })
    const source = new CameraSource()
    const onStream = vi.fn()
    source.acquire(onStream, () => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(source.getState().error).toBe('No camera found, retrying…')
    available = true
    await vi.advanceTimersByTimeAsync(2000)
    expect(onStream).toHaveBeenCalledWith(stream)
    expect(source.getState().status).toBe('live')
  })

  it('does not retry a blocked camera', async () => {
    vi.useFakeTimers()
    stubDevices(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    })
    const source = new CameraSource()
    source.acquire(() => undefined, () => undefined)
    await vi.advanceTimersByTimeAsync(10000)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('stops retrying once nothing shows the feed', async () => {
    vi.useFakeTimers()
    stubDevices(async () => {
      throw Object.assign(new Error('busy'), { name: 'NotReadableError' })
    })
    const source = new CameraSource()
    const release = source.acquire(() => undefined, () => undefined)
    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(10000)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  })
})
