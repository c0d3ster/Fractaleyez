import * as THREE from 'three';
import { EffectComposer, ShockWaveEffect, RenderPass, BloomEffect, EffectPass } from 'postprocessing';

import HopalongVisualizer from './hopalong-visualizer.js'
import CameraManager from './camera-manager';

/**
 * The Hopalong Manager class is responsible for creating the camera and visualization
 * for Barry's Hopalong Orbits
 */
export default class HopalongManager {
  constructor() {
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
    this.cameraManager = new CameraManager();
    this.cameraManager.init();

    this.hopalongVisualizer = new HopalongVisualizer();
    this.hopalongVisualizer.init();

    this.startTimer = startTimer;
    this.clock = new THREE.Clock();

    // Setup renderer and effects
    this.renderer = new THREE.WebGLRenderer({
      clearColor: 0x000000,
      clearAlpha: 1,
      antialias: false,
      gammaInput: true,
      gammaOutput: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Setup Effects
    this.setupEffects();
    // Setup listeners
    document.addEventListener('mousemove', this.onDocumentMouseMove);
    document.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onWindowResize);
  }

  //SetUp effects
 setupEffects() {
   //setup the composer that renders the effects
   this.composer = new EffectComposer( this.renderer );
   this.composer.addPass( new RenderPass( this.hopalongVisualizer.getScene(), this.cameraManager.getCamera() ) );
   this.bloomEffect = new BloomEffect();
   this.bloomEffect.kernelSize = 1;

   let fakeCamera = new THREE.PerspectiveCamera( 60, window.innerWidth/window.innerHeight );
   fakeCamera.position.z = 7;

   const options = {
     waveSize: .15,
     speed: .5,
     amplitude: .2,
     maxRadius: 2
   }
   this.shockwaveEffect = new ShockWaveEffect( fakeCamera, this.cameraManager.focusPoint, options );

   this.effectPass = new EffectPass(this.cameraManager.getCamera(), this.shockwaveEffect, this.bloomEffect );
   this.effectPass.renderToScreen = true;
   this.composer.addPass( this.effectPass );

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

    this.shockwaveEffect.speed = (window.config.user.speed.value / 15) + audioData.peak.value * 1.25;


    if(this.particleConfigChanged()) {
      console.log(window.config)
      this.resetVisualization();
    }
    this.hopalongVisualizer.update( deltaTime, audioData, this.renderer, this.cameraManager );

    if ( window.config.effects.glow.value ) {
      this.bloomEffect.blendMode.opacity.value = audioData.peak.value * audioData.peak.energy;
    }

    if ( audioData.peak.value > 0.8 && window.config.effects.shockwave.value ) {
      this.shockwaveEffect.explode();
    }
    this.composer.render( this.clock.getDelta() );

    this.cameraManager.manageCameraPosition();
  }

  particleConfigChanged() {
    let hasChanged = false;
    Object.keys(window.config.particle).map(setting => {
      if(this.hopalongVisualizer[setting] != window.config.particle[setting].value) {
        hasChanged = true;
      }
    })
    return hasChanged;
  }

  resetVisualization() {
    this.hopalongVisualizer.destroyVisualization(this.renderer, this.cameraManager);
    this.hopalongVisualizer = null;
    this.hopalongVisualizer = new HopalongVisualizer();
    this.hopalongVisualizer.init();

    this.setupEffects();
  }

  ///////////////////////////////////////////////
  // Event listeners
  ///////////////////////////////////////////////
  // TODO Move these into config and set up from React
  onDocumentMouseMove = (event) => {
    this.cameraManager.updateMousePosition(event);
  }

  onWindowResize = (event) => {
    console.log('resizing.....');
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameraManager.onResize();
  }

  onKeyDown = (event) => {
    if (event.keyCode == 38 && window.config.user.speed.value < window.config.user.speed.max)
        window.config.user.speed.value += 0.5;
    else if (event.keyCode == 40 && window.config.user.speed.value > window.config.user.speed.min)
      window.config.user.speed.value -= 0.5;
    else if (event.keyCode == 37 && window.config.user.rotationSpeed.value < window.config.user.rotationSpeed.max)
     window.config.user.rotationSpeed.value += 0.25;
    else if (event.keyCode == 39 && window.config.user.rotationSpeed.value > window.config.user.rotationSpeed.min)
      window.config.user.rotationSpeed.value -= 0.25;
    //else if (event.keyCode == 72 || event.keyCode == 104) toggleVisuals();
  }
};
