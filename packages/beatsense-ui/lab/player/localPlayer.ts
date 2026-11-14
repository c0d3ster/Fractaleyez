import { PlaybackLog, songTimeAt, type PlaybackLoop } from './playbackLog'

// The lab's player: an audio file decoded into the lab's own audio context and played through an AudioBufferSourceNode, so every start
// lands on the context's sample clock, the same clock the capture worklet counts frames on. Each play, seek, loop change and pause is
// logged on the analysis clock (PlaybackLog), from which a recording maps onto the song exactly. A change restarts the source node a
// moment ahead (START_AHEAD_S), so the log can say exactly when it took effect.

export type PlayerMode = 'mic' | 'direct'

export type PlayerFile = { name: string; durationMs: number; size: number }

export type PlayerState = {
  file: PlayerFile | null
  playing: boolean
  /** The song position now, ms. */
  positionMs: number
  loop: PlaybackLoop | null
  mode: PlayerMode
  loading: boolean
  error: string | null
}

/** Where the player's sound goes: the speakers, and the analysis's input for the direct mode. */
export type PlayerRoutes = {
  speakers: AudioNode
  analysis: AudioNode
  /** Called with the mode, so the microphone feeds the analysis in mic mode and not in direct mode (or the room would count twice). */
  onMode: (mode: PlayerMode) => void
}

const START_AHEAD_S = 0.03

export class LocalPlayer {
  readonly log = new PlaybackLog()
  private buffer: AudioBuffer | null = null
  private file: PlayerFile | null = null
  private source: AudioBufferSourceNode | null = null
  private readonly output: GainNode
  private mode: PlayerMode = 'mic'
  private loop: PlaybackLoop | null = null
  private loading = false
  private error: string | null = null
  /** Where the song was when playback last stopped, for a resume and for the position while paused. */
  private pausedAtMs = 0

  /**
   * `analysisMs` turns the context's time (seconds) into the analysis clock (ms), so the log is on the frames' clock. It is the caller's,
   * because only the caller sees the frames arrive.
   */
  constructor(private readonly context: AudioContext, private readonly routes: PlayerRoutes, private readonly analysisMs: (contextSeconds: number) => number) {
    this.output = context.createGain()
    this.applyMode()
  }

  state = (): PlayerState => ({
    file: this.file,
    playing: this.source !== null,
    positionMs: this.positionMs(),
    loop: this.loop,
    mode: this.mode,
    loading: this.loading,
    error: this.error,
  })

  isPlaying = (): boolean => this.source !== null

  positionMs = (): number => {
    if (!this.source) return this.pausedAtMs
    return songTimeAt(this.log.segments(), this.analysisMs(this.context.currentTime)) ?? this.pausedAtMs
  }

  /** Decodes a file (stopping what plays). Resolves when it is ready; a failure shows in `state().error`. */
  load = async (file: File): Promise<void> => {
    this.pause()
    this.loading = true
    this.error = null
    try {
      const buffer = await this.context.decodeAudioData(await file.arrayBuffer())
      this.buffer = buffer
      this.file = { name: file.name, durationMs: buffer.duration * 1000, size: file.size }
      this.loop = null
      this.pausedAtMs = 0
    } catch (err) {
      this.error = `${file.name} could not be decoded: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      this.loading = false
    }
  }

  /** Plays from `fromMs`, or from where it is. Returns the analysis time the sound starts at, or null with no file. */
  play = (fromMs: number = this.positionMs()): number | null => this.start(fromMs)

  pause = (): void => {
    if (!this.source) return
    this.pausedAtMs = this.positionMs()
    this.stopSource()
    this.log.record({ atMs: this.analysisMs(this.context.currentTime), songMs: null, loop: null })
  }

  seek = (toMs: number): void => {
    const clamped = Math.max(0, Math.min(toMs, this.file?.durationMs ?? 0))
    if (this.source) this.start(clamped)
    else this.pausedAtMs = clamped
  }

  /** Loops between two song positions (null stops looping), from now on. Outside the loop, playback jumps to its start. */
  setLoop = (loop: PlaybackLoop | null): void => {
    this.loop = loop && loop.endMs > loop.startMs ? loop : null
    if (!this.source) return
    const position = this.positionMs()
    this.start(this.loop && (position >= this.loop.endMs || position < this.loop.startMs) ? this.loop.startMs : position)
  }

  setMode = (mode: PlayerMode): void => {
    this.mode = mode
    this.applyMode()
  }

  private applyMode = (): void => {
    this.output.disconnect()
    this.output.connect(this.routes.speakers)
    if (this.mode === 'direct') this.output.connect(this.routes.analysis)
    this.routes.onMode(this.mode)
  }

  private start = (fromMs: number): number | null => {
    const { buffer, file } = this
    if (!buffer || !file) return null
    this.stopSource()
    const from = Math.max(0, Math.min(fromMs, file.durationMs))
    const source = this.context.createBufferSource()
    source.buffer = buffer
    if (this.loop) {
      source.loop = true
      source.loopStart = this.loop.startMs / 1000
      source.loopEnd = this.loop.endMs / 1000
    }
    source.connect(this.output)
    const when = this.context.currentTime + START_AHEAD_S
    source.start(when, from / 1000)
    const atMs = this.analysisMs(when)
    this.log.record({ atMs, songMs: from, loop: this.loop })
    // The end of the file (not looping): logged as a pause at the moment it ends, and the position back to the start.
    source.onended = (): void => {
      if (this.source !== source) return
      this.source = null
      this.pausedAtMs = 0
      this.log.record({ atMs: atMs + (file.durationMs - from), songMs: null, loop: null })
    }
    this.source = source
    return atMs
  }

  private stopSource = (): void => {
    const { source } = this
    this.source = null
    if (!source) return
    source.onended = null
    source.stop()
    source.disconnect()
  }
}
