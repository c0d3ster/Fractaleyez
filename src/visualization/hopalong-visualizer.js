import * as THREE from 'three';
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data';
import { CameraManager } from './camera-manager.js';


var VISUALS_VISIBLE = true;
var SCALE_FACTOR = 1500;
var NUM_POINTS_SUBSET = 16000;
var NUM_SUBSETS = 5;
var NUM_POINTS = NUM_POINTS_SUBSET * NUM_SUBSETS;
var NUM_LEVELS = 5;
var LEVEL_DEPTH = 500;
var DEF_BRIGHTNESS = .5;
var DEF_SATURATION = 1;
var SPRITE_SIZE = 5;

// Orbit parameters constraints
var A_MIN = 4;
var A_MAX = 20;
var B_MIN = .2;
var B_MAX = .3;
var C_MIN = 5;
var C_MAX = 6;
var D_MIN = 0;
var D_MAX = 1;
var E_MIN = 0;
var E_MAX = 1;

// Orbit parameters
var a, b, c, d, e;

export class HopalongVisualizer {
  constructor() {
      this.lights = [];
      this.objects = [];
      this.hueValues = [];
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2( 0x000000, 0.0013 );
      this.startTimer = null;
      this.deltaTime = 0;
      this.elapsedTime = 0;

      this.speed = 6;
      this.rotationSpeed = 0.002;

      this.orbit = {
        subsets: [],
        xMin: 0,
        xMax: 0,
        yMin: 0,
        yMax: 0,
        scaleX: 0,
        scaleY: 0
      };

      for( let i = 0; i < NUM_SUBSETS; i++ )
      {
        let subsetPoints = [];
        for( let j = 0; j < NUM_POINTS_SUBSET; j++ )
        {
          subsetPoints[j] = {
            x: 0,
            y: 0,
            vertex: new THREE.Vector3(0,0,0)
          }
        }
        this.orbit.subsets.push( subsetPoints );
        this.hueValues[i] = Math.random();
      }
  }



  init(cameraManager) {
    console.log("Hopalong Visualizer Initialized\n------------");
    //cameraManager.init(SCALE_FACTOR);

    let sprite = new THREE.TextureLoader().load( "./dist/img/galaxy.png" );

    this.setLights();

    this.generateOrbit();

    for( let level = 0; level < NUM_LEVELS; level++ ) {
      for( let s = 0; s < NUM_SUBSETS; s++ ) {

        let geometry = new THREE.Geometry();
        for (var i = 0; i < NUM_POINTS_SUBSET; i++) {
          geometry.vertices.push(this.orbit.subsets[s][i].vertex);
        }

        let material = new THREE.PointsMaterial( {
         size: SPRITE_SIZE,
         map: sprite,
         blending: THREE.AdditiveBlending,
         depthTest: false,
         transparent: true
        });

        let particles = new THREE.Points( geometry, material );
        particles.myMaterial = material;
        particles.myLevel = level;
        particles.mySubset = s;
        particles.position.x = 0;
        particles.position.y = 0;
        particles.position.z = -LEVEL_DEPTH * level - (s * LEVEL_DEPTH / NUM_SUBSETS) + SCALE_FACTOR / 2;
        particles.needsUpdate = 0;
        particles.material.color.setHSL( this.hueValues[s], DEF_SATURATION, DEF_BRIGHTNESS );
        this.objects.push( particles );
        this.scene.add( particles );
      }
    }

    setInterval( () => { this.updateOrbit(); }, 3000)
  }

    /**
   *
   * @param {number} deltaTime
   * @param {AudioAnalysedDataForVisualization} audioData
   */
  update( deltaTime, audioData, renderer, cameraManager ) {
    this.deltaTime = deltaTime;
    this.elapsedTime+= deltaTime;

    //Get momentum of the music being played
    let musicSpeed = (audioData.energyAverage + audioData.energy);
    let musicSpeedMultiplier = 1 + musicSpeed/10;
    //console.log('music speed multiplier: ' + musicSpeedMultiplier);
    //console.log(this.speed * musicSpeedMultiplier);
    //Process all children in scene and update them
    this.objects.forEach( (obj) => {
      obj.position.z += this.speed * musicSpeedMultiplier;
      obj.rotation.z += this.rotationSpeed;

      if( obj.position.z > SCALE_FACTOR / 2 )
      {
        obj.position.setZ( -(NUM_LEVELS-1) * LEVEL_DEPTH );

        if( obj.needsUpdate == 1 )
        {
          obj.geometry.verticesNeedUpdate = true;
          obj.material.color.setHSL( this.hueValues[obj.mySubset], DEF_SATURATION, DEF_BRIGHTNESS );
          obj.needsUpdate = 0;
        }
      }
    })

    renderer.render(this.scene, cameraManager.getCamera());
  }

  getScene() {
    return this.scene;
  }

  getSpeed() {
    return this.speed;
  }

  updateSpeed(deltaSpeed) {
    this.speed += deltaSpeed;
  }

  updateRotationSpeed(deltaRotationSpeed) {
    this.rotationSpeed += deltaRotationSpeed;
  }

  updateOrbit() {
    //Generate new Pattern
    this.generateOrbit();

    //Change their colors
    for( let s = 0; s < NUM_SUBSETS; s++ )
    {
      this.hueValues[s] = Math.random();
    }

    this.objects.forEach( (obj) => {
      obj.needsUpdate = 1;
    });
  }

  generateOrbit() {
    let x, y, z, x1;
    this.prepareOrbit();

    let la=a, lb=b, lc=c, ld=d, le=e;

    let subsets = this.orbit.subsets;
    let num_points_subset_l = NUM_POINTS_SUBSET;
    let num_points_l = NUM_POINTS;
    let scale_factor_l = SCALE_FACTOR;

    let xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    let choice = Math.random();

    for( let s = 0; s < NUM_SUBSETS; s++ )
    {
      x = s*.005*(0.5-Math.random());
      y = s*.005*(0.5-Math.random());

      let currentSubset = this.orbit.subsets[s];

      for( let i = 0; i < NUM_POINTS_SUBSET; i++ )
      {
        if( choice < 0.5 )
          z = (ld + (Math.sqrt(Math.abs(lb * x - lc))));
        else if( choice < 0.75 )
          z = (ld + Math.sqrt(Math.sqrt(Math.abs( lb * x - lc))));
        else
          z = (ld + Math.log(2+Math.sqrt(Math.abs(lb * x - lc))));

        if( x > 0 ) x1 = y-z;
        else if( x == 0 ) x1 = y;
        else x1 = y+z;
        y = la-x;
        x = x1 + le;

        currentSubset[i].x = x;
        currentSubset[i].y = y;

        if( x < xMin ){ xMin = x; }
        else if( x > xMax ){ xMax = x; }
        if( y < yMin ){ yMin = y; }
        else if( y > yMax ){ yMax = y; }
      }
    }

    let scaleX = 2 * scale_factor_l / (xMax - xMin ),
        scaleY = 2 * scale_factor_l / (yMax - yMin );

    this.orbit.xMin = xMin;
    this.orbit.yMin = yMin;
    this.orbit.xMax = xMax;
    this.orbit.yMax = yMax;
    this.orbit.scaleX = scaleX;
    this.orbit.scaleY = scaleY;

    for( let s = 0; s < NUM_SUBSETS; s++ )
    {
      let currentSubset = this.orbit.subsets[s];
      for( let i = 0; i < NUM_POINTS_SUBSET; i++ )
      {
        currentSubset[i].vertex.setX( scaleX * (currentSubset[i].x - xMin) - scale_factor_l );
        currentSubset[i].vertex.setY( scaleY * (currentSubset[i].y - yMin) - scale_factor_l );
      }
    }
  }

  prepareOrbit() {
    this.shuffleParams();
    this.orbit.xMin = 0;
    this.orbit.xMax = 0;
    this.orbit.yMin = 0;
    this.orbit.yMax = 0;
  }

  shuffleParams() {
    a = A_MIN + Math.random() * (A_MAX - A_MIN);
    b = B_MIN + Math.random() * (B_MAX - B_MIN);
    c = C_MIN + Math.random() * (C_MAX - C_MIN);
    d = D_MIN + Math.random() * (D_MAX - D_MIN);
    e = E_MIN + Math.random() * (E_MAX - E_MIN);
  }

  setLights() {
    this.lights[0] = new THREE.PointLight(0xffffff, 0.2, 0);
    this.lights[1] = new THREE.PointLight(0xffffff, 0.2, 0);
    this.lights[2] = new THREE.PointLight(0xffffff, 0.2, 0);

    this.lights[0].position.set(0, 200, 0);
    this.lights[1].position.set(100, 200, 100);
    this.lights[2].position.set(-100, -200, -100);

    this.scene.add( this.lights[0] );
    this.scene.add( this.lights[1] );
    this.scene.add( this.lights[2] );
  }

}
