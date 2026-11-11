export type StripBackgroundOptions = {
  // Gates which edge pixels can seed the fill (near-black/gray/white only, so colored
  // backgrounds are left alone).
  neutralChannelSpread?: number
  // Bounds how far a pixel's color may drift from the already-filled neighbor that
  // reached it, so a single anti-aliased/noisy step gets absorbed but a hard-edge
  // outline stops the fill cold.
  floodFillStepTolerance?: number
  // Bounds the *total* drift accumulated over the whole chain of hops back to the
  // border seed — without it, many small sub-tolerance steps can chain together and
  // worm past a real outline into an interior region that happens to share a similar
  // tone.
  floodFillMaxDrift?: number
  // How many background pixels near the stopping edge get a soft alpha ramp instead
  // of a hard 0/255 cutoff.
  falloffRadiusPx?: number
  // Fraction of opaque pixels the two most common color buckets must cover for an
  // image to be treated as flat/bilevel line-art (only then is it safe to also seed
  // interior background holes — see isFlatImage).
  flatImageColorCoverage?: number
  // How finely colors are bucketed when checking flat-image coverage.
  flatImageColorQuantLevels?: number
  // How close an interior pixel must be to the *learned* border-background color (not
  // just "near-neutral") to be seeded directly on a flat image, so a flat image's
  // foreground color (also near-neutral, e.g. black ink) isn't swept up just for
  // being grayscale.
  interiorBackgroundMatchTolerance?: number
  // Below this fraction of the original opaque content, an entire strip result is
  // abandoned and the image is left untouched — guards against textured photo
  // backgrounds (a brick wall, grout lines) nibbling a small, irregular bite out of
  // one edge instead of either clearing the background cleanly or matching nothing.
  minStripAreaFraction?: number
}

const DEFAULT_OPTIONS: Required<StripBackgroundOptions> = {
  neutralChannelSpread: 20,
  floodFillStepTolerance: 10,
  floodFillMaxDrift: 24,
  falloffRadiusPx: 3,
  flatImageColorCoverage: 0.92,
  flatImageColorQuantLevels: 32,
  interiorBackgroundMatchTolerance: 16,
  minStripAreaFraction: 0.03,
}

const isNearNeutral = (r: number, g: number, b: number, spread: number): boolean => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min <= spread
}

// Quantizes every opaque pixel's color and checks whether the two most common buckets
// cover nearly the whole image — true for bilevel line art/logos/signatures, false for
// photos and other continuous-tone images where a same-colored subject region could
// plausibly exist.
const isFlatImage = (
  data: Uint8ClampedArray,
  pixelCount: number,
  coverage: number,
  quantLevels: number,
): boolean => {
  const bucketCounts = new Map<number, number>()
  let opaqueCount = 0
  for (let idx = 0; idx < pixelCount; idx++) {
    const p = idx * 4
    if ((data[p + 3] ?? 0) === 0) continue
    opaqueCount += 1
    const rBucket = Math.floor(((data[p] ?? 0) / 256) * quantLevels)
    const gBucket = Math.floor(((data[p + 1] ?? 0) / 256) * quantLevels)
    const bBucket = Math.floor(((data[p + 2] ?? 0) / 256) * quantLevels)
    const key = (rBucket * quantLevels + gBucket) * quantLevels + bBucket
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1)
  }
  if (opaqueCount === 0) return false
  let top1 = 0
  let top2 = 0
  for (const count of bucketCounts.values()) {
    if (count > top1) {
      top2 = top1
      top1 = count
    } else if (count > top2) {
      top2 = count
    }
  }
  return (top1 + top2) / opaqueCount >= coverage
}

// Flood-fills inward from the canvas edges, removing only pixels reachable from a
// near-neutral border through a chain of locally-similar neighbors, then feathers the
// resulting cut edge with a short alpha falloff instead of leaving a hard binary mask.
export const stripEdgeBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options?: StripBackgroundOptions,
): void => {
  // Per field, so an option passed as `undefined` keeps its default instead of replacing it.
  const opts: Required<StripBackgroundOptions> = {
    neutralChannelSpread: options?.neutralChannelSpread ?? DEFAULT_OPTIONS.neutralChannelSpread,
    floodFillStepTolerance: options?.floodFillStepTolerance ?? DEFAULT_OPTIONS.floodFillStepTolerance,
    floodFillMaxDrift: options?.floodFillMaxDrift ?? DEFAULT_OPTIONS.floodFillMaxDrift,
    falloffRadiusPx: options?.falloffRadiusPx ?? DEFAULT_OPTIONS.falloffRadiusPx,
    flatImageColorCoverage: options?.flatImageColorCoverage ?? DEFAULT_OPTIONS.flatImageColorCoverage,
    flatImageColorQuantLevels: options?.flatImageColorQuantLevels ?? DEFAULT_OPTIONS.flatImageColorQuantLevels,
    interiorBackgroundMatchTolerance: options?.interiorBackgroundMatchTolerance ?? DEFAULT_OPTIONS.interiorBackgroundMatchTolerance,
    minStripAreaFraction: options?.minStripAreaFraction ?? DEFAULT_OPTIONS.minStripAreaFraction,
  }
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const pixelCount = width * height
  const isBackground = new Uint8Array(pixelCount)
  const seeded = new Uint8Array(pixelCount)
  const drift = new Uint16Array(pixelCount)
  const queue: number[] = []

  // Rectangular uploads may arrive already sitting on transparent square padding —
  // that padding is deliberate and shouldn't count as "background removed" one way or
  // the other, so the area-fraction sanity check below is measured only against pixels
  // that started out opaque (the real content), not the full padded canvas.
  const wasOriginallyOpaque = new Uint8Array(pixelCount)
  let originalOpaqueCount = 0
  for (let idx = 0; idx < pixelCount; idx++) {
    if ((data[idx * 4 + 3] ?? 0) === 0) continue
    wasOriginallyOpaque[idx] = 1
    originalOpaqueCount += 1
  }

  let bgColorSumR = 0
  let bgColorSumG = 0
  let bgColorSumB = 0
  let bgColorSeedCount = 0

  const enqueueIfBackground = (idx: number): void => {
    if (seeded[idx]) return
    const p = idx * 4
    const r = data[p] ?? 0
    const g = data[p + 1] ?? 0
    const b = data[p + 2] ?? 0
    const isTransparent = (data[p + 3] ?? 0) === 0
    if (!isTransparent && !isNearNeutral(r, g, b, opts.neutralChannelSpread)) return
    seeded[idx] = 1
    isBackground[idx] = 1
    drift[idx] = 0
    if (!isTransparent) {
      bgColorSumR += r
      bgColorSumG += g
      bgColorSumB += b
      bgColorSeedCount += 1
    }
    queue.push(idx)
  }

  for (let x = 0; x < width; x++) {
    enqueueIfBackground(x)
    enqueueIfBackground((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    enqueueIfBackground(y * width)
    enqueueIfBackground(y * width + (width - 1))
  }

  // Flat/line-art images (few distinct colors, so no same-toned subject can plausibly
  // exist) also get interior pixels seeded directly whenever they closely match the
  // learned border-background color — this is what lets a fully-enclosed hole (e.g.
  // the loop of a cursive letter) get removed even though it never touches the canvas
  // edge. Photographic images skip this and keep the conservative border-only
  // behavior, since color alone can't tell a hole from a same-colored subject region
  // (an eye, a shirt) once ML-level semantics are needed.
  const bgAvgR = bgColorSeedCount > 0 ? bgColorSumR / bgColorSeedCount : 0
  const bgAvgG = bgColorSeedCount > 0 ? bgColorSumG / bgColorSeedCount : 0
  const bgAvgB = bgColorSeedCount > 0 ? bgColorSumB / bgColorSeedCount : 0
  // Close to the background color learned from the opaque border pixels (never true when the border was all transparent).
  const matchesLearnedBackground = (r: number, g: number, b: number): boolean =>
    bgColorSeedCount > 0 &&
    Math.max(Math.abs(r - bgAvgR), Math.abs(g - bgAvgG), Math.abs(b - bgAvgB)) <= opts.interiorBackgroundMatchTolerance

  if (bgColorSeedCount > 0 && isFlatImage(data, pixelCount, opts.flatImageColorCoverage, opts.flatImageColorQuantLevels)) {
    for (let idx = 0; idx < pixelCount; idx++) {
      if (seeded[idx]) continue
      const p = idx * 4
      if ((data[p + 3] ?? 0) === 0) continue
      if (!matchesLearnedBackground(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0)) continue
      seeded[idx] = 1
      isBackground[idx] = 1
      drift[idx] = 0
      queue.push(idx)
    }
  }

  let head = 0
  while (head < queue.length) {
    const idx = queue[head] ?? -1
    head += 1
    const x = idx % width
    const y = Math.floor(idx / width)
    const p = idx * 4
    const r0 = data[p] ?? 0
    const g0 = data[p + 1] ?? 0
    const b0 = data[p + 2] ?? 0

    const neighbors: number[] = []
    if (x > 0) neighbors.push(idx - 1)
    if (x < width - 1) neighbors.push(idx + 1)
    if (y > 0) neighbors.push(idx - width)
    if (y < height - 1) neighbors.push(idx + width)

    const currentDrift = drift[idx] ?? 0
    // A transparent pixel's RGB means nothing (usually 0,0,0), so stepping from padding into content is not a color step: it takes an
    // opaque pixel only when it reads as the background itself, the way a border seed would, and the drift starts over there.
    const fromTransparent = (data[p + 3] ?? 0) === 0

    for (const nIdx of neighbors) {
      if (seeded[nIdx]) continue
      const np = nIdx * 4
      if ((data[np + 3] ?? 0) === 0) {
        seeded[nIdx] = 1
        isBackground[nIdx] = 1
        drift[nIdx] = currentDrift
        queue.push(nIdx)
        continue
      }
      const nr = data[np] ?? 0
      const ng = data[np + 1] ?? 0
      const nb = data[np + 2] ?? 0
      if (fromTransparent) {
        if (!isNearNeutral(nr, ng, nb, opts.neutralChannelSpread) || !matchesLearnedBackground(nr, ng, nb)) continue
        seeded[nIdx] = 1
        isBackground[nIdx] = 1
        drift[nIdx] = 0
        queue.push(nIdx)
        continue
      }
      const step = Math.max(Math.abs(nr - r0), Math.abs(ng - g0), Math.abs(nb - b0))
      if (step > opts.floodFillStepTolerance) continue
      const newDrift = currentDrift + step
      if (newDrift > opts.floodFillMaxDrift) continue
      seeded[nIdx] = 1
      isBackground[nIdx] = 1
      drift[nIdx] = newDrift
      queue.push(nIdx)
    }
  }

  let strippedContentCount = 0
  for (let idx = 0; idx < pixelCount; idx++) {
    if (isBackground[idx] && wasOriginallyOpaque[idx]) strippedContentCount += 1
  }
  if (originalOpaqueCount === 0 || strippedContentCount / originalOpaqueCount < opts.minStripAreaFraction) return

  const distanceFromForeground = new Int16Array(pixelCount).fill(-1)
  const falloffQueue: number[] = []
  for (let idx = 0; idx < pixelCount; idx++) {
    if (!isBackground[idx]) continue
    const x = idx % width
    const y = Math.floor(idx / width)
    const touchesForeground =
      (x > 0 && !isBackground[idx - 1]) ||
      (x < width - 1 && !isBackground[idx + 1]) ||
      (y > 0 && !isBackground[idx - width]) ||
      (y < height - 1 && !isBackground[idx + width])
    if (touchesForeground) {
      distanceFromForeground[idx] = 0
      falloffQueue.push(idx)
    }
  }
  let fHead = 0
  while (fHead < falloffQueue.length) {
    const idx = falloffQueue[fHead] ?? -1
    fHead += 1
    const d = distanceFromForeground[idx] ?? -1
    if (d >= opts.falloffRadiusPx - 1) continue
    const x = idx % width
    const y = Math.floor(idx / width)
    const neighbors: number[] = []
    if (x > 0) neighbors.push(idx - 1)
    if (x < width - 1) neighbors.push(idx + 1)
    if (y > 0) neighbors.push(idx - width)
    if (y < height - 1) neighbors.push(idx + width)
    for (const nIdx of neighbors) {
      if (!isBackground[nIdx]) continue
      if ((distanceFromForeground[nIdx] ?? -1) !== -1) continue
      distanceFromForeground[nIdx] = d + 1
      falloffQueue.push(nIdx)
    }
  }

  for (let idx = 0; idx < pixelCount; idx++) {
    if (!isBackground[idx]) continue
    const p = idx * 4
    const d = distanceFromForeground[idx] ?? -1
    const origAlpha = data[p + 3] ?? 0
    data[p + 3] = d === -1 ? 0 : Math.round((origAlpha * (opts.falloffRadiusPx - d)) / (opts.falloffRadiusPx + 1))
  }

  ctx.putImageData(imageData, 0, 0)
}
