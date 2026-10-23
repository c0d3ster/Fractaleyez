import * as THREE from 'three'

import { userConfig } from '../config/user.config'

// Half-life of the camera's chase toward the pointer; matches the Julia visualizer's steering ease.
const CAMERA_EASE_HALF_LIFE_SECONDS = 0.7

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** 1 when the Orbit camera moves toward the pad (Reverse Lean), -1 when it moves away from it. */
export const cameraFollowSign = (): 1 | -1 => (window.config.user.reverseLean.value ? 1 : -1)

export class CameraManager {
  camera: THREE.PerspectiveCamera | null
  cameraBound: number
  mouseX: number
  mouseY: number
  deltaTime: number
  elapsedTime: number
  focusPoint: THREE.Vector3

  constructor() {
    this.camera = null
    this.cameraBound = 100
    this.mouseX = 0
    this.mouseY = 0
    this.deltaTime = 0
    this.elapsedTime = 0
    this.focusPoint = new THREE.Vector3(0, 0, -5)
  }

  init(): void {
    // Match original startup: camera z from config scale at load (preset/default).
    // Do not update z when the scale slider moves — that dolly-zooms the video background.
    const cameraZ = window.config.user.scaleFactor.value / 3
    const far = CameraManager.farForScale(window.config.user.scaleFactor.value)
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, far)
    this.camera.position.z = cameraZ
    this.cameraBound = window.config.user.cameraBound.value
  }

  private static farForScale(scaleFactor: number): number {
    return Math.max(3 * scaleFactor, 3 * userConfig.scaleFactor_DEFAULT)
  }

  getMouseX(): number {
    return this.mouseX
  }

  getMouseY(): number {
    return this.mouseY
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera!
  }

  manageCameraPosition(deltaTimeMs: number): void {
    this.camera!.lookAt(this.focusPoint)
    const ease = 1 - Math.pow(0.5, deltaTimeMs / 1000 / CAMERA_EASE_HALF_LIFE_SECONDS)

    // Off, the camera moves opposite the pointer, so with the pointer (or the pad) at the top left the particles come in
    // from the bottom right, like the other effects that lean toward it. On (Reverse Lean), it moves toward the pointer.
    // The bound is read fresh every frame: a camera outside a smaller Sway is pulled in to its edge, and a larger Sway
    // just lets the same chase carry the camera further out from where it is, with no reset.
    this.cameraBound = window.config.user.cameraBound.value
    const follow = cameraFollowSign()
    const { position } = this.camera!
    position.x = clamp(position.x + (follow * this.mouseX - position.x) * ease, -this.cameraBound, this.cameraBound)
    position.y = clamp(position.y + (-follow * this.mouseY - position.y) * ease, -this.cameraBound, this.cameraBound)

    const nextFar = CameraManager.farForScale(window.config.user.scaleFactor.value)
    if (this.camera!.far !== nextFar) {
      this.camera!.far = nextFar
      this.camera!.updateProjectionMatrix()
    }
  }

  updateMousePosition(event: MouseEvent): void {
    this.mouseX = event.clientX - (window.innerWidth / 2)
    this.mouseY = event.clientY - (window.innerHeight / 2)
  }

  setVirtualMousePosition(x: number, y: number): void {
    this.mouseX = x
    this.mouseY = y
  }

  onResize(): void {
    this.camera!.aspect = window.innerWidth / window.innerHeight
    this.camera!.updateProjectionMatrix()
  }
}
