/** A dense layer: `weights[out][in]`. */
export type Layer = { weights: number[][]; bias: number[] }

/** A one-hidden-layer network with its input standardization, as drum-train.py, riser-train.py and sweep-train.py write it. */
export type MlpModel = { features: string[]; mean: number[]; scale: number[]; hidden: Layer; output: Layer }

export const sigmoid = (score: number): number => 1 / (1 + Math.exp(-score))

export const dense = ({ weights, bias }: Layer, input: readonly number[]): number[] =>
  weights.map((row, j) => row.reduce((sum, w, i) => sum + w * (input[i] ?? 0), bias[j] ?? 0))

/** The raw scores of a standardized input: tanh hidden layer, then the output layer. */
export const forward = ({ hidden, output }: Pick<MlpModel, 'hidden' | 'output'>, scaled: readonly number[]): number[] =>
  dense(output, dense(hidden, scaled).map(Math.tanh))

/** `(value - mean) / scale` per input, in the model's order. */
export const standardize = ({ mean, scale }: Pick<MlpModel, 'mean' | 'scale'>, values: readonly number[]): number[] =>
  values.map((v, i) => (v - (mean[i] ?? 0)) / (scale[i] ?? 1))

/** Where each of the model's inputs sits in `names` (the detector's full feature list). Throws on a name the detector does not know. */
export const inputIndexes = (model: Pick<MlpModel, 'features'>, names: readonly string[], what: string): number[] =>
  model.features.map((name) => {
    const at = names.indexOf(name)
    if (at < 0) throw new Error(`${what} reads an unknown feature: ${name}`)
    return at
  })

/** The probability from a single-output model, reading `features[indexes[i]]` as its i-th input. */
export const scoreProbability = (model: MlpModel, indexes: readonly number[], features: readonly number[]): number =>
  sigmoid(forward(model, standardize(model, indexes.map((at) => features[at] ?? 0)))[0] ?? 0)

/** Least-squares slope (per step) and R squared of `values` against their index. */
export const fit = (values: readonly number[]): { slope: number; r2: number } => {
  const n = values.length
  if (n < 2) return { slope: 0, r2: 0 }
  const meanX = (n - 1) / 2
  const meanY = values.reduce((sum, v) => sum + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  values.forEach((v, i) => {
    sxy += (i - meanX) * (v - meanY)
    sxx += (i - meanX) ** 2
    syy += (v - meanY) ** 2
  })
  const slope = sxx > 0 ? sxy / sxx : 0
  return { slope, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0 }
}
