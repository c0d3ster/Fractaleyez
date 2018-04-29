import * as THREE from 'three';
import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data';
import { CameraManager } from './camera-manager.js';


var VISUALS_VISIBLE = true;
var SCALE_FACTOR = 1500;
var NUM_POINTS_SUBSET = 16000;
var NUM_SUBSETS = 2;
var NUM_POINTS = NUM_POINTS_SUBSET * NUM_SUBSETS;
var NUM_LEVELS = 100;
var LEVEL_DEPTH = 50;
var DEF_BRIGHTNESS = .5;
var DEF_SATURATION = 1;
var SPRITE_SIZE = 5;
const CAMERA_BOUND = 50;
// Orbit parameters constraints
var A_MIN = -30;
var A_MAX = 30;
var B_MIN = .2;
var B_MAX = 1.8;
var C_MIN = 5;
var C_MAX = 17;
var D_MIN = 0;
var D_MAX = 10;
var E_MIN = 0;
var E_MAX = 12;

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
      this.speed = 2;
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



  init() {

    console.log("Hopalong Visualizer Initialized\n------------");

    let sprite = new THREE.TextureLoader().load( "./dist/img/galaxy.png" );

    this.setLights();

    this.generateOrbit();

    for( let level = 0; level < NUM_LEVELS; level++ ) {
      for( let s = 0; s < NUM_SUBSETS; s++ ) {


        let geometry = new THREE.Geometry();
        let count = 0;
        for (var i = 0; i < NUM_POINTS_SUBSET; i++) {

          geometry.vertices.push(this.orbit.subsets[s][i].vertex);
          count++;
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
  update( deltaTime, audioData, renderer, cameraManager, peak) {
    var time = Date.now() * 0.0015;
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


      //300...far away
      if (obj.position.z < SCALE_FACTOR / 10 && obj.position.z > SCALE_FACTOR / 5) {
        obj.position.x += cameraManager.getMouseX() * 0.009;//0.03;
        obj.position.y += -cameraManager.getMouseY() *0.009;//0.03;
      }
      else if (obj.position.z < SCALE_FACTOR / 7) {
        obj.position.x += cameraManager.getMouseX() * 0.009;
        obj.position.y += cameraManager.getMouseY() * 0.009;
      }
      else {//if (obj.position.z < SCALE_FACTOR / 2) {
        obj.position.x -= cameraManager.getMouseX() * 0;
        obj.position.y -= cameraManager.getMouseY() * 0;

       }

      if (obj.position.x.x < -CAMERA_BOUND) obj.position.x.x = -CAMERA_BOUND;
      if (obj.position.x > CAMERA_BOUND) obj.position.x = CAMERA_BOUND;


        if (obj.position.y < -CAMERA_BOUND) obj.position.y = -CAMERA_BOUND;
        if (obj.position.y > CAMERA_BOUND) obj.position.y = CAMERA_BOUND;
      cameraManager.getCamera().lookAt(new THREE.Vector3(0, 0, 0));

      //obj.position.x = cameraManager.getMouseX() * 0.6;
      //obj.position.y = cameraManager.getMouseY() * 0.6;

      //obj.rotation.x = cameraManager.getMouseY() * 0.001;
      //obj.rotation.y = -cameraManager.getMouseX() * 0.001;

      //cameraManager.getCamera().rotation.x = -obj.rotation.y * 0.001;
      //cameraManager.getCamera().rotation.y = -obj.rotation.y * 0.001;

      //cameraManager.getCamera().lookAt(new  THREE.Vector3(0,0,0));
      //obj.geometry.verticesNeedUpdate = true;

      //obj.lookAt(new THREE.Vector3(cameraManager.getMouseX() *1 , cameraManager.getMouseY() * 1,  ));
      //cameraManager.getCamera().position.x = -obj.position.x;
      //cameraManager.getCamera().position.y = -obj.position.y;
      //if( obj.position.z < SCALE_FACTOR / 4 ) {




      //}
      // Rotate Z & Y axis

      // Rotate Z & Y axis


      if( obj.position.z > SCALE_FACTOR / 2 ) //> 750 means it is past the camera
      {

        obj.position.setZ( -(NUM_LEVELS-1) * LEVEL_DEPTH  + 15 * LEVEL_DEPTH );

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
      x = 0.005*(1-Math.random());
      y = 0.005*(1-Math.random());

      let currentSubset = this.orbit.subsets[s];

      for( let i = 0; i < NUM_POINTS_SUBSET; i++ )
      {
        z = ((ld + Math.log(2+Math.sqrt(Math.abs(lb * x - lc)))) * .8);
        /*if( choice < 0.5 )
          z = (ld + (Math.sqrt(Math.abs(lb * x - lc))));
        else
          z = (ld + Math.log(2+Math.sqrt(Math.abs(lb * x - lc))));
          */
        if( x > 0 ) x1 = y-z;
        else if( x == 0 ) x1 = y;
        else x1 = y+z;
        y = la-x;
        x = x1 + le;

        //lil patch to get shit outta middle, not final
        /*if (x <= 10 && x >= -10) {
          x = window.innerWidth;
        }
        if (y <= 10 && y >= -10) {
          y = window.innerHeight;
        }*/

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
        //lil patch to get shit outta middle, not final
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
    a = A_MIN + 1 * (A_MAX - A_MIN);
    b = B_MIN + 1 * (B_MAX - B_MIN);
    c = C_MIN + 1*(C_MAX - C_MIN);
    d = D_MIN + 1 * (D_MAX - D_MIN);
    e = E_MIN +1 *(E_MAX - E_MIN);
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
