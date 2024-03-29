import * as THREE from 'three'

import { AudioAnalysedDataForVisualization } from '../audioanalysis/audio-analysed-data'

/*
 * ORIGINAL AUTHOR: Iacopo Sassarini
 * Modifications made by Cody Douglass and Conor O'Neill
 */
const DEF_BRIGHTNESS = .5

// Orbit parameters
let a; let b; let c; let d; let e

export default class HopalongVisualizer {
  constructor() {
    this.particlesPerLayer = window.config.particle.particlesPerLayer.value
    this.layers = window.config.particle.layers.value
    this.levels = window.config.particle.levels.value
    this.saturation = window.config.particle.saturation ? window.config.particle.saturation.value : 1
    this.levelDepth = 500
    this.particleSize = window.config.particle.particleSize.value
    this.needsParticleReset = false
    this.lights = []
    this.video = null
    this.objects = []
    this.hueValues = []
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2( 0x000000, 0.0013 )
    this.sprites = window.config.particle.sprites.value
    this.startTimer = null
    this.deltaTime = 0
    this.elapsedTime = 0
    this.audioPeak = false
    this.peakCountdown = 0
    this.orbit = {
      subsets: [],
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
      scaleX: 0,
      scaleY: 0
    }

    for( let i = 0; i < this.layers; i++ )
    {
      const subsetPoints = []
      for( let j = 0; j < this.particlesPerLayer; j++ )
      {
        subsetPoints[j] = {
          x: 0,
          y: 0,
          vertex: new THREE.Vector3(0,0,0)
        }
      }
      this.orbit.subsets.push( subsetPoints )
      this.hueValues[i] = Math.random()
    }
  }


  init() {
    let sprite = new THREE.TextureLoader().load( this.sprites[0] )
    let count = 1
    let particleIndex = 0
    this.setLights()

    this.generateOrbit()

    if (window.config.video && window.config.video.clips.length) {
      this.video = document.createElement('video')
      this.video.src = window.config.video.clips[window.config.video.index]
      this.video.autoplay = true

      this.video.addEventListener('ended', () => (
        this.nextVideo(this.video)
      ))

      // Create a texture from the video
      const videoTexture = new THREE.VideoTexture(this.video)

      // Create a plane geometry
      const planeGeometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight)

      // Create a material with the video texture
      const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture })

      // Create a mesh from the geometry and material
      const plane = new THREE.Mesh(planeGeometry, planeMaterial)

      // Position the plane behind all other objects in the scene
      plane.position.z = 5

      // Add the plane to the scene
      this.scene.add(plane)
    }

    for( let level = 0; level < this.levels; level++ ) {
      for( let s = 0; s < this.layers; s++ ) {

        const points = []
        for (let i = 0; i < this.particlesPerLayer; i++) {
          const { subsets } = this.orbit
          points.push(subsets[s][i].vertex)
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points)

        particleIndex = count % this.sprites.length
        sprite = new THREE.TextureLoader().load( this.sprites[particleIndex] )
        const material = new THREE.PointsMaterial( {
          size: this.particleSize,
          map: sprite,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          transparent: true
        })

        const particles = new THREE.Points( geometry, material )
        particles.myMaterial = material
        particles.myLevel = level
        particles.mySubset = s
        particles.position.x = 0
        particles.position.y = 0
        particles.position.z = -this.levelDepth * level - (s * this.levelDepth / this.layers) + window.config.user.scaleFactor.value / 2
        particles.needsUpdate = 0
        particles.material.color.setHSL( this.hueValues[s], this.saturation, DEF_BRIGHTNESS )
        this.objects.push( particles )
        this.scene.add( particles )
        count++
      }
    }

    this.updateInterval = setInterval( () => { this.updateOrbit() }, 300)
  }

  nextVideo(videoElement) {
    window.config.video.index++
    if (window.config.video.index >= window.config.video.clips.length) {
      window.config.video.index = 0
    }
    videoElement.src = window.config.video.clips[window.config.video.index]
    videoElement.play()
  }

  /**
   *
   * @param {number} deltaTime
   * @param {AudioAnalysedDataForVisualization} audioData
   */
  update( deltaTime, audioData, renderer, cameraManager) {
    if ( audioData.peak.value > 0.8 ) {
      this.audioPeak = true
    }

    this.deltaTime = deltaTime
    this.elapsedTime+= deltaTime

    // Get momentum of the music being played
    const musicSpeed = (audioData.energyAverage + audioData.energy)
    const musicSpeedMultiplier = 1 + musicSpeed/10
    // console.info('music speed multiplier: ' + musicSpeedMultiplier);
    // console.info(window.config.speed * musicSpeedMultiplier);

    let count = 0 // keep track of which layer to apply settings on

    // Process all children in scene and update them applying effects as needed
    this.objects.forEach( (obj) => {
      obj.position.z += window.config.user.speed.value * musicSpeedMultiplier // move particles towards camera

      if (this.audioPeak) {
        this.peakCountdown-- // decrement peak countdown
        if ( this.peakCountdown <= 0 ) {  // reset peakCountdown after 100 objects affected (4 frames with 25 objects)
          this.audioPeak = false
          this.peakCountdown = 100
        }

        if ( count % 2 === 0 && window.config.effects.switcheroo.value ) { // change geometry of every other orbit on peak
          obj.geometry.verticesNeedUpdate = true
          obj.needsUpdate = 0
        }

        if ( window.config.effects.wobWob.value ) { // wobwob effect
          obj.position.z -= window.config.user.speed.value * musicSpeedMultiplier * 2
        }

        if ( window.config.effects.colorShift.value ) { // change color on peak
          obj.material.color.setHSL( this.hueValues[obj.mySubset], this.saturation, DEF_BRIGHTNESS )
        }
      }

      if ( obj.position.z > window.config.user.scaleFactor.value / 2 ) {
        obj.position.setZ( -(this.levels-1) * this.levelDepth + this.levelDepth)

        if ( obj.needsUpdate === 1 )
        {
          obj.geometry.verticesNeedUpdate = true
          obj.needsUpdate = 0
        }
      }

      if ( window.config.effects.cyclone.value ) {
        if (count % 3 === 0) {
          obj.rotation.z += (window.config.user.rotationSpeed.value / 1000) * musicSpeedMultiplier
        }
        else if (count % 3 === 1) {
          obj.rotation.z -= (window.config.user.rotationSpeed.value / 1000) * musicSpeedMultiplier
        }
      }
      else {
        obj.rotation.z += (window.config.user.rotationSpeed.value / 1000) * musicSpeedMultiplier
      }
      count++
    })
    renderer.render(this.scene, cameraManager.getCamera())
  }

  getScene() {
    return this.scene
  }

  updateOrbit() {
    // Generate new Pattern
    this.generateOrbit()

    // Change their colors
    for( let s = 0; s < this.layers; s++ )
    {
      this.hueValues[s] = Math.random()
    }

    this.objects.forEach( (obj) => {
      obj.needsUpdate = 1
    })
  }

  generateOrbit() {
    let x; let y; let z; let x1
    this.prepareOrbit()

    const la=a; const lb=b; const lc=c; const ld=d; const le=e

    const scale_factor_l = window.config.user.scaleFactor.value

    let xMin = 0; let xMax = 0; let yMin = 0; let yMax = 0
    // let choice = Math.random();

    for( let s = 0; s < this.layers; s++ )
    {
      x =  s * 0.005 * (1-Math.random())
      y =  s * 0.005 * (1-Math.random())

      const currentSubset = this.orbit.subsets[s]

      for( let i = 0; i < this.particlesPerLayer; i++ )
      {
        z = (ld + Math.sqrt(Math.sqrt(Math.abs( lb * x - lc))))
        /* if( choice < 0.5 )
          z = (ld + (Math.sqrt(Math.abs(lb * x - lc))));
        else if( choice < 0.75 )
          z = (ld + Math.sqrt(Math.sqrt(Math.abs( lb * x - lc))));
        else
          z = (ld + Math.log(2+Math.sqrt(Math.abs(lb * x - lc))));
        */
        if( x > 0 ) x1 = y-z
        else if( x === 0 ) x1 = y
        else x1 = y+z
        y = la-x
        x = x1 + le

        currentSubset[i].x = x
        currentSubset[i].y = y

        if( x < xMin ){ xMin = x }
        else if( x > xMax ){ xMax = x }
        if( y < yMin ){ yMin = y }
        else if( y > yMax ){ yMax = y }
      }
    }

    const scaleX = 2 * scale_factor_l / (xMax - xMin )
    const scaleY = 2 * scale_factor_l / (yMax - yMin )

    this.orbit.xMin = xMin
    this.orbit.yMin = yMin
    this.orbit.xMax = xMax
    this.orbit.yMax = yMax
    this.orbit.scaleX = scaleX
    this.orbit.scaleY = scaleY

    for( let s = 0; s < this.layers; s++ )
    {
      const currentSubset = this.orbit.subsets[s]
      for( let i = 0; i < this.particlesPerLayer; i++ )
      {
        // TODO: Determine whether this "Clear Center" hack is still functioning or not
        currentSubset[i].vertex.setX( scaleX * (currentSubset[i].x - xMin) - scale_factor_l )
        currentSubset[i].vertex.setY( scaleY * (currentSubset[i].y - yMin) - scale_factor_l )
      }
    }
  }

  prepareOrbit() {
    this.updateOrbitParams()
    this.orbit.xMin = 0
    this.orbit.xMax = 0
    this.orbit.yMin = 0
    this.orbit.yMax = 0
  }

  updateOrbitParams() {
    a = window.config.orbit.a.value
    b = window.config.orbit.b.value
    c = window.config.orbit.c.value
    d = window.config.orbit.d.value
    e = window.config.orbit.e.value
  }

  setLights() {
    this.lights[0] = new THREE.PointLight(0xffffff, 0.2, 0)
    this.lights[1] = new THREE.PointLight(0xffffff, 0.2, 0)
    this.lights[2] = new THREE.PointLight(0xffffff, 0.2, 0)

    this.lights[0].position.set(0, 200, 0)
    this.lights[1].position.set(100, 200, 100)
    this.lights[2].position.set(-100, -200, -100)

    this.scene.add( this.lights[0] )
    this.scene.add( this.lights[1] )
    this.scene.add( this.lights[2] )
  }

  destroyVisualization() {
    clearInterval(this.updateInterval)
    this.disposeScene(this.scene)
  }

  disposeScene(scene) {
    if(this.video) {
      console.info(this.video)
      this.video.pause()
      this.video.remove()
      delete this.video
    }

    if(scene.geometries) {
      scene.geometries.forEach((geometry) => {
        geometry.dispose()
      })
    }

    if(scene.textures) {
      scene.textures.forEach((texture) => {
        texture.dispose()
      })
    }

    if(scene.materials) {
      scene.geometries.forEach((material) => {
        material.dispose()
      })
    }

    if(scene.images) {
      scene.images.forEach((image) => {
        image.dispose()
      })
    }

  }
}
