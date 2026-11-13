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

/**
 * Throws unless every vector of `model` is sized for its inputs: one mean, scale and hidden weight per feature, one hidden bias per hidden
 * unit, one output weight per hidden unit and one output bias per output (standardize and dense would read a missing entry as a default).
 */
export const checkMlpShape = (model: MlpModel, what: string): void => {
  const { features, mean, scale, hidden, output } = model
  checkLength(what, 'mean', mean, features.length)
  checkLength(what, 'scale', scale, features.length)
  hidden.weights.forEach((row, j) => checkLength(what, `hidden row ${j}`, row, features.length))
  checkLength(what, 'hidden bias', hidden.bias, hidden.weights.length)
  output.weights.forEach((row, k) => checkLength(what, `output row ${k}`, row, hidden.weights.length))
  checkLength(what, 'output bias', output.bias, output.weights.length)
}

/** Where each of the model's inputs sits in `names` (the detector's full feature list). Throws on a name the detector does not know. */
export const inputIndexes = (model: Pick<MlpModel, 'features'>, names: readonly string[], what: string): number[] =>
  model.features.map((name) => {
    const at = names.indexOf(name)
    if (at < 0) throw new Error(`${what} reads an unknown feature: ${name}`)
    return at
  })

/**
 * Throws unless a model's inputs are `expected` (the same names in the same order: the detector builds its feature vector in that order and
 * the model's weights are applied by position) and every vector in `sized` has one entry per input. For models injected through the public
 * API, which would otherwise score the wrong inputs without an error.
 */
export const checkInputLayout = (what: string, features: readonly string[], expected: readonly string[], sized: Record<string, readonly number[]>): void => {
  const same = features.length === expected.length && features.every((name, i) => name === expected[i])
  if (!same) throw new Error(`${what} must read the bundled model's ${expected.length} features, in its order`)
  Object.entries(sized).forEach(([name, values]) => {
    if (values.length !== expected.length) throw new Error(`${what}: ${name} has ${values.length} entries, expected ${expected.length}`)
  })
}

/** Throws unless `values` has `length` entries. */
export const checkLength = (what: string, name: string, values: readonly unknown[], length: number): void => {
  if (values.length !== length) throw new Error(`${what}: ${name} has ${values.length} entries, expected ${length}`)
}

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
