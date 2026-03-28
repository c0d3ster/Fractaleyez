import * as THREE from 'three'

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
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3 * window.config.user.scaleFactor.value)
    this.camera.position.z = window.config.user.scaleFactor.value / 3
    this.cameraBound = window.config.user.cameraBound.value
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

  manageCameraPosition(): void {
    this.camera!.lookAt(this.focusPoint)

    if (this.camera!.position.x >= -this.cameraBound && this.camera!.position.x <= this.cameraBound) {
      this.camera!.position.x += (this.mouseX - this.camera!.position.x) * 0.05
      if (this.camera!.position.x < -this.cameraBound) this.camera!.position.x = -this.cameraBound
      if (this.camera!.position.x > this.cameraBound) this.camera!.position.x = this.cameraBound
    }
    if (this.camera!.position.y >= -this.cameraBound && this.camera!.position.y <= this.cameraBound) {
      this.camera!.position.y += (-this.mouseY - this.camera!.position.y) * 0.05
      if (this.camera!.position.y < -this.cameraBound) this.camera!.position.y = -this.cameraBound
      if (this.camera!.position.y > this.cameraBound) this.camera!.position.y = this.cameraBound
    }

    if (this.cameraBound !== window.config.user.cameraBound.value) {
      this.camera!.position.y = 0
      this.camera!.position.x = 0
      this.cameraBound = window.config.user.cameraBound.value
    }
  }

  updateMousePosition(event: MouseEvent): void {
    this.mouseX = event.clientX - (window.innerWidth / 2)
    this.mouseY = event.clientY - (window.innerHeight / 2)
  }

  onResize(): void {
    this.camera!.aspect = window.innerWidth / window.innerHeight
    this.camera!.updateProjectionMatrix()
  }
}
