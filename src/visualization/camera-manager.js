import * as THREE from 'three';

const CAMERA_BOUND = 200;

export class CameraManager {

    constructor() {
      this.camera = null;
      this.mouseX = 0;
      this.mouseY = 0;

    }

    init(scaleFactor) {
      this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3 * scaleFactor);
      this.camera.position.z = scaleFactor / 2;
      this.cameraBound = CAMERA_BOUND;
    }

    getCamera() {
      return this.camera;
    }

    //To be called in the render method
    manageCameraPosition() {
        if (this.camera.position.x >= -CAMERA_BOUND && this.camera.position.x <= CAMERA_BOUND) {
          this.camera.position.x += (this.mouseX - this.camera.position.x) * 0.05;
          if (this.camera.position.x < -CAMERA_BOUND) this.camera.position.x = -CAMERA_BOUND;
          if (this.camera.position.x > CAMERA_BOUND) this.camera.position.x = CAMERA_BOUND;
        }
        if (this.camera.position.y >= -CAMERA_BOUND && this.camera.position.y <= CAMERA_BOUND) {
          this.camera.position.y += (-this.mouseY - this.camera.position.y) * 0.05;
          if (this.camera.position.y < -CAMERA_BOUND) this.camera.position.y = -CAMERA_BOUND;
          if (this.camera.position.y > CAMERA_BOUND) this.camera.position.y = CAMERA_BOUND;
        }
    }

    //for moving the camera around
    updateMousePosition(event) {
        this.mouseX = event.clientX - (window.innerWidth / 2);
        this.mouseY = event.clientY - (window.innerHeight / 2);
    }

    onRezize(screenSize) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
}
