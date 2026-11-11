/* eslint-disable max-classes-per-file */
// The beat network: a small causal GRU over the five onset-band levels that says, every 10 ms, how likely a beat (and a downbeat) is right
// now. Trained by scripts/section-eval/beat-net.py on Raveform's marked beats. It learns what a beat sounds like in each song from what it
// has heard so far (the kick in one, a clap in another), which a rise in energy alone cannot tell.
//
// The input has to match beat-net.py exactly (see its header): each frame's band levels in dB, interpolated onto a 10 ms hop grid starting
// at the first frame, then per hop and band the level against a 3 s follower, the rise over a 30 ms follower and the step from the hop
// before. The GRU uses PyTorch's equations, gates in its order (reset, update, new).

export type GruLayer = {
  /** (3 x hidden) x inputs, row-major, gates reset, update, new. */
  weight_ih: number[]
  /** (3 x hidden) x hidden. */
  weight_hh: number[]
  bias_ih: number[]
  bias_hh: number[]
}

export type BeatNetModel = {
  inputs: number
  hidden: number
  hopMs: number
  slowTauMs: number
  fastTauMs: number
  floorDb: number
  layers: GruLayer[]
  /** 2 x hidden: beat, downbeat. */
  outWeight: number[]
  outBias: number[]
}

export type BeatActivation = {
  /** The hop's time (ms, the clock of the frames). */
  t: number
  /** How likely a beat is on this hop, 0 to 1. */
  beat: number
  downbeat: number
}

const BANDS = 5
const FEATURES_PER_BAND = 3
// A gap between frames longer than this (a hidden tab, a long stall) is not filled in: catching up would run thousands of steps in one
// frame on audio that was never heard. The network starts over from the next frame instead.
const MAX_GAP_MS = 250

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

class GruCell {
  readonly h: Float64Array
  private readonly gi: Float64Array
  private readonly gh: Float64Array

  constructor(private readonly layer: GruLayer, private readonly inputs: number, private readonly hidden: number) {
    this.h = new Float64Array(hidden)
    this.gi = new Float64Array(3 * hidden)
    this.gh = new Float64Array(3 * hidden)
  }

  step = (x: ArrayLike<number>): Float64Array => {
    const { weight_ih: wi, weight_hh: wh, bias_ih: bi, bias_hh: bh } = this.layer
    const { inputs, hidden, h, gi, gh } = this
    for (let row = 0; row < 3 * hidden; row++) {
      let sumI = bi[row]!
      const offI = row * inputs
      for (let c = 0; c < inputs; c++) sumI += wi[offI + c]! * x[c]!
      gi[row] = sumI
      let sumH = bh[row]!
      const offH = row * hidden
      for (let c = 0; c < hidden; c++) sumH += wh[offH + c]! * h[c]!
      gh[row] = sumH
    }
    for (let j = 0; j < hidden; j++) {
      const r = sigmoid(gi[j]! + gh[j]!)
      const z = sigmoid(gi[hidden + j]! + gh[hidden + j]!)
      const n = Math.tanh(gi[2 * hidden + j]! + r * gh[2 * hidden + j]!)
      h[j] = (1 - z) * n + z * h[j]!
    }
    return h
  }

  reset = (): void => {
    this.h.fill(0)
  }
}

export class BeatNet {
  private readonly cells: GruCell[]
  private readonly features: Float64Array
  private readonly slow = new Float64Array(BANDS)
  private readonly fast = new Float64Array(BANDS)
  private readonly prev = new Float64Array(BANDS)
  private readonly hopDb = new Float64Array(BANDS)
  private readonly lastDb = new Float64Array(BANDS)
  private readonly nowDb = new Float64Array(BANDS)
  private readonly slowAlpha: number
  private readonly fastAlpha: number
  private lastT: number | null = null
  private nextHop = 0
  private started = false
  private readonly onHop: (activation: BeatActivation) => void

  constructor(private readonly model: BeatNetModel, onHop: (activation: BeatActivation) => void) {
    if (model.inputs !== BANDS * FEATURES_PER_BAND || model.layers.length === 0) throw new Error('beat net: unexpected model shape')
    this.cells = model.layers.map((layer, i) => new GruCell(layer, i === 0 ? model.inputs : model.hidden, model.hidden))
    this.features = new Float64Array(model.inputs)
    this.slowAlpha = 1 - Math.exp(-model.hopMs / model.slowTauMs)
    this.fastAlpha = 1 - Math.exp(-model.hopMs / model.fastTauMs)
    this.onHop = onHop
  }

  /** Adds one frame: the five onset-band levels (% of full scale). Runs the network on every 10 ms hop the frame completes. */
  push = (t: number, levels: readonly number[]): void => {
    const { floorDb, hopMs } = this.model
    const db = this.hopDb
    if (this.lastT !== null && t - this.lastT > MAX_GAP_MS) this.reset()
    if (this.lastT === null) {
      for (let b = 0; b < BANDS; b++) this.lastDb[b] = Math.max(floorDb, 20 * Math.log10(Math.max(levels[b] ?? 0, 1e-6)))
      this.lastT = t
      this.nextHop = t
      this.runHop(t, this.lastDb)
      this.nextHop = t + hopMs
      return
    }
    const fromT = this.lastT
    if (t <= fromT) return
    const now = this.nowDb
    for (let b = 0; b < BANDS; b++) now[b] = Math.max(floorDb, 20 * Math.log10(Math.max(levels[b] ?? 0, 1e-6)))
    while (this.nextHop <= t) {
      const f = (this.nextHop - fromT) / (t - fromT)
      for (let b = 0; b < BANDS; b++) db[b] = this.lastDb[b]! + (now[b]! - this.lastDb[b]!) * f
      this.runHop(this.nextHop, db)
      this.nextHop += hopMs
    }
    this.lastDb.set(now)
    this.lastT = t
  }

  reset = (): void => {
    this.cells.forEach((cell) => cell.reset())
    this.lastT = null
    this.started = false
  }

  private runHop = (t: number, db: ArrayLike<number>): void => {
    const x = this.features
    for (let b = 0; b < BANDS; b++) {
      const d = db[b]!
      if (!this.started) {
        this.slow[b] = d
        this.fast[b] = d
        this.prev[b] = d
      }
      x[b * FEATURES_PER_BAND] = (d - this.slow[b]!) / 20
      x[b * FEATURES_PER_BAND + 1] = Math.max(0, d - this.fast[b]!) / 10
      x[b * FEATURES_PER_BAND + 2] = Math.max(0, d - this.prev[b]!) / 10
      this.slow[b]! += (d - this.slow[b]!) * this.slowAlpha
      this.fast[b]! += (d - this.fast[b]!) * this.fastAlpha
      this.prev[b] = d
    }
    this.started = true
    let input: ArrayLike<number> = x
    for (const cell of this.cells) input = cell.step(input)
    const { outWeight, outBias, hidden } = this.model
    const logit = (row: number): number => {
      let sum = outBias[row]!
      for (let c = 0; c < hidden; c++) sum += outWeight[row * hidden + c]! * input[c]!
      return sum
    }
    this.onHop({ t, beat: sigmoid(logit(0)), downbeat: sigmoid(logit(1)) })
  }
}
