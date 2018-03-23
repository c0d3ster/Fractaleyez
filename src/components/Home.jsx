import React from 'react';
import * as THREE from 'three';
import FirstPersonControls from '../js/FirstPersonControls.js';

export default class Home extends React.Component {
    constructor(props) {
        super(props)

        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.animate = this.animate.bind(this);
    }

    componentDidMount() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        const clock = new THREE.Clock();
        const scene = new THREE.Scene();
        scene.background = new THREE.Color( 0xbfd1e5 );

        const camera = new THREE.PerspectiveCamera(
          75,
          width / height,
          0.1,
          1000
        );

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: '#433F81' });
        const cube = new THREE.Mesh(geometry, material);

        const controls = new THREE.FirstPersonControls( camera );
        controls.movementSpeed = 1000;
        controls.lookSpeed = 0.125;
        controls.lookVertical = true;

        camera.position.z = 4;
        scene.add(cube);
        renderer.setClearColor('#000000');
        renderer.setSize(width, height);

        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.material = material;
        this.cube = cube;
        this.controls = controls;
        this.clock = clock;

        this.mount.appendChild(this.renderer.domElement);

        //Add event listener to resize window elements
        window.addEventListener('resize', () => {

          camera.aspect = window.innerWidth / window.innerHeight
          camera.updateProjectionMatrix()

          renderer.setSize(window.innerWidth, window.innerHeight)
          this.controls.handleResize();

        }, false);

        this.start();
    }

    componentWillUnmount() {
        this.stop();
        this.mount.removeChild(this.renderer.domElement);
    }

    onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize( window.innerWidth, window.innerHeight );
      this.controls.handleResize();
    }

    start() {

        if (!this.frameId) {
          this.frameId = requestAnimationFrame(this.animate);
        }
    }

    stop() {
        cancelAnimationFrame(this.frameId);
    }

    animate() {

        this.cube.rotation.x += 0.01;
        this.cube.rotation.y += 0.01;

        this.renderScene()
        this.frameId = window.requestAnimationFrame(this.animate);
    }

    renderScene() {
        this.controls.update( this.clock.getDelta() );
        this.renderer.render(this.scene, this.camera);
    }

    render() {
      return (
        <div
          style={{ width: '400px', height: '400px' }}
          ref={(mount) => { this.mount = mount }}/>
      )
    }
}
