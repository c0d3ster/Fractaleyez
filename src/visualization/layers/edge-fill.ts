/**
 * The logo's extruded sides are a stack of cut-out copies of the image, and seen at an angle the gaps between them showed each copy's
 * inside (an eye's inner rings) as if the logo were see-through. This recolors a copy for the sides: every solid pixel (alpha at least
 * `cutoffAlpha`, 0 to 255) takes the color of the nearest edge pixel of the shape, a solid pixel next to a see-through one or on the
 * image's border. The alpha is kept, so the outline and any holes are cut exactly as before, and the side reads as a wall in the color
 * of the edge it belongs to. `data` is RGBA, row by row; a new array is returned. Distance is counted in steps between neighbors.
 */
export const fillFromEdges = (data: Uint8ClampedArray, width: number, height: number, cutoffAlpha: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(data)
  const count = width * height
  const solid = (i: number): boolean => (data[i * 4 + 3] ?? 0) >= cutoffAlpha
  // The edge pixel each solid pixel takes its color from (-1: not reached yet).
  const sourceOf = new Int32Array(count).fill(-1)
  const queue = new Int32Array(count)
  let tail = 0

  const neighbors = (i: number): number[] => {
    const x = i % width
    const y = (i - x) / width
    const around: number[] = []
    if (x > 0) around.push(i - 1)
    if (x < width - 1) around.push(i + 1)
    if (y > 0) around.push(i - width)
    if (y < height - 1) around.push(i + width)
    return around
  }

  const isEdge = (i: number): boolean => {
    const x = i % width
    const y = (i - x) / width
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true
    return neighbors(i).some((j) => !solid(j))
  }

  for (let i = 0; i < count; i++) {
    if (!solid(i) || !isEdge(i)) continue
    sourceOf[i] = i
    queue[tail++] = i
  }

  // Spreads each edge color inward, nearest first.
  for (let head = 0; head < tail; head++) {
    const i = queue[head] ?? 0
    const source = sourceOf[i] ?? i
    neighbors(i).forEach((j) => {
      if (!solid(j) || (sourceOf[j] ?? 0) >= 0) return
      sourceOf[j] = source
      queue[tail++] = j
    })
  }

  for (let i = 0; i < count; i++) {
    const source = sourceOf[i] ?? -1
    if (source < 0 || source === i) continue
    out[i * 4] = data[source * 4] ?? 0
    out[i * 4 + 1] = data[source * 4 + 1] ?? 0
    out[i * 4 + 2] = data[source * 4 + 2] ?? 0
  }
  return out
}
