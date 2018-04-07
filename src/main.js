/*
 * AUTHOR: Iacopo Sassarini
 */
import * as THREE from 'three';
import {HUD} from './hud/hud-controller';
import {Stats} from './tools/stats';
import css from './main.css';

var VISUALS_VISIBLE = true;

var SCALE_FACTOR = 1500;
var CAMERA_BOUND = 200;

var NUM_POINTS_SUBSET = 32000;
var NUM_SUBSETS = 7;
var NUM_POINTS = NUM_POINTS_SUBSET * NUM_SUBSETS;

var NUM_LEVELS = 7;
var LEVEL_DEPTH = 1000;

var DEF_BRIGHTNESS = .5;
var DEF_SATURATION = .7;

var SPRITE_SIZE = 5;

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

// Orbit data
var orbit = {
  subsets: [],
  xMin: 0,
  xMax: 0,
  yMin: 0,
  yMax: 0,
  scaleX: 0,
  scaleY: 0
}
// Initialize data points
for (var i = 0; i < NUM_SUBSETS; i++) {
  var subsetPoints = [];
  for (var j = 0; j < NUM_POINTS_SUBSET; j++) {
    subsetPoints[j] = {
      x: 0,
      y: 0,
      vertex: new THREE.Vector3(0, 0, 0)
    };
  }
  orbit.subsets.push(subsetPoints);
}

var container, stats;
var camera, scene, renderer, composer, hueValues = [];

var mouseX = 0,
  mouseY = 0;

var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

var speed = 3;
var rotationSpeed = 0.002;

init();
animate();

function init() {

  let sprite = new THREE.TextureLoader().load("./dist/img/galaxy.png");

  container = document.createElement('div');
  document.body.appendChild(container);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3 * SCALE_FACTOR);
  camera.position.z = SCALE_FACTOR / 2;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.0010);

  generateOrbit();

  for (var s = 0; s < NUM_SUBSETS; s++) {
    hueValues[s] = Math.round(Math.random()*360);
  }

  // Create particle systems
  for (var k = 0; k < NUM_LEVELS; k++) {
    for (var s = 0; s < NUM_SUBSETS; s++) {

      var geometry = new THREE.Geometry();
      for (var i = 0; i < NUM_POINTS_SUBSET; i++) {
        geometry.vertices.push(orbit.subsets[s][i].vertex);
      }
      var materials = new THREE.PointsMaterial({
        size: (SPRITE_SIZE),
        map: sprite,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true
      });
      console.log(materials.color);
      materials.color = new THREE.Color(`hsl(${hueValues[s]}, ${ (DEF_SATURATION*100).toFixed(0)}%, ${(DEF_BRIGHTNESS*100).toFixed(0)}%)`);
      //materials.color = new THREE.Color( 'skyblue' );

      var particles = new THREE.Points(geometry, materials);
      particles.myMaterial = materials;
      particles.myLevel = k;
      particles.mySubset = s;
      particles.position.x = 0;
      particles.position.y = 0;
      particles.position.z = -LEVEL_DEPTH * k - (s * LEVEL_DEPTH / NUM_SUBSETS) + SCALE_FACTOR / 2;
      particles.needsUpdate = 0;
      scene.add(particles);

    }
  }

  // Setup renderer and effects
  renderer = new THREE.WebGLRenderer({
    clearColor: 0x000000,
    clearAlpha: 1,
    antialias: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);

  container.appendChild(renderer.domElement);

  //let hud = new HUD();
  //let stats = new Stats(Stats.POSITIONS.BOTTOM_RIGHT);
  //hud.add(this.stats);

  // Setup listeners
  document.addEventListener('mousemove', onDocumentMouseMove, false);
  document.addEventListener('touchstart', onDocumentTouchStart, false);
  document.addEventListener('touchmove', onDocumentTouchMove, false);
  document.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('resize', onWindowResize, false);

  // Schedule orbit regeneration
  setInterval(updateOrbit, 5000);
}

function animate() {
  requestAnimationFrame(animate);
  render();
}

function render() {

  if (camera.position.x >= -CAMERA_BOUND && camera.position.x <= CAMERA_BOUND) {
    camera.position.x += (mouseX - camera.position.x) * 0.05;
    if (camera.position.x < -CAMERA_BOUND) camera.position.x = -CAMERA_BOUND;
    if (camera.position.x > CAMERA_BOUND) camera.position.x = CAMERA_BOUND;
  }
  if (camera.position.y >= -CAMERA_BOUND && camera.position.y <= CAMERA_BOUND) {
    camera.position.y += (-mouseY - camera.position.y) * 0.05;
    if (camera.position.y < -CAMERA_BOUND) camera.position.y = -CAMERA_BOUND;
    if (camera.position.y > CAMERA_BOUND) camera.position.y = CAMERA_BOUND;
  }

  camera.lookAt(scene.position);

  for (i = 0; i < scene.children.length; i++) {
    let child = scene.children[i];
    child.position.z += speed;
    child.rotation.z += rotationSpeed;
    if (child.position.z > camera.position.z) {
      child.position.z = -(NUM_LEVELS - 1) * LEVEL_DEPTH;
      if (child.needsUpdate == 1) {
        child.geometry.__dirtyVertices = true;
        //console.log(child.myMaterial.color);
        //console.log('new color');
        //console.log(new THREE.Color(`hsl(${hueValues[child.mySubset]}, ${ (DEF_SATURATION*100).toFixed(0)}%, ${(DEF_BRIGHTNESS*100).toFixed(0)}%)`));
        child.myMaterial.color = new THREE.Color(`hsl(${hueValues[child.mySubset]}, ${ (DEF_SATURATION*100).toFixed(0)}%, ${(DEF_BRIGHTNESS*100).toFixed(0)}%)`);
        child.needsUpdate = 0;
      }
    }
  }

  renderer.render(scene, camera);
}

///////////////////////////////////////////////
// Hopalong Orbit Generator
///////////////////////////////////////////////
function updateOrbit() {
  generateOrbit();
  for (var s = 0; s < NUM_SUBSETS; s++) {
    hueValues[s] = Math.round(Math.random()*360);
  }
  for (i = 0; i < scene.children.length; i++) {
    scene.children[i].needsUpdate = 1;
  }
}

function generateOrbit() {
  var x, y, z, x1;
  var idx = 0;

  prepareOrbit();

  // Using local vars should be faster
  let al = a;
  let bl = b;
  let cl = c;
  let dl = d;
  let el = e;
  var subsets = orbit.subsets;
  var num_points_subset_l = NUM_POINTS_SUBSET;
  var num_points_l = NUM_POINTS;
  var scale_factor_l = SCALE_FACTOR;

  var xMin = 0,
    xMax = 0,
    yMin = 0,
    yMax = 0;
  var choice;
  choice = Math.random();

  for (var s = 0; s < NUM_SUBSETS; s++) {

    // Use a different starting point for each orbit subset
    x = s * .005 * (0.5 - Math.random());
    y = s * .005 * (0.5 - Math.random());
    var curSubset = subsets[s];

    for (var i = 0; i < num_points_subset_l; i++) {

      // Iteration formula (generalization of the Barry Martin's original one)


      if (choice < 0.5) {
        z = (dl + (Math.sqrt(Math.abs(bl * x - cl))));
      } else if (choice < 0.75) {
        z = (dl + Math.sqrt(Math.sqrt(Math.abs(bl * x - cl))));

      } else {
        z = (dl + Math.log(2 + Math.sqrt(Math.abs(bl * x - cl))));
      }

      if (x > 0) {
        x1 = y - z;
      } else if (x == 0) {
        x1 = y;
      } else {
        x1 = y + z;
      }
      y = al - x;
      x = x1 + el;

      curSubset[i].x = x;
      curSubset[i].y = y;

      if (x < xMin) {
        xMin = x;
      } else if (x > xMax) {
        xMax = x;
      }
      if (y < yMin) {
        yMin = y;
      } else if (y > yMax) {
        yMax = y;
      }

      idx++;
    }
  }

  var scaleX = 2 * scale_factor_l / (xMax - xMin);
  var scaleY = 2 * scale_factor_l / (yMax - yMin);

  orbit.xMin = xMin;
  orbit.xMax = xMax;
  orbit.yMin = yMin;
  orbit.yMax = yMax;
  orbit.scaleX = scaleX;
  orbit.scaleY = scaleY;

  // Normalize and update vertex data
  for (var s = 0; s < NUM_SUBSETS; s++) {
    var curSubset = subsets[s];
    for (var i = 0; i < num_points_subset_l; i++) {
      curSubset[i].vertex.setX(scaleX * (curSubset[i].x - xMin) - scale_factor_l);
      curSubset[i].vertex.setY(scaleY * (curSubset[i].y - yMin) - scale_factor_l);
    }
  }
  console.log(subsets[0][0]);
}

function prepareOrbit() {
  shuffleParams();
  orbit.xMin = 0;
  orbit.xMax = 0;
  orbit.yMin = 0;
  orbit.yMax = 0;
}

function shuffleParams() {
  a = A_MIN + Math.random() * (A_MAX - A_MIN);
  b = B_MIN + Math.random() * (B_MAX - B_MIN);
  c = C_MIN + Math.random() * (C_MAX - C_MIN);
  d = D_MIN + Math.random() * (D_MAX - D_MIN);
  e = E_MIN + Math.random() * (E_MAX - E_MIN);
}

///////////////////////////////////////////////
// Event listeners
///////////////////////////////////////////////
function onDocumentMouseMove(event) {
  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;
}

function onDocumentTouchStart(event) {
  if (event.touches.length == 1) {
    event.preventDefault();
    mouseX = event.touches[0].pageX - windowHalfX;
    mouseY = event.touches[0].pageY - windowHalfY;
  }
}

function onDocumentTouchMove(event) {
  if (event.touches.length == 1) {
    event.preventDefault();
    mouseX = event.touches[0].pageX - windowHalfX;
    mouseY = event.touches[0].pageY - windowHalfY;
  }
}

function onWindowResize(event) {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
  if (event.keyCode == 38 && speed < 20) speed += .5;
  else if (event.keyCode == 40 && speed > 0) speed -= .5;
  else if (event.keyCode == 37) rotationSpeed += .001;
  else if (event.keyCode == 39) rotationSpeed -= .001;
  else if (event.keyCode == 72 || event.keyCode == 104) toggleVisuals();
}
