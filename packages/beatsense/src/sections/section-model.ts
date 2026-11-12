// The section model: gradient-boosted trees trained on expert labels (scripts/section-eval/train.py), run on the features from
// section-features.ts every 250 ms. Each booster is a list of small trees; a tree is a flat list of nodes, either
// [feature, threshold, left, right] (a sample goes left when its feature is at or under the threshold) or a leaf, [value].
//
//  - stage 1: how much the last stretch looks like other / build / break (softmax over three scores)
//  - stage 2: how likely a drop landed in the last second, from the features, stage 1 and a short memory of stage 1
//  - boundary: how likely a new song started in the last few seconds
// About a thousand tree walks of depth 4 or 5 per slot, so well under a millisecond.

export type TreeNode = [feature: number, threshold: number, left: number, right: number] | [value: number]

export type Booster = {
  baseline: number[]
  treesPerIteration: number
  trees: TreeNode[][]
}

export type SectionModelData = {
  features: string[]
  memorySeconds: number[]
  stage1: Booster
  stage2: Booster
  boundary?: Booster
}

const walk = (tree: readonly TreeNode[], x: ArrayLike<number>): number => {
  let node = tree[0]!
  while (node.length === 4) node = tree[(x[node[0]] ?? 0) <= node[1] ? node[2] : node[3]]!
  return node[0]
}

/** The raw scores of a booster for one sample, one per tree of an iteration (one for a yes/no booster, one per class otherwise). */
export const boosterScores = (booster: Booster, x: ArrayLike<number>, out: number[]): number[] => {
  const k = booster.treesPerIteration
  out.length = k
  for (let c = 0; c < k; c++) out[c] = booster.baseline[c] ?? 0
  booster.trees.forEach((tree, i) => {
    out[i % k]! += walk(tree, x)
  })
  return out
}

export const softmaxInPlace = (scores: number[]): number[] => {
  const top = Math.max(...scores)
  let sum = 0
  scores.forEach((score, i) => {
    scores[i] = Math.exp(score - top)
    sum += scores[i]!
  })
  scores.forEach((score, i) => {
    scores[i] = score / sum
  })
  return scores
}
