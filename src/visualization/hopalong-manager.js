import * as THREE from 'three';
import { HopalongVisualizer } from './hopalong-visualizer.js'
import { CameraManager } from './camera-manager';
import { EffectComposer, Bloom, ShockWavePass,  RenderPass, BloomPass } from 'postprocessing';

//for whatever reason...if this is made a class property it doesnt work
var cameraManager;
var renderer;
var hopalongVisualizer;
var fakeCamera;
export class HopalongManager {
  constructor() {
    this.$container = null;
    this.startTimer = null;
    this.deltaTime = 0;
    this.elapsedTime = 0;
    //this.cameraManager = null;
    //this.hopalongVisualizer = new HopalongVisualizer();
    this.container = null;
    this.composer = null;
  }


  /**
   *
   * @param {Date} startTimer
   */
  init( startTimer )
  {
    console.log("Hopalong Manager Initialized\n------------");
    cameraManager = new CameraManager();
    cameraManager.init(1500);
    hopalongVisualizer = new HopalongVisualizer();
    hopalongVisualizer.init();
    this.startTimer = startTimer;

    //pass the visualizer the camera manager so the camera can get the SCALE_FACTOR
    this.hopalongVisualizer.init(this.cameraManager);


    this.container = document.createElement('div');
    document.body.appendChild(this.container);
    // Setup renderer and effects
    this.renderer = new THREE.WebGLRenderer({
      clearColor: 0x000000,
      clearAlpha: 1,
      antialias: true,
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
    this.composer = new EffectComposer( renderer );
    this.composer.addPass( new RenderPass( hopalongVisualizer.getScene(), cameraManager.getCamera() ) );
    this.bloomPass = new BloomPass();
    this.bloomPass.kernelSize = 0;
    this.composer.addPass( this.bloomPass );

    fakeCamera = new THREE.PerspectiveCamera( 60, window.innerWidth/window.innerHeight );
    fakeCamera.position.z = 5;

    this.shockwavePass = new ShockWavePass( fakeCamera );
    this.shockwavePass.renderToScreen = true;
    this.shockwavePass.extent = 3.34;
    this.shockwavePass.waveSize = 0.798;
    this.shockwavePass.speed = 1.3;
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

    hopalongVisualizer.update( deltaTime, audioData, renderer, cameraManager );

      this.bloomPass.intensity = audioData.peak.value * audioData.peak.energy;
      if ( audioData.peak.value == 1 ) {
        //this.shockwavePass.explode();
      }
      this.composer.render( this.clock.getDelta() );

      cameraManager.manageCameraPosition();
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

  onKeyDown(event) {
    if (event.keyCode == 38 && hopalongVisualizer.getSpeed() < 40) hopalongVisualizer.updateSpeed(0.25);
    else if (event.keyCode == 40 && hopalongVisualizer.getSpeed() > 0) hopalongVisualizer.updateSpeed(-0.25);
    else if (event.keyCode == 37) hopalongVisualizer.updateRotationSpeed(0.001);
    else if (event.keyCode == 39) hopalongVisualizer.updateRotationSpeed(-0.001);
    else if (event.keyCode == 72 || event.keyCode == 104) toggleVisuals();
  }
};
