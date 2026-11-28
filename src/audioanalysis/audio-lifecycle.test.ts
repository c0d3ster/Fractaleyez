import { describe, expect, it, vi } from 'vitest'

import { AudioLifecycle, isMobileShell, type MicPermission, type SoundHint } from './audio-lifecycle'

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

type FakeContext = {
  state: string
  resumeResult: 'ok' | 'reject'
  resume: ReturnType<typeof vi.fn<() => Promise<void>>>
  addEventListener: (type: 'statechange', listener: () => void) => void
  setState: (state: string) => void
}

const makeContext = (): FakeContext => {
  let listener: (() => void) | null = null
  const context: FakeContext = {
    state: 'suspended',
    resumeResult: 'ok',
    resume: vi.fn((): Promise<void> => {
      if (context.resumeResult === 'reject') return Promise.reject(new Error('not allowed'))
      context.setState('running')
      return Promise.resolve()
    }),
    addEventListener: (_type, next) => {
      listener = next
    },
    setState: (state) => {
      context.state = state
      listener?.()
    },
  }
  return context
}

type FakeTrack = { readyState: string; addEventListener: (type: 'ended', listener: () => void) => void; end: () => void }

type FakeMic = { mediaStream: { getAudioTracks: () => FakeTrack[] }; track: FakeTrack }

const makeMic = (): FakeMic => {
  let onEnded: (() => void) | null = null
  const track: FakeTrack = {
    readyState: 'live',
    addEventListener: (_type, listener) => {
      onEnded = listener
    },
    end: () => {
      track.readyState = 'ended'
      onEnded?.()
    },
  }
  return { track, mediaStream: { getAudioTracks: () => [track] } }
}

type FakeTarget = {
  listeners: Map<string, Set<(event: Event) => void>>
  visibilityState: string
  addEventListener: (type: string, listener: (event: Event) => void) => void
  removeEventListener: (type: string, listener: (event: Event) => void) => void
  fire: (type: string, event?: Partial<PageTransitionEvent>) => void
}

const makeTarget = (): FakeTarget => {
  const listeners = new Map<string, Set<(event: Event) => void>>()
  return {
    listeners,
    visibilityState: 'visible',
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    fire: (type, event = {}) => {
      listeners.get(type)?.forEach((listener) => listener(event as Event))
    },
  }
}

type Options = { permission?: MicPermission | null; micResults?: ('ok' | string)[] }

const setup = ({ permission = null, micResults = ['ok'] }: Options = {}) => {
  const context = makeContext()
  const mics: FakeMic[] = []
  const hints: SoundHint[] = []
  const results = [...micResults]
  const connectMicrophone = vi.fn((): Promise<FakeMic> => {
    const result = results.shift() ?? 'ok'
    if (result !== 'ok') return Promise.reject(Object.assign(new Error(result), { name: result }))
    const mic = makeMic()
    mics.push(mic)
    return Promise.resolve(mic)
  })
  const deps = {
    context,
    connectMicrophone,
    onMicrophone: vi.fn(),
    queryMicPermission: vi.fn(() => Promise.resolve(permission)),
    pauseDrawing: vi.fn(),
    resumeDrawing: vi.fn(),
    onContextResumed: vi.fn(),
    setHint: (hint: SoundHint): void => {
      hints.push(hint)
    },
  }
  const lifecycle = new AudioLifecycle(deps)
  return { lifecycle, context, mics, hints, deps, lastHint: (): SoundHint | undefined => hints[hints.length - 1] }
}

describe('AudioLifecycle', () => {
  it('asks for nothing before the first tap and shows the tap hint', () => {
    const { context, deps, lastHint } = setup()
    expect(context.resume).not.toHaveBeenCalled()
    expect(deps.connectMicrophone).not.toHaveBeenCalled()
    expect(lastHint()).toBe('tap')
  })

  it('resumes the context and asks for the microphone in the same call as the tap', async () => {
    const { lifecycle, context, deps, mics, lastHint } = setup()
    lifecycle.gesture()
    // Both happened synchronously, inside the tap.
    expect(context.resume).toHaveBeenCalledOnce()
    expect(deps.connectMicrophone).toHaveBeenCalledOnce()
    await flush()
    expect(deps.onMicrophone).toHaveBeenCalledWith(mics[0])
    expect(lastHint()).toBeNull()
  })

  it('does not open the microphone twice when one tap fires several gesture events', async () => {
    const { lifecycle, deps } = setup()
    lifecycle.gesture()
    lifecycle.gesture()
    await flush()
    lifecycle.gesture()
    expect(deps.connectMicrophone).toHaveBeenCalledOnce()
  })

  it('asks again on the next tap after the prompt was dismissed', async () => {
    const { lifecycle, deps, lastHint } = setup({ permission: { state: 'prompt', onchange: null }, micResults: ['NotAllowedError', 'ok'] })
    await flush()
    lifecycle.gesture()
    await flush()
    expect(lastHint()).toBe('tap')
    lifecycle.gesture()
    await flush()
    expect(deps.connectMicrophone).toHaveBeenCalledTimes(2)
    expect(deps.onMicrophone).toHaveBeenCalledOnce()
    expect(lastHint()).toBeNull()
  })

  it('says sound is blocked when the permission is denied, and opens the microphone without a reload once it is allowed', async () => {
    const permission: MicPermission & { state: string } = { state: 'denied', onchange: null }
    const { lifecycle, deps, lastHint } = setup({ permission, micResults: ['NotAllowedError', 'ok'] })
    await flush()
    expect(lastHint()).toBe('blocked')
    lifecycle.gesture()
    await flush()
    expect(lastHint()).toBe('blocked')
    permission.state = 'granted'
    permission.onchange?.({} as Event)
    await flush()
    expect(deps.connectMicrophone).toHaveBeenCalledTimes(2)
    expect(deps.onMicrophone).toHaveBeenCalledOnce()
    expect(lastHint()).toBeNull()
  })

  it('says sound is blocked after a denial where the Permissions API is missing', async () => {
    const { lifecycle, lastHint } = setup({ permission: null, micResults: ['NotAllowedError'] })
    lifecycle.gesture()
    await flush()
    expect(lastHint()).toBe('blocked')
  })

  it('retries a denied microphone on return to the page', async () => {
    const { lifecycle, deps } = setup({ micResults: ['NotAllowedError', 'ok'] })
    lifecycle.gesture()
    await flush()
    lifecycle.setVisible(false)
    lifecycle.setVisible(true)
    await flush()
    expect(deps.connectMicrophone).toHaveBeenCalledTimes(2)
    expect(deps.onMicrophone).toHaveBeenCalledOnce()
  })

  it('stops asking and hides the hint when there is no microphone to open', async () => {
    const { lifecycle, deps, lastHint } = setup({ micResults: ['NotFoundError'] })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    lifecycle.gesture()
    await flush()
    lifecycle.gesture()
    expect(deps.connectMicrophone).toHaveBeenCalledOnce()
    expect(lastHint()).toBeNull()
    error.mockRestore()
  })

  it('pauses the drawing when hidden and on return resumes the context, the drawing and the clock', async () => {
    const { lifecycle, context, deps } = setup()
    lifecycle.gesture()
    await flush()
    expect(deps.onContextResumed).toHaveBeenCalledOnce()
    lifecycle.setVisible(false)
    context.setState('interrupted')
    expect(deps.pauseDrawing).toHaveBeenCalledOnce()
    lifecycle.setVisible(true)
    expect(context.resume).toHaveBeenCalledTimes(2)
    expect(deps.resumeDrawing).toHaveBeenCalledOnce()
    expect(deps.onContextResumed).toHaveBeenCalledTimes(2)
    // The microphone is still live: not asked for again.
    expect(deps.connectMicrophone).toHaveBeenCalledOnce()
  })

  it('reopens the microphone on return when the system ended its track', async () => {
    const { lifecycle, deps, mics } = setup()
    lifecycle.gesture()
    await flush()
    lifecycle.setVisible(false)
    mics[0]!.track.end()
    lifecycle.setVisible(true)
    await flush()
    expect(deps.connectMicrophone).toHaveBeenCalledTimes(2)
    expect(deps.onMicrophone).toHaveBeenLastCalledWith(mics[1])
  })

  it('shows the tap hint while iOS holds the context interrupted, and the next tap resumes it', async () => {
    const { lifecycle, context, lastHint } = setup()
    lifecycle.gesture()
    await flush()
    context.resumeResult = 'reject'
    context.setState('interrupted')
    expect(lastHint()).toBe('tap')
    context.resumeResult = 'ok'
    lifecycle.gesture()
    await flush()
    expect(context.state).toBe('running')
    expect(lastHint()).toBeNull()
  })

  it('wires taps, visibility and the back-forward cache, and unwires them', async () => {
    const { lifecycle, deps } = setup()
    const doc = makeTarget()
    const win = makeTarget()
    const detach = lifecycle.attach(doc, win)
    win.fire('touchend')
    expect(deps.connectMicrophone).toHaveBeenCalledOnce()
    await flush()
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(deps.pauseDrawing).toHaveBeenCalledOnce()
    win.fire('pageshow', { persisted: true })
    expect(deps.resumeDrawing).toHaveBeenCalledOnce()
    win.fire('pagehide')
    expect(deps.pauseDrawing).toHaveBeenCalledTimes(2)
    detach()
    expect([...win.listeners.values(), ...doc.listeners.values()].every((set) => set.size === 0)).toBe(true)
  })
})

describe('isMobileShell', () => {
  const view = (coarse: boolean, innerWidth: number) => ({ matchMedia: () => ({ matches: coarse }), innerWidth })

  it('is a touch-first viewport at most 820px wide', () => {
    expect(isMobileShell(view(true, 390))).toBe(true)
    expect(isMobileShell(view(true, 820))).toBe(true)
  })

  it('is not a touch laptop or a desktop', () => {
    expect(isMobileShell(view(true, 1280))).toBe(false)
    expect(isMobileShell(view(false, 390))).toBe(false)
    expect(isMobileShell({ innerWidth: 390 })).toBe(false)
  })
})
