import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { buildWalls, type Outline, simplifyOutline, traceOutlines, traceWalls, type WallMesh } from './logo-walls'

type Rgba = [number, number, number, number]
type Image = { data: Uint8ClampedArray; width: number; height: number }

const CUTOFF = 127.5
const CLEAR: Rgba = [0, 0, 0, 0]
const GRAY: Rgba = [128, 128, 128, 255]
const RED: Rgba = [255, 0, 0, 255]
const BLUE: Rgba = [0, 0, 255, 255]

/** An image from the color at each pixel's center. */
const makeImage = (width: number, height: number, pixel: (x: number, y: number) => Rgba): Image => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x + 0.5, y + 0.5), (y * width + x) * 4)
  }
  return { data, width, height }
}

const square = (size: number, from: number, to: number, color: Rgba = GRAY): Image =>
  makeImage(size, size, (x, y) => (x > from && x < to && y > from && y < to ? color : CLEAR))

/** A gray ring between radius `inner` and `outer` around the image's middle. */
const ring = (size: number, inner: number, outer: number): Image => makeImage(size, size, (x, y) => {
  const distance = Math.hypot(x - size / 2, y - size / 2)
  return distance > inner && distance < outer ? GRAY : CLEAR
})

/** Twice the area inside an outline, positive when it runs clockwise as the image is seen (x right, y down). */
const signedArea = (outline: Outline): number => outline.reduce((sum, point, i) => {
  const after = outline[(i + 1) % outline.length] ?? point
  return sum + point.x * after.y - after.x * point.y
}, 0) / 2

/** The alpha a GPU's bilinear lookup gives at a spot of the image (in pixels, y down), clamped to the edge. */
const bilinearAlpha = ({ data, width, height }: Image, x: number, y: number): number => {
  const fx = Math.min(Math.max(x - 0.5, 0), width - 1)
  const fy = Math.min(Math.max(y - 0.5, 0), height - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, width - 1)
  const y1 = Math.min(y0 + 1, height - 1)
  const tx = fx - x0
  const ty = fy - y0
  const at = (px: number, py: number): number => data[(py * width + px) * 4 + 3] ?? 0
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty
}

const isSolidAt = ({ data, width, height }: Image, x: number, y: number): boolean => {
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return false
  return (data[(py * width + px) * 4 + 3] ?? 0) >= CUTOFF
}

/** The distance from a point to the closed polygon through `outline`. */
const distanceToOutline = (outline: Outline, x: number, y: number): number => outline.reduce((nearest, a, i) => {
  const b = outline[(i + 1) % outline.length] ?? a
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared > 0 ? Math.min(Math.max(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0), 1) : 0
  return Math.min(nearest, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
}, Infinity)

const vertexAt = ({ positions }: WallMesh, i: number): THREE.Vector3 =>
  new THREE.Vector3(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0)

/** Where a point of the logo plane (unit space, y up) falls on the image, in pixels with y down. */
const planeToImage = ({ width, height }: Image, x: number, y: number): [number, number] => [(x + 0.5) * width, (0.5 - y) * height]

describe('traceOutlines', () => {
  it('traces one outline around a filled square, on its border', () => {
    const image = square(20, 5, 15)
    const outlines = traceOutlines(image.data, image.width, image.height, CUTOFF)
    expect(outlines).toHaveLength(1)
    outlines[0]?.forEach(({ x, y }) => {
      // Half way between the last solid pixel center and the first clear one, so on the square's border.
      expect(Math.min(Math.abs(x - 5), Math.abs(x - 15), Math.abs(y - 5), Math.abs(y - 15))).toBeCloseTo(0, 6)
    })
  })

  it('traces a ring as two outlines, the outside clockwise and the hole counterclockwise', () => {
    const image = ring(64, 12, 24)
    const outlines = traceOutlines(image.data, image.width, image.height, CUTOFF)
    expect(outlines).toHaveLength(2)
    const areas = outlines.map(signedArea).sort((a, b) => a - b)
    expect(areas[0]).toBeLessThan(0)
    expect(Math.abs(areas[0] ?? 0)).toBeGreaterThan(Math.PI * 11 * 11)
    expect(Math.abs(areas[0] ?? 0)).toBeLessThan(Math.PI * 13 * 13)
    expect(areas[1]).toBeGreaterThan(Math.PI * 23 * 23)
    expect(areas[1]).toBeLessThan(Math.PI * 25 * 25)
  })

  it('closes a shape that touches the image border along the border', () => {
    const image = makeImage(8, 6, () => GRAY)
    const outlines = traceOutlines(image.data, image.width, image.height, CUTOFF)
    expect(outlines).toHaveLength(1)
    outlines[0]?.forEach(({ x, y }) => {
      expect(x === 0 || x === 8 || y === 0 || y === 6).toBe(true)
    })
  })

  it('lies where the image\'s bilinear alpha crosses the cutoff, so it meets the edge a face draws', () => {
    // A disc with a soft edge three pixels wide.
    const image = makeImage(48, 40, (x, y) => {
      const coverage = Math.min(Math.max((15 - Math.hypot(x - 24, y - 20)) / 3 + 0.5, 0), 1)
      return [255, 255, 255, Math.round(coverage * 255)]
    })
    const outlines = traceOutlines(image.data, image.width, image.height, CUTOFF)
    expect(outlines).toHaveLength(1)
    outlines[0]?.forEach(({ x, y }) => expect(bilinearAlpha(image, x, y)).toBeCloseTo(CUTOFF, 6))
  })

  it('joins two corner-to-corner pixels through the cell between them only when its average is solid', () => {
    const image = makeImage(2, 2, (x, y) => (Math.floor(x) === Math.floor(y) ? [0, 0, 0, 200] : [0, 0, 0, 60]))
    // The middle averages 130.
    expect(traceOutlines(image.data, image.width, image.height, 128)).toHaveLength(1)
    expect(traceOutlines(image.data, image.width, image.height, 140)).toHaveLength(2)
  })

  it('gives each point the color of the solid pixel it borders', () => {
    // A red square with a blue rim one pixel wide.
    const image = makeImage(12, 12, (x, y) => {
      if (x < 2 || x > 10 || y < 2 || y > 10) return CLEAR
      return x < 3 || x > 9 || y < 3 || y > 9 ? BLUE : RED
    })
    const [outline = []] = traceOutlines(image.data, image.width, image.height, CUTOFF)
    expect(outline.length).toBeGreaterThan(0)
    outline.forEach(({ r, g, b }) => expect([r, g, b]).toEqual([0, 0, 255]))
  })
})

describe('simplifyOutline', () => {
  it('cuts a square down to its corners', () => {
    const image = square(60, 10, 50)
    const [traced = []] = traceOutlines(image.data, image.width, image.height, CUTOFF)
    const simplified = simplifyOutline(traced, 0.5, 24)
    expect(traced.length).toBeGreaterThan(150)
    // Four corners, each cut by half a pixel where the outline crosses the corner pixel diagonally.
    expect(simplified.length).toBeGreaterThanOrEqual(4)
    expect(simplified.length).toBeLessThanOrEqual(8)
    traced.forEach(({ x, y }) => expect(distanceToOutline(simplified, x, y)).toBeLessThanOrEqual(0.5 + 1e-9))
  })

  it('keeps a circle within the tolerance with far fewer points', () => {
    const image = makeImage(256, 256, (x, y) => (Math.hypot(x - 128, y - 128) < 100 ? GRAY : CLEAR))
    const [traced = []] = traceOutlines(image.data, image.width, image.height, CUTOFF)
    const simplified = simplifyOutline(traced, 0.5, 24)
    expect(simplified.length).toBeLessThan(traced.length / 4)
    traced.forEach(({ x, y }) => expect(distanceToOutline(simplified, x, y)).toBeLessThanOrEqual(0.5 + 1e-9))
  })

  it('keeps the points where the color changes along a straight edge', () => {
    // Red on the left half, blue on the right: the top and bottom edges change color in the middle.
    const image = makeImage(60, 60, (x, y) => {
      if (x < 10 || x > 50 || y < 10 || y > 50) return CLEAR
      return x < 30 ? RED : BLUE
    })
    const [traced = []] = traceOutlines(image.data, image.width, image.height, CUTOFF)
    const simplified = simplifyOutline(traced, 0.5, 24)
    const top = simplified.filter(({ y }) => y === 10)
    expect(top.some(({ r, b, x }) => r === 255 && b === 0 && x > 25)).toBe(true)
    expect(top.some(({ r, b, x }) => r === 0 && b === 255 && x < 35)).toBe(true)
  })

  it('drops a speck too small to make a wall', () => {
    const image = makeImage(5, 5, (x, y) => (Math.floor(x) === 2 && Math.floor(y) === 2 ? GRAY : CLEAR))
    const [traced = []] = traceOutlines(image.data, image.width, image.height, CUTOFF)
    expect(traced).toHaveLength(4)
    expect(simplifyOutline(traced, 0.5, 24)).toEqual([])
  })
})

describe('buildWalls', () => {
  it('makes two vertices per outline point and two triangles per stretch, from z -0.5 to 0.5 inside the unit plane', () => {
    const image = square(20, 5, 15)
    const outlines = traceOutlines(image.data, image.width, image.height, CUTOFF).map((outline) => simplifyOutline(outline, 0.5, 24))
    const points = outlines.reduce((sum, outline) => sum + outline.length, 0)
    const walls = buildWalls(outlines, image.width, image.height)
    expect(walls.positions.length).toBe(points * 2 * 3)
    expect(walls.colors.length).toBe(points * 2 * 3)
    expect(walls.indices.length).toBe(points * 6)
    const vertices = Array.from({ length: points * 2 }, (_, i) => vertexAt(walls, i))
    expect(new Set(vertices.map(({ z }) => z))).toEqual(new Set([-0.5, 0.5]))
    vertices.forEach(({ x, y }) => {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.5)
    })
    Array.from(walls.colors).forEach((channel) => expect(channel).toBeCloseTo(128 / 255, 6))
  })

  it('maps the outline onto the logo plane the way a plane with a flipped texture shows the image', () => {
    // A plane's texture coordinates run from its bottom left; with flipY the image's top row is at v = 1.
    const plane = new THREE.PlaneGeometry(1, 1)
    const position = plane.getAttribute('position')
    const uv = plane.getAttribute('uv')
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(position.getX(i) + 0.5, 6)
      expect(uv.getY(i)).toBeCloseTo(position.getY(i) + 0.5, 6)
    }
    const image = makeImage(40, 30, (x, y) => {
      const coverage = Math.min(Math.max((10 - Math.hypot(x - 14, y - 12)) / 2 + 0.5, 0), 1)
      return [255, 255, 255, Math.round(coverage * 255)]
    })
    const walls = buildWalls(traceOutlines(image.data, image.width, image.height, CUTOFF), image.width, image.height)
    for (let i = 0; i < walls.positions.length / 3; i++) {
      const { x, y } = vertexAt(walls, i)
      const u = x + 0.5
      const v = y + 0.5
      // Within what storing the positions as 32-bit floats moves them.
      expect(bilinearAlpha(image, u * image.width, (1 - v) * image.height)).toBeCloseTo(CUTOFF, 2)
    }
  })

  it('winds every wall to face out of the solid, the walls of a hole included', () => {
    const image = ring(96, 18, 40)
    const walls = traceWalls(image.data, image.width, image.height, CUTOFF)
    expect(walls.indices.length).toBeGreaterThan(0)
    let facingHole = 0
    for (let i = 0; i < walls.indices.length; i += 3) {
      const a = vertexAt(walls, walls.indices[i] ?? 0)
      const b = vertexAt(walls, walls.indices[i + 1] ?? 0)
      const c = vertexAt(walls, walls.indices[i + 2] ?? 0)
      // The front of a triangle is the side it turns counterclockwise on, as three.js draws it.
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
      expect(normal.z).toBeCloseTo(0, 6)
      const middle = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3)
      const step = 2 / image.width
      expect(isSolidAt(image, ...planeToImage(image, middle.x + normal.x * step, middle.y + normal.y * step))).toBe(false)
      expect(isSolidAt(image, ...planeToImage(image, middle.x - normal.x * step, middle.y - normal.y * step))).toBe(true)
      if (Math.hypot(middle.x, middle.y) < 0.3) facingHole++
    }
    expect(facingHole).toBeGreaterThan(0)
  })

  it('colors the walls of an eye by the edge each stands on: the ring\'s gray, the middle disc\'s blue rim', () => {
    const image = makeImage(80, 80, (x, y) => {
      const distance = Math.hypot(x - 40, y - 40)
      if (distance > 28 && distance < 36) return GRAY
      if (distance < 16) return distance > 13 ? BLUE : RED
      return CLEAR
    })
    const walls = traceWalls(image.data, image.width, image.height, CUTOFF)
    for (let i = 0; i < walls.positions.length / 3; i++) {
      const { x, y } = vertexAt(walls, i)
      const color = Array.from(walls.colors.slice(i * 3, i * 3 + 3))
      const isDisc = Math.hypot(x, y) * 80 < 20
      expect(color).toEqual(isDisc ? [0, 0, 1] : [128 / 255, 128 / 255, 128 / 255].map(Math.fround))
    }
  })
})
