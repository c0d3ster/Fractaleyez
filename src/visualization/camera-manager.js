import * as THREE from 'three';

/*
 *
 */
export default class CameraManager {

    constructor() {
      this.camera = null;
      this.cameraBound = 100;
      this.scaleFactor = 1500;
      this.mouseX = 0;
      this.mouseY = 0;
      this.deltaTime = 0;
      this.elapsedTime = 0;
      this.focusPoint = new THREE.Vector3(0,0,0);
    }

    init(scaleFactor, cameraBound) {
      console.log("Camera Manager Initialized\n------------");
      this.scaleFactor = scaleFactor;
      this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3 *  scaleFactor);
      this.camera.position.z = scaleFactor / 2;
      this.cameraBound =  cameraBound;
      this.camera.rotation.y = 3.14;
    }

    getMouseX() {
      return this.mouseX;
    }

    getMouseY() {
      return this.mouseY;
    }
    getCamera() {
      return this.camera;
    }

    //To be called in the render method
    manageCameraPosition() {
        this.camera.lookAt(this.focusPoint);

        if (this.camera.position.x >= - this.cameraBound && this.camera.position.x <=  this.cameraBound) {
          this.camera.position.x += (this.mouseX - this.camera.position.x) * 0.05;
          if (this.camera.position.x < - this.cameraBound) this.camera.position.x = - this.cameraBound;
          if (this.camera.position.x >  this.cameraBound) this.camera.position.x =  this.cameraBound;
        }
        if (this.camera.position.y >= - this.cameraBound && this.camera.position.y <=  this.cameraBound) {
          this.camera.position.y += (-this.mouseY - this.camera.position.y) * 0.05;
          if (this.camera.position.y < - this.cameraBound) this.camera.position.y = - this.cameraBound;
          if (this.camera.position.y >  this.cameraBound) this.camera.position.y =  this.cameraBound;
        }
    }

    //for moving the camera around
    updateMousePosition(event) {
        this.mouseX = event.clientX - (window.innerWidth / 2);
        this.mouseY = event.clientY - (window.innerHeight / 2);
    }

    onResize() {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
}
