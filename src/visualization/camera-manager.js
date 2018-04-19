import * as THREE from 'three';

const CAMERA_BOUND = 200;

export class CameraManager {

    constructor() {
      this.camera = null;
      this.mouseX = 0;
      this.mouseY = 0;
      this.deltaTime = 0;
      this.elapsedTime = 0;
      this.focusPoint = new THREE.Vector3(0,0,0);
    }

    init(scaleFactor) {
      console.log("Camera Manager Initialized\n------------");
      this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3 * scaleFactor);
      this.camera.position.z = scaleFactor / 2;
      this.cameraBound = CAMERA_BOUND;
      this.camera.rotation.y = 3.14;
    }

    getCamera() {
      return this.camera;
    }

    //To be called in the render method
    manageCameraPosition() {
        this.camera.lookAt(this.focusPoint);

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

        console.log('mouseX = ' + this.mouseX);
        console.log('mouseY= ' + this.mouseY);
    }

    onResize() {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
}
