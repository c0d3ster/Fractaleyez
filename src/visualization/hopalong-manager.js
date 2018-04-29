import * as THREE from 'three';

import { HopalongVisualizer } from './hopalong-visualizer.js'
import { CameraManager } from './camera-manager';
import { EffectComposer, Bloom, ShockWavePass,  RenderPass, BloomPass } from 'postprocessing';
import config from '../config/visualizer.config.js';


//let fakeCamera = new THREE.PerspectiveCamera( 60, window.innerWidth/window.innerHeight );
//fakeCamera.position.z = 5;
/**
 * The Hopalong Manager class is responsible for creating the camera and visualization for Barry's Hopalong Orbits
 *
 */
export class HopalongManager {
  constructor() {
    this.$container = null;
    this.startTimer = null;
    this.deltaTime = 0;
    this.elapsedTime = 0;
    this.cameraManager = null;
    this.hopalongVisualizer = null;
    this.renderer = null;
    this.composer = null;
  }


  /**
   *
   * @param {Date} startTimer
   */
  init( startTimer )
  {
    console.log("Hopalong Manager Initialized\n------------");
    this.hopalongVisualizer = new HopalongVisualizer();

    this.$container = $('<div></div>');
    $( document.body ).append(this.$container);

    this.cameraManager = new CameraManager();
    this.cameraManager.init(1500);

    //pass the visualizer the camera manager so the camera can get the SCALE_FACTOR
    this.hopalongVisualizer.init(this.cameraManager);

    this.startTimer = startTimer;
    this.clock = new THREE.Clock();

    // Setup renderer and effects
    this.renderer = new THREE.WebGLRenderer({
      clearColor: 0x000000,
      clearAlpha: 1,
      antialias: false,
      gammeInput: true,
      gammaOutput: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    $( document.body ).append(this.renderer.domElement);

    // Setup Effects
    this.setupEffects();
    // Setup listeners
    $( document ).mousemove(this.onDocumentMouseMove);
    $( document ).keydown(this.onKeyDown);
    $( window ).resize(this.onWindowResize);
  }

  //SetUp effects
 setupEffects() {
   //setup the composer that renders the effects
   this.composer = new EffectComposer( this.renderer );
   this.composer.addPass( new RenderPass( this.hopalongVisualizer.getScene(), this.cameraManager.getCamera() ) );
   this.bloomPass = new BloomPass();
   this.bloomPass.kernelSize = 0;
   this.composer.addPass( this.bloomPass );

   let fakeCamera = new THREE.PerspectiveCamera( 60, window.innerWidth/window.innerHeight );
   fakeCamera.position.z = 7;

   this.shockwavePass = new ShockWavePass( fakeCamera );
   this.shockwavePass.renderToScreen = true;
   this.shockwavePass.size = 2;//audioData.peak.value * 2;
   this.shockwavePass.extent = 10;//audioData.peak.value * 100;
   this.shockwavePass.waveSize = 10;//(audioData.peak.value / 1) * 2;
   this.shockwavePass.amplitude = 1;
   this.composer.addPass( this.shockwavePass );

   this.clock = new THREE.Clock();
 }

  /**
   *
   * @param {number} deltaTime
   * @param {AudioAnalysedDataForVisualization} audioData
   */
  update( deltaTime, audioData )
  {
      this.deltaTime = deltaTime;
      this.elapsedTime += deltaTime;

      this.shockwavePass.speed = .3;//(hopalongVisualizer.getSpeed() / 80) + audioData.peak.value + .25;
      this.shockwavePass.size = 2;//audioData.peak.value * 2;
      this.shockwavePass.extent = 10;//audioData.peak.value * 100;
      this.shockwavePass.waveSize = 10;//(audioData.peak.value / 1) * 2;
      this.shockwavePass.amplitude = .25;

      this.hopalongVisualizer.update( deltaTime, audioData, this.renderer, this.cameraManager );

      this.bloomPass.intensity = audioData.peak.value * audioData.peak.energy;
      if ( audioData.peak.value > 0.8 ) {
        this.shockwavePass.explode();
      }
      this.composer.render( this.clock.getDelta() );

      this.cameraManager.manageCameraPosition();
  }

  ///////////////////////////////////////////////
  // Event listeners
  ///////////////////////////////////////////////
  onDocumentMouseMove = (event) => {
    this.cameraManager.updateMousePosition(event);
  }

  onWindowResize = (event) => {
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameraManager.onResize();
  }

  onKeyDown = (event) => {
    if (event.keyCode == 38 && config.speed < config.maxSpeed) {
        config.speed += 0.5;
    }
    else if (event.keyCode == 40 && config.speed > config.minSpeed) {
      config.speed -= 0.5;
    }
    else if (event.keyCode == 37) this.hopalongVisualizer.updateRotationSpeed(0.001);
    else if (event.keyCode == 39) this.hopalongVisualizer.updateRotationSpeed(-0.001);
    else if (event.keyCode == 72 || event.keyCode == 104) toggleVisuals();
  }
};
