// Starts and keeps the sound going on phones. iOS Safari starts an audio context only from inside a tap, and Android Chrome holds a new
// one suspended until the page is touched, so on the mobile shell nothing is asked for at load: the first tap resumes the context and
// opens the microphone in the same handler. A denied microphone is asked for again on the next tap, on return to the page and when the
// browser's permission changes; a locked phone or a background tab pauses the drawing and picks the sound back up on return.

/** The line at the bottom of the screen: tap to start the sound, sound blocked in the browser settings, or nothing. */
export type SoundHint = 'tap' | 'blocked' | null

/** The parts of an AudioContext used here. `state` is a string because iOS adds `interrupted` (a call, Siri, the lock screen). */
export type LifecycleContext = {
  readonly state: string
  resume: () => Promise<void>
  addEventListener: (type: 'statechange', listener: () => void) => void
}

type MicTrack = { readonly readyState: string; addEventListener: (type: 'ended', listener: () => void) => void }

/** The microphone's source node, as far as this module reads it. */
export type LifecycleMic = { mediaStream: { getAudioTracks: () => MicTrack[] } }

/** A `PermissionStatus`, as far as this module reads it. */
export type MicPermission = { readonly state: string; onchange: ((event: Event) => void) | null }

export type AudioLifecycleDeps<Mic extends LifecycleMic> = {
  context: LifecycleContext
  /** Opens the microphone. Must call `getUserMedia` before it awaits anything, so a call from a tap counts as that tap. */
  connectMicrophone: () => Promise<Mic>
  /** Routes a newly opened microphone into the analysis. */
  onMicrophone: (mic: Mic) => void
  /** The microphone permission, where the Permissions API has it; null where it does not. */
  queryMicPermission: () => Promise<MicPermission | null>
  pauseDrawing: () => void
  resumeDrawing: () => void
  /** The context is running again after a stop: the audio clock stood still meanwhile. */
  onContextResumed: () => void
  setHint: (hint: SoundHint) => void
}

type MicState = 'none' | 'connecting' | 'live' | 'ended' | 'failed' | 'unavailable'

type EventTargetLike = {
  addEventListener: (type: string, listener: (event: Event) => void, options?: AddEventListenerOptions) => void
  removeEventListener: (type: string, listener: (event: Event) => void, options?: AddEventListenerOptions) => void
}

/** The events that count as a user gesture for starting audio (touchend on iOS; pointerup, click and keydown elsewhere). */
const GESTURE_EVENTS = ['touchend', 'pointerup', 'click', 'keydown']
const GESTURE_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

// A denied permission fails with NotAllowedError (SecurityError in older WebKit). No microphone, or no getUserMedia at all (a page not
// served over HTTPS), cannot be fixed by tapping again; anything else (the microphone busy in a call) can.
const DENIED_ERRORS = new Set(['NotAllowedError', 'SecurityError'])
const UNAVAILABLE_ERRORS = new Set(['NotFoundError', 'OverconstrainedError', 'TypeError'])

const errorName = (error: unknown): string => (typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '')

export class AudioLifecycle<Mic extends LifecycleMic> {
  private mic: MicState = 'none'
  private track: MicTrack | null = null
  private blocked = false
  private tapped = false
  private visible = true
  private wasRunning: boolean
  private hint: SoundHint | undefined = undefined

  constructor(private readonly deps: AudioLifecycleDeps<Mic>) {
    this.wasRunning = deps.context.state === 'running'
    deps.context.addEventListener('statechange', this.contextChanged)
    void deps.queryMicPermission().then(this.watchPermission, () => undefined)
    this.publish()
  }

  /** A tap, a click or a key. Resumes the context and opens the microphone in this same call stack, with nothing awaited before either. */
  gesture = (): void => {
    this.tapped = true
    this.resumeContext()
    if (this.wantsMicrophone()) this.connect()
    this.publish()
  }

  /** The page was hidden (locked, another tab, another app) or shown again. */
  setVisible = (visible: boolean): void => {
    if (visible === this.visible) return
    if (visible) this.shown()
    else {
      this.visible = false
      this.deps.pauseDrawing()
    }
  }

  /** The page came back from the back-forward cache (`pageshow` with `persisted`): shown again whatever the visibility said. */
  restored = (): void => {
    this.shown()
  }

  /** Wires the lifecycle to the page's events. Returns the function that unwires it. */
  attach = (doc: EventTargetLike & { readonly visibilityState: string }, win: EventTargetLike): (() => void) => {
    const onVisibility = (): void => this.setVisible(doc.visibilityState === 'visible')
    const onPageShow = (event: Event): void => {
      if ((event as PageTransitionEvent).persisted) this.restored()
    }
    const onPageHide = (): void => this.setVisible(false)
    const onGesture = (): void => this.gesture()
    this.visible = doc.visibilityState === 'visible'
    GESTURE_EVENTS.forEach((type) => win.addEventListener(type, onGesture, GESTURE_OPTIONS))
    doc.addEventListener('visibilitychange', onVisibility)
    win.addEventListener('pageshow', onPageShow)
    win.addEventListener('pagehide', onPageHide)
    return () => {
      GESTURE_EVENTS.forEach((type) => win.removeEventListener(type, onGesture, GESTURE_OPTIONS))
      doc.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('pageshow', onPageShow)
      win.removeEventListener('pagehide', onPageHide)
    }
  }

  private shown = (): void => {
    this.visible = true
    this.resumeContext()
    if (this.tapped && this.wantsMicrophone()) this.connect()
    this.deps.resumeDrawing()
    this.publish()
  }

  private wantsMicrophone = (): boolean => {
    if (this.mic === 'live' && this.track?.readyState === 'ended') this.mic = 'ended'
    return this.mic === 'none' || this.mic === 'ended' || this.mic === 'failed'
  }

  private resumeContext = (): void => {
    if (this.deps.context.state === 'running') return
    // Rejected on iOS until an interruption is over, or without a gesture: the next tap tries again.
    this.deps.context.resume().catch(() => undefined)
  }

  private contextChanged = (): void => {
    const running = this.deps.context.state === 'running'
    if (running && !this.wasRunning) this.deps.onContextResumed()
    this.wasRunning = running
    this.publish()
  }

  private connect = (): void => {
    this.mic = 'connecting'
    this.deps.connectMicrophone().then((mic) => {
      this.mic = 'live'
      this.blocked = false
      const track = mic.mediaStream.getAudioTracks()[0] ?? null
      this.track = track
      track?.addEventListener('ended', () => {
        if (this.track !== track) return
        this.mic = 'ended'
        this.publish()
      })
      this.deps.onMicrophone(mic)
      this.publish()
    }, (error: unknown) => {
      const name = errorName(error)
      this.mic = UNAVAILABLE_ERRORS.has(name) ? 'unavailable' : 'failed'
      if (!DENIED_ERRORS.has(name)) {
        console.error('Microphone failed:', error)
        this.publish()
        return
      }
      // Denied: blocked in the settings when the Permissions API says so, or cannot tell. A dismissed prompt reads `prompt` and the next tap asks again.
      void this.deps.queryMicPermission().then((permission) => {
        this.blocked = permission === null || permission.state === 'denied'
        this.publish()
      }, () => {
        this.blocked = true
        this.publish()
      })
    })
    this.publish()
  }

  private watchPermission = (permission: MicPermission | null): void => {
    if (!permission) return
    this.blocked = permission.state === 'denied'
    permission.onchange = (): void => {
      this.blocked = permission.state === 'denied'
      // Allowed in the settings: open it now, with no reload and no tap (an open microphone needs none once it is allowed).
      if (permission.state === 'granted' && this.tapped && this.wantsMicrophone()) this.connect()
      this.publish()
    }
    this.publish()
  }

  private currentHint = (): SoundHint => {
    if (this.mic === 'connecting' || this.mic === 'unavailable') return null
    if (this.blocked && this.mic !== 'live') return 'blocked'
    if (!this.tapped) return 'tap'
    if (this.deps.context.state !== 'running' || this.mic !== 'live') return 'tap'
    return null
  }

  private publish = (): void => {
    const hint = this.currentHint()
    if (hint === this.hint) return
    this.hint = hint
    this.deps.setHint(hint)
  }
}

/** The mobile shell's rule: touch is the main input and the viewport is at most 820px wide. Desktop and touch laptops are not it. */
export const MOBILE_MAX_WIDTH = 820

export const isMobileShell = (view: { matchMedia?: (query: string) => { matches: boolean }; innerWidth: number }): boolean =>
  Boolean(view.matchMedia?.('(pointer: coarse)').matches) && view.innerWidth <= MOBILE_MAX_WIDTH
