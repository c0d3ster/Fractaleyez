import * as THREE from 'three';

import { HopalongVisualizer } from './hopalong-visualizer.js'
import { CameraManager } from './camera-manager';

//for whatever reason...if this is made a class property it doesnt work
var cameraManager;
var renderer;
var hopalongVisualizer;

export class HopalongManager {
  constructor() {
    this.startTimer = null;
    this.deltaTime = 0;
    this.elapsedTime = 0;
    //this.cameraManager = null;
    //this.hopalongVisualizer = new HopalongVisualizer();
    this.container = null;
  }


  /**
   *
   * @param {Date} startTimer
   */
  init( startTimer )
  {
    console.log("Hopalong Manager Initialized\n------------");
    hopalongVisualizer = new HopalongVisualizer();

    this.container = document.createElement('div');
    document.body.appendChild(this.container);

    cameraManager = new CameraManager();
    cameraManager.init(1500);

    hopalongVisualizer.init(this.cameraManager);


    this.startTimer = startTimer;

    //pass the visualizer the camera manager so the camera can get the SCALE_FACTOR

    this.clock = new THREE.Clock();

    // Setup renderer and effects
    renderer = new THREE.WebGLRenderer({
      clearColor: 0x000000,
      clearAlpha: 1,
      antialias: false,
      gammeInput: true,
      gammaOutput: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Setup listeners
    document.addEventListener('mousemove', this.onDocumentMouseMove, false);
    document.addEventListener('keydown', this.onKeyDown, false);
    window.addEventListener('resize', this.onWindowResize, false);
  }


  /**
   *
   * @param {number} deltaTime
   * @param {AudioAnalysedDataForVisualization} audioData
   */
  update( deltaTime, audioData )
  {
      cameraManager.manageCameraPosition();

      this.deltaTime = deltaTime;
      this.elapsedTime += deltaTime;

      hopalongVisualizer.update( deltaTime, audioData, renderer, cameraManager );
  }

  ///////////////////////////////////////////////
  // Event listeners
  ///////////////////////////////////////////////
  onDocumentMouseMove(event) {
    cameraManager.updateMousePosition(event);
  }

  onWindowResize(event) {
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize(window.innerWidth, window.innerHeight);
    cameraManager.onResize();
  }

  onKeyDown(event) {
    if (event.keyCode == 38 && hopalongVisualizer.getSpeed() < 20) hopalongVisualizer.updateSpeed(0.5);
    else if (event.keyCode == 40 && hopalongVisualizer.getSpeed() > 0) hopalongVisualizer.updateSpeed(-0.5);
    else if (event.keyCode == 37) hopalongVisualizer.updateRotationSpeed(0.001);
    else if (event.keyCode == 39) hopalongVisualizer.updateRotationSpeed(-0.001);
    else if (event.keyCode == 72 || event.keyCode == 104) toggleVisuals();
  }
};
