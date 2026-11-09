const DEVICE_STORAGE_KEY = 'cameraDeviceId'
// Asked for, not required: the browser picks the closest mode the camera has. The quality tier caps how often frames are uploaded.
const IDEAL_WIDTH = 1920
const IDEAL_HEIGHT = 1080
const IDEAL_FPS = 60

export type CameraStatus = 'idle' | 'starting' | 'live' | 'error'

export type CameraDevice = { deviceId: string; label: string }

export type CameraState = {
  status: CameraStatus
  error: string | null
  devices: CameraDevice[]
  /** The camera chosen in the UI (null: the browser's default). Kept per browser, not in presets: device ids are per machine. */
  deviceId: string | null
}

type StreamListener = (stream: MediaStream) => void

const readStoredDevice = (): string | null => {
  try {
    return localStorage.getItem(DEVICE_STORAGE_KEY)
  } catch {
    return null
  }
}

const storeDevice = (deviceId: string | null): void => {
  try {
    if (deviceId === null) localStorage.removeItem(DEVICE_STORAGE_KEY)
    else localStorage.setItem(DEVICE_STORAGE_KEY, deviceId)
  } catch {
    // Private mode or blocked storage: the choice just lasts for this page.
  }
}

const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Camera unavailable'
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Camera access was blocked'
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'No camera found'
  if (error.name === 'NotReadableError') return 'Camera is in use by another app'
  return error.message || 'Camera unavailable'
}

/**
 * The live camera feed for the video layer's `realtime` entry. One stream is shared by every slot that shows it (the
 * playing one and one fading in), counted with `acquire`/`release`, and the camera is turned off once the last one lets go.
 * Choosing another camera restarts the stream and hands the new one to every slot through its listener.
 */
export class CameraSource {
  private stream: MediaStream | null = null
  private starting: Promise<MediaStream> | null = null
  // Bumped whenever the stream is stopped or restarted, so a request that resolves after that is thrown away.
  private generation = 0
  private readonly streamListeners = new Set<StreamListener>()
  private readonly stateListeners = new Set<() => void>()
  private state: CameraState = { status: 'idle', error: null, devices: [], deviceId: readStoredDevice() }
  private watchingDevices = false

  /** Starts the camera if it is off; `onStream` gets the stream now (once it is running) and again after a device change. */
  acquire = (onStream: StreamListener, onError: (message: string) => void): (() => void) => {
    this.streamListeners.add(onStream)
    this.watchDevices()
    this.start()
      .then((stream) => {
        if (this.streamListeners.has(onStream)) onStream(stream)
      })
      .catch((error: unknown) => {
        if (this.streamListeners.has(onStream)) onError(describeError(error))
      })
    let released = false
    return () => {
      if (released) return
      released = true
      this.streamListeners.delete(onStream)
      if (!this.streamListeners.size) this.stop()
    }
  }

  getState = (): CameraState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener)
    this.watchDevices()
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /** Switches to another camera; a running feed moves to it right away. */
  setDevice = (deviceId: string | null): void => {
    if (deviceId === this.state.deviceId) return
    storeDevice(deviceId)
    this.setState({ deviceId })
    if (!this.streamListeners.size) return
    this.stop()
    this.start()
      .then((stream) => this.streamListeners.forEach((listener) => listener(stream)))
      .catch(() => undefined)
  }

  /** Lists the cameras. Their names are only filled in once the page has been allowed to use one. */
  refreshDevices = async (): Promise<void> => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [])
    const devices = all
      .filter((device) => device.kind === 'videoinput' && device.deviceId)
      .map((device, i) => ({ deviceId: device.deviceId, label: device.label || `Camera ${i + 1}` }))
    this.setState({ devices })
  }

  private start = (): Promise<MediaStream> => {
    if (this.stream) return Promise.resolve(this.stream)
    if (this.starting) return this.starting
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error('This browser cannot use a camera here (it needs https or localhost)')
      this.setState({ status: 'error', error: error.message })
      return Promise.reject(error)
    }
    const generation = this.generation
    this.setState({ status: 'starting', error: null })
    const request = this.request(this.state.deviceId)
      .then((stream) => {
        if (generation !== this.generation) {
          stream.getTracks().forEach((track) => track.stop())
          throw new Error('Camera request was superseded')
        }
        this.stream = stream
        this.starting = null
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (this.stream !== stream) return
          this.stream = null
          this.setState({ status: 'error', error: 'Camera disconnected' })
        })
        this.setState({ status: 'live', error: null })
        void this.refreshDevices()
        return stream
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.starting = null
          this.setState({ status: 'error', error: describeError(error) })
        }
        throw error
      })
    this.starting = request
    return request
  }

  /** The chosen camera, or the default one when that camera is gone (unplugged, or another machine's id). */
  private request = async (deviceId: string | null): Promise<MediaStream> => {
    const video = (id: string | null): MediaTrackConstraints => ({
      width: { ideal: IDEAL_WIDTH },
      height: { ideal: IDEAL_HEIGHT },
      frameRate: { ideal: IDEAL_FPS },
      ...(id && { deviceId: { exact: id } }),
    })
    try {
      return await navigator.mediaDevices.getUserMedia({ video: video(deviceId), audio: false })
    } catch (error) {
      if (!deviceId || !(error instanceof Error) || (error.name !== 'OverconstrainedError' && error.name !== 'NotFoundError')) throw error
      return navigator.mediaDevices.getUserMedia({ video: video(null), audio: false })
    }
  }

  private stop = (): void => {
    this.generation++
    this.starting = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.state.status !== 'error') this.setState({ status: 'idle', error: null })
  }

  private watchDevices = (): void => {
    if (this.watchingDevices || !navigator.mediaDevices) return
    this.watchingDevices = true
    navigator.mediaDevices.addEventListener?.('devicechange', () => void this.refreshDevices())
    void this.refreshDevices()
  }

  private setState = (patch: Partial<CameraState>): void => {
    this.state = { ...this.state, ...patch }
    this.stateListeners.forEach((listener) => listener())
  }
}

export const cameraSource = new CameraSource()
