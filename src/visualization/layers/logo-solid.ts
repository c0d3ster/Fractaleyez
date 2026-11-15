import * as THREE from 'three'

// The faces sit at unit z -0.5 and 0.5 (the logo group's scale sets the size and, on z, the thickness); the walls run between them.
const FACE_DEPTHS = [-0.5, 0.5]

export type LogoSolidOptions = {
  /** How far each cap sits inside its face, in unit z, so a face never fights its own cap for depth. */
  capInset: number
  /** The alpha (0 to 1) where the caps are cut, the same cutoff the walls are traced at. */
  alphaCutoff: number
}

/** What a solid shows this frame. */
export type LogoSolidState = {
  /** Off: only the front face draws, flat. */
  is3D: boolean
  hasWalls: boolean
  /** The whole solid's opacity, 0 to 1. At 0 it is not drawn. */
  opacity: number
  /** The faces' own fade as they turn edge-on, on top of `opacity`. */
  faceOpacity: number
}

const addMesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, z: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.z = z
  parent.add(mesh)
  return mesh
}

const assignMap = (materials: THREE.MeshBasicMaterial[], map: THREE.Texture | null): void => {
  materials.forEach((material) => {
    material.map = map
    material.needsUpdate = true
  })
}

// Depth only, pushed a hair back so the blended pass over the same surface always passes the depth test.
const createDepthMaterial = (parameters: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ ...parameters, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })

/**
 * One thick logo: two image faces, a cap just inside each (the shape cut out at the alpha cutoff, in the edge colors) and the traced
 * walls between them. The plain logo is one, and every copy in the zoom chain is another, all sharing the plane, the wall geometry and
 * the textures.
 *
 * It fades as a whole. Depth-only copies of the caps and walls draw first (opaque, so three draws them before anything blended), then
 * the caps, walls and faces draw blended at the solid's opacity, each only where it is the nearest surface. So a fading solid shows its
 * near side see-through over what is behind it, never its own far side or inside. The layer draws each solid in its own pass with the
 * depth cleared in between, so solids never hide each other: a zoom copy draws over the one it sits in.
 */
export class LogoSolid {
  readonly group = new THREE.Group()
  /** The faces' materials, for the layer's bicubic lookup. */
  readonly faces: THREE.MeshBasicMaterial[]
  /** Every material the glow brightens. */
  readonly tinted: THREE.MeshBasicMaterial[]
  private readonly caps: THREE.MeshBasicMaterial[]
  private readonly capDepths: THREE.MeshBasicMaterial[]
  private readonly wallMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
  private readonly wallDepth = createDepthMaterial({})
  private readonly faceMeshes: THREE.Mesh[]
  private readonly sideMeshes: THREE.Mesh[]
  private readonly wallMeshes: THREE.Mesh[]
  private opacity = 0

  constructor(plane: THREE.PlaneGeometry, walls: THREE.BufferGeometry, { capInset, alphaCutoff }: LogoSolidOptions) {
    // Back then front: blended without depth writes, so their soft edges blend over what is behind.
    this.faces = FACE_DEPTHS.map(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }))
    this.faceMeshes = this.faces.map((material, i) => addMesh(this.group, plane, material, FACE_DEPTHS[i] ?? 0))
    const capDepths = FACE_DEPTHS.map((z) => z - Math.sign(z) * capInset)
    this.caps = capDepths.map(() =>
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: alphaCutoff, side: THREE.DoubleSide }))
    this.capDepths = capDepths.map(() => createDepthMaterial({ alphaTest: alphaCutoff, side: THREE.DoubleSide }))
    const capMeshes = [...this.caps, ...this.capDepths].map((material, i) => addMesh(this.group, plane, material, capDepths[i % 2] ?? 0))
    // Single-sided: every wall faces out of the solid, so only the near side draws (and writes depth).
    this.wallMeshes = [this.wallDepth, this.wallMaterial].map((material) => addMesh(this.group, walls, material, 0))
    this.sideMeshes = [...capMeshes, ...this.wallMeshes]
    this.tinted = [...this.faces, ...this.caps, this.wallMaterial]
  }

  /** Whether the solid draws this frame. */
  get isShown(): boolean {
    return this.opacity > 0
  }

  /** The image on the faces, and the caps' copy of it (no mipmaps, inside recolored to the edges, solid part fully opaque). */
  setMaps = (face: THREE.Texture | null, cap: THREE.Texture | null): void => {
    assignMap(this.faces, face)
    assignMap([...this.caps, ...this.capDepths], cap)
  }

  /** The traced walls (shared by every solid; the layer owns and disposes it). */
  setWalls = (walls: THREE.BufferGeometry): void => {
    this.wallMeshes.forEach((mesh) => { mesh.geometry = walls })
  }

  update = ({ is3D, hasWalls, opacity, faceOpacity }: LogoSolidState): void => {
    this.opacity = opacity
    this.faceMeshes.forEach((mesh, i) => { mesh.visible = is3D || i === this.faceMeshes.length - 1 })
    this.sideMeshes.forEach((mesh) => { mesh.visible = is3D })
    this.wallMeshes.forEach((mesh) => { mesh.visible = is3D && hasWalls })
    this.faces.forEach((material) => { material.opacity = faceOpacity * opacity })
    this.caps.forEach((material) => { material.opacity = opacity })
    this.wallMaterial.opacity = opacity
  }

  dispose = (): void => {
    [...this.faces, ...this.caps, ...this.capDepths, this.wallMaterial, this.wallDepth].forEach((material) => material.dispose())
  }
}
