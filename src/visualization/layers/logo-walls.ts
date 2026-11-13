/**
 * The 3D logo's sides as real walls, traced once from the image's alpha. Marching squares finds every outline where the alpha crosses
 * the cutoff (the outside of each shape and the inside of each hole), Ramer-Douglas-Peucker thins the points, and each stretch of
 * outline becomes a quad that runs through the logo's thickness. A wall takes the color of the solid pixel at its edge, so a turned
 * logo shows a side in the color of the edge it belongs to.
 *
 * The outline sits where the alpha, interpolated between pixel centers, equals the cutoff: the same line where the GPU's bilinear lookup
 * of the image crosses it. So the walls meet the edge a face draws, and the edge of a cutout at the same cutoff.
 */

/** Simplification keeps every point that would otherwise move the outline more than this many pixels of the traced image. */
const SIMPLIFY_TOLERANCE_PX = 0.5
/** Or that would put a wall's color more than this far off (0 to 255, on any channel) from the color the outline has there. */
const SIMPLIFY_COLOR_TOLERANCE = 24
/** Simplification first looks at every this-many points, which finds most of the points it keeps at a fraction of the cost. */
const COARSE_STEP = 4

/**
 * A point on a traced outline: where the image's alpha crosses the cutoff, in the image's pixels (x right, y down, 0 to width and 0
 * to height), with the color (0 to 255) of the solid pixel it borders.
 */
export type OutlinePoint = { x: number; y: number; r: number; g: number; b: number }

/**
 * A closed outline of the image's solid part, the last point joining the first. It is walked with the solid on the right as the image
 * is seen (x right, y down), so the outside of a shape runs clockwise and the inside of a hole counterclockwise.
 */
export type Outline = OutlinePoint[]

/**
 * The walls as indexed triangles in the logo plane's unit space: x and y in [-0.5, 0.5] with y up (the image's top row at y 0.5,
 * as a plane with a flipped texture shows it), z from -0.5 to 0.5. Colors are RGB, 0 to 1. Each triangle is wound counterclockwise
 * seen from outside the solid, so with back faces culled only the outside of a wall draws.
 */
export type WallMesh = { positions: Float32Array; colors: Float32Array; indices: Uint16Array | Uint32Array }

/**
 * How a marching-squares cell links its outline, for each of the 16 ways its corners can be solid (as the sum of top left 8, top
 * right 4, bottom right 2, bottom left 1). Links are pairs of edges, from and to (0 top, 1 right, 2 bottom, 3 left; edge k runs
 * clockwise from corner k to corner k + 1). Walking clockwise around the cell, the walk leaves the solid on one edge and comes back
 * into it on another; the outline runs from the first to the second, which keeps the solid on its right. Where two solid corners face
 * each other across the cell, `joined` applies when the middle of the cell is solid (they connect through it) and `apart` when not.
 */
type CellLinks = { apart: number[]; joined: number[] }
const CORNER_WEIGHTS = [8, 4, 2, 1]
const CELL_LINKS: CellLinks[] = Array.from({ length: 16 }, (_, cell): CellLinks => {
  const isSolid = (k: number): boolean => Math.floor(cell / (CORNER_WEIGHTS[k % 4] ?? 1)) % 2 === 1
  const leaves = [0, 1, 2, 3].filter((k) => isSolid(k) && !isSolid(k + 1))
  const enters = [0, 1, 2, 3].filter((k) => !isSolid(k) && isSolid(k + 1))
  if (leaves.length < 2) {
    const links = leaves.length === 1 ? [leaves[0] ?? 0, enters[0] ?? 0] : []
    return { apart: links, joined: links }
  }
  return { apart: leaves.flatMap((k) => [k, (k + 3) % 4]), joined: leaves.flatMap((k) => [k, (k + 1) % 4]) }
})

/**
 * Every outline of the solid part of an RGBA image (`data` row by row; a pixel is solid when its alpha is at least `cutoffAlpha`, which
 * is above 0 and at most 255). Pixels past the image's border count as clear, so a shape that touches the border is closed along it.
 */
export const traceOutlines = (data: Uint8ClampedArray, width: number, height: number, cutoffAlpha: number): Outline[] => {
  // A sample per pixel center, with a ring of clear samples around the image so every outline closes inside the grid. Sample
  // (sx, sy) is pixel (sx - 1, sy - 1).
  const columns = width + 2
  const rows = height + 2
  const count = columns * rows
  const solid = new Uint8Array(count)
  // The first and last solid sample column of each row (first above last when the row has none), so the scan skips clear margins.
  const firstSolid = new Int32Array(rows).fill(columns)
  const lastSolid = new Int32Array(rows).fill(-1)
  let alphaIndex = 3
  for (let sy = 1; sy <= height; sy++) {
    const rowStart = sy * columns
    let first = columns
    let last = -1
    for (let sx = 1; sx <= width; sx++) {
      if ((data[alphaIndex] ?? 0) >= cutoffAlpha) {
        solid[rowStart + sx] = 1
        if (first > sx) first = sx
        last = sx
      }
      alphaIndex += 4
    }
    firstSolid[sy] = first
    lastSolid[sy] = last
  }
  const alphaAt = (sample: number): number => {
    const sx = sample % columns
    const sy = (sample - sx) / columns
    return sx >= 1 && sx <= width && sy >= 1 && sy <= height ? data[((sy - 1) * width + sx - 1) * 4 + 3] ?? 0 : 0
  }

  // A crossing sits on the grid edge between two samples: the edge from sample i to the sample right of it is id i, the one to the
  // sample below it is id count + i. Each cell links the crossing where its outline comes in to the one where it goes out,
  // `next[from] = to`, and edge k of the cell whose top left sample is i has id i + edgeOffset[k].
  const next = new Int32Array(2 * count).fill(-1)
  const starts: number[] = []
  const edgeOffset = [0, count + 1, columns, count]
  const linkCell = (cell: number, topLeft: number): void => {
    const links = CELL_LINKS[cell]
    if (!links) return
    const isJoined = links.apart.length > 2
      && alphaAt(topLeft) + alphaAt(topLeft + 1) + alphaAt(topLeft + columns + 1) + alphaAt(topLeft + columns) >= 4 * cutoffAlpha
    const pairs = isJoined ? links.joined : links.apart
    for (let j = 0; j < pairs.length; j += 2) {
      const from = topLeft + (edgeOffset[pairs[j] ?? 0] ?? 0)
      next[from] = topLeft + (edgeOffset[pairs[j + 1] ?? 0] ?? 0)
      starts.push(from)
    }
  }
  for (let cy = 0; cy < rows - 1; cy++) {
    // Only the cells from the one left of the first solid sample in either row to the one right of the last can cross; the padding
    // keeps both inside the grid.
    const first = Math.min(firstSolid[cy] ?? columns, firstSolid[cy + 1] ?? columns)
    const last = Math.max(lastSolid[cy] ?? -1, lastSolid[cy + 1] ?? -1)
    if (last < first) continue
    const top = cy * columns
    const bottom = top + columns
    // The cells are scanned by their right column; the column left of `first` is clear in both rows.
    let topLeft = 0
    let bottomLeft = 0
    for (let cx = first; cx <= last + 1; cx++) {
      const topRight = solid[top + cx] ?? 0
      const bottomRight = solid[bottom + cx] ?? 0
      const cell = topLeft * 8 + topRight * 4 + bottomRight * 2 + bottomLeft
      if (cell !== 0 && cell !== 15) linkCell(cell, top + cx - 1)
      topLeft = topRight
      bottomLeft = bottomRight
    }
  }

  // Where the alpha crosses the cutoff along a grid edge, with the color of the edge's solid pixel.
  const pointOn = (id: number): OutlinePoint => {
    const isVertical = id >= count
    const a = isVertical ? id - count : id
    const b = isVertical ? a + columns : a + 1
    const alphaA = alphaAt(a)
    const t = (cutoffAlpha - alphaA) / (alphaAt(b) - alphaA)
    const sx = a % columns
    const sy = (a - sx) / columns
    const inner = solid[a] === 1 ? a : b
    const innerX = inner % columns
    const pixel = (((inner - innerX) / columns - 1) * width + innerX - 1) * 4
    return {
      x: Math.min(Math.max(isVertical ? sx - 0.5 : sx - 0.5 + t, 0), width),
      y: Math.min(Math.max(isVertical ? sy - 0.5 + t : sy - 0.5, 0), height),
      r: data[pixel] ?? 0,
      g: data[pixel + 1] ?? 0,
      b: data[pixel + 2] ?? 0,
    }
  }

  const outlines: Outline[] = []
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s] ?? 0
    if ((next[start] ?? -1) < 0) continue // already on a traced outline
    const outline: Outline = []
    let id = start
    for (;;) {
      outline.push(pointOn(id))
      const after = next[id] ?? -1
      next[id] = -1
      if (after < 0 || after === start) break
      id = after
    }
    outlines.push(outline)
  }
  return outlines
}

/**
 * Thins a closed outline (Ramer-Douglas-Peucker): a point is dropped when the straight run between the points kept either side passes
 * within `tolerancePx` of it and its color is within `colorTolerance` of the color blended along that run. Returns an empty outline when
 * fewer than three points would be left (a speck or a hairline, too thin to make a wall).
 */
export const simplifyOutline = (outline: Outline, tolerancePx: number, colorTolerance: number): Outline => {
  const n = outline.length
  if (n < 3) return []
  // x, y, r, g, b per point in one flat array, the first point repeated at the end so the loop closes.
  const values = new Float64Array((n + 1) * 5)
  outline.forEach(({ x, y, r, g, b }, i) => {
    values[i * 5] = x
    values[i * 5 + 1] = y
    values[i * 5 + 2] = r
    values[i * 5 + 3] = g
    values[i * 5 + 4] = b
  })
  values.copyWithin(n * 5, 0, 5)

  // Splits the loop at its first point and the point farthest from it, then simplifies each half as an open run.
  let far = 0
  let farthest = 0
  for (let i = 1; i < n; i++) {
    const dx = (values[i * 5] ?? 0) - (values[0] ?? 0)
    const dy = (values[i * 5 + 1] ?? 0) - (values[1] ?? 0)
    if (dx * dx + dy * dy > farthest) {
      farthest = dx * dx + dy * dy
      far = i
    }
  }
  if (far === 0) return []
  const keep = new Uint8Array(n + 1)
  keep[0] = 1
  keep[far] = 1
  const distanceScale = 1 / (tolerancePx * tolerancePx)
  const colorScale = 1 / (colorTolerance * colorTolerance)
  // Splits each run (start and end index pairs) at its point farthest off while that is beyond the tolerance, looking at every
  // `step`-th point.
  const split = (runs: number[], step: number): void => {
    while (runs.length > 0) {
      const end = (runs.pop() ?? 0) * 5
      const start = (runs.pop() ?? 0) * 5
      const ax = values[start] ?? 0
      const ay = values[start + 1] ?? 0
      const ar = values[start + 2] ?? 0
      const ag = values[start + 3] ?? 0
      const ab = values[start + 4] ?? 0
      const dx = (values[end] ?? 0) - ax
      const dy = (values[end + 1] ?? 0) - ay
      const dr = (values[end + 2] ?? 0) - ar
      const dg = (values[end + 3] ?? 0) - ag
      const db = (values[end + 4] ?? 0) - ab
      const lengthSquared = dx * dx + dy * dy
      let worst = -1
      // How far off a point is, as a multiple of what simplifying may move it, squared: above 1 it stays.
      let worstOff = 1
      for (let p = start + 5 * step; p < end; p += 5 * step) {
        const px = (values[p] ?? 0) - ax
        const py = (values[p + 1] ?? 0) - ay
        const along = lengthSquared > 0 ? (px * dx + py * dy) / lengthSquared : 0
        const t = along < 0 ? 0 : along > 1 ? 1 : along
        const ex = px - t * dx
        const ey = py - t * dy
        const er = (values[p + 2] ?? 0) - ar - t * dr
        const eg = (values[p + 3] ?? 0) - ag - t * dg
        const eb = (values[p + 4] ?? 0) - ab - t * db
        let off = (ex * ex + ey * ey) * distanceScale
        if (er * er * colorScale > off) off = er * er * colorScale
        if (eg * eg * colorScale > off) off = eg * eg * colorScale
        if (eb * eb * colorScale > off) off = eb * eb * colorScale
        if (off > worstOff) {
          worstOff = off
          worst = p / 5
        }
      }
      if (worst < 0) continue
      keep[worst] = 1
      runs.push(start / 5, worst, worst, end / 5)
    }
  }
  // A first pass over every `COARSE_STEP`-th point finds most of the points worth keeping for a fraction of the work, then a pass over
  // every point between those finishes the job, so no dropped point is off by more than the tolerances.
  split([0, far, far, n], COARSE_STEP)
  const between: number[] = []
  let previous = 0
  for (let i = 1; i <= n; i++) {
    if (i < n && keep[i] !== 1) continue
    between.push(previous, i)
    previous = i
  }
  split(between, 1)
  const kept = outline.filter((_, i) => keep[i] === 1)
  return kept.length >= 3 ? kept : []
}

/**
 * One quad per stretch of outline, through the whole thickness. Each outline point becomes two vertices, at z -0.5 and 0.5, in its
 * color. `width` and `height` are the traced image's size, which maps it onto the unit plane.
 */
export const buildWalls = (outlines: Outline[], width: number, height: number): WallMesh => {
  const vertexCount = 2 * outlines.reduce((sum, outline) => sum + outline.length, 0)
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  // Two triangles per stretch, and an outline has as many stretches as points.
  const indices = vertexCount > 65536 ? new Uint32Array(vertexCount * 3) : new Uint16Array(vertexCount * 3)
  let vertex = 0
  let index = 0
  const addVertex = ({ x, y, r, g, b }: OutlinePoint, z: number): void => {
    const offset = vertex * 3
    positions[offset] = x / width - 0.5
    positions[offset + 1] = 0.5 - y / height
    positions[offset + 2] = z
    colors[offset] = r / 255
    colors[offset + 1] = g / 255
    colors[offset + 2] = b / 255
    vertex++
  }
  const addTriangle = (a: number, b: number, c: number): void => {
    indices[index++] = a
    indices[index++] = b
    indices[index++] = c
  }
  outlines.forEach((outline) => {
    const base = vertex
    outline.forEach((point) => {
      addVertex(point, -0.5)
      addVertex(point, 0.5)
    })
    // The solid is on the right of the way the outline runs, so (back k, front k + 1, back k + 1) turns counterclockwise seen from
    // outside it, and so does (back k, front k, front k + 1).
    for (let k = 0; k < outline.length; k++) {
      const back = base + 2 * k
      const nextBack = base + 2 * ((k + 1) % outline.length)
      addTriangle(back, nextBack + 1, nextBack)
      addTriangle(back, back + 1, nextBack + 1)
    }
  })
  return { positions, colors, indices }
}

/** Traces, thins and builds the walls of an RGBA image in one go (see traceOutlines, simplifyOutline and buildWalls). */
export const traceWalls = (data: Uint8ClampedArray, width: number, height: number, cutoffAlpha: number): WallMesh => {
  const outlines = traceOutlines(data, width, height, cutoffAlpha)
    .map((outline) => simplifyOutline(outline, SIMPLIFY_TOLERANCE_PX, SIMPLIFY_COLOR_TOLERANCE))
    .filter((outline) => outline.length > 0)
  return buildWalls(outlines, width, height)
}
