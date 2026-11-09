import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIVE_CLIP, normalizeClips } from '../config/video.config'
import { CameraSource } from './camera-source'

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
