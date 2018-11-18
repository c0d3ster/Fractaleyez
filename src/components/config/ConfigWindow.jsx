import React from 'react';
import ReactDOM from 'react-dom';
import UserConfig from './UserConfig.jsx';
import AudioConfig from './AudioConfig.jsx';
import EffectsConfig from './EffectsConfig.jsx';
import OrbitConfig from './OrbitConfig.jsx';


import { Grid, Row, Col, } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';


import copyStyles from '../../styles/AppStyleCopier.js';

import config from '../../config/configuration.js';


export default class ConfigWindow extends React.PureComponent {
  constructor(props) {
    super(props);
    // STEP 1: create a container <div>
    this.containerEl = document.createElement('div');
    this.externalWindow = null;

    this.state = {
      width:  1920,
      height: 1080
    };
  }

  //SHOULD STILL INITALLY KEEP CONFIG IN SAME WINDOW AND ADD BUTTON TO DETACH IT TO NEW WINDOW

  componentDidMount() {
    // STEP 3: open a new browser window and store a reference to it
    this.externalWindow = window.open('', '', 'width=' + this.state.width + ',height=' + this.state.height);

    // STEP 4: append the container <div> (that has props.children appended to it) to the body of the new window
    this.externalWindow.document.body.appendChild(this.containerEl);

    this.externalWindow.addEventListener("resize", this.updateDimensions.bind(this));

    copyStyles(document, this.externalWindow.document);
  }

  componentWillUnmount() {
    this.externalWindow.removeEventListener("resize", this.updateDimensions.bind(this));
    // STEP 5: This will fire when this.state.showWindowPortal in the parent component becomes false
    // So we tidy up by closing the window
    this.externalWindow.close();


  }

    /**
   * Calculate & Update state of new dimensions
   */
  updateDimensions() {
    console.log('updating dimesnison  ');

    this.setState({ width: this.externalWindow.innerWidth, height: this.externalWindow.innerHeight });

  }

  //---------------USER CONFIG ----------------
  onSpeedChanged = (event) => {
    config.user.speed.value = event.target.value;
    this.externalWindow.console.log('speed changed ' + event.target.value);

  }

  onRotationSpeedChanged(speed) {
    console.log('rotation speed changed ');

  }

  onScaleFactorChanged(scale) {
    console.log('onUserScaleFactorChanged ');

  }

  onCameraBoundChanged(bound) {
    console.log('onUserCameraBoundChanged ');

  }

  //--------AUDIO CONFIG
  onThresholdChanged(threshold) {
    console.log('onUserScaleFactorChanged ');

  }

  onIgnoreTimeChanged(ignoreTime) {
    console.log('onUserCameraBoundChanged ');

  }

  //-------EFFECTS Config
  onCycloneToggled() {
    console.log('onCycloneToggled ');

  }

  onWobWobToggle () {
    console.log('onWobWobToggle ');

  }

  onSwitcherooToggled() {
    console.log('onSwitcherooToggled ');

  }

  onColorShiftToggled() {
    console.log('onColorShiftToggled ');

  }

  onGlowToggled() {
    console.log('onGlowToggled ');

  }

  onShockWaveToggled() {
    console.log('onShockWaveToggled ');

  }

  //---------------ORBIT CONFIG ----------------
  onAChanged(a) {
    console.log('onAChanged ');

  }

  onBChanged(b) {
    console.log('onBChanged ');

  }

  onCChanged(c) {
    console.log('onCChanged ');

  }

  onDChanged(d) {
    console.log('onDChanged ');

  }

  onEChanged(e) {
    console.log('onEChanged ');

  }

  render() {
    // STEP 2: append props.children to the container <div> that isn't mounted anywhere yet
    return ReactDOM.createPortal(
      <div width={this.state.width} height={this.state.height}>
        <Grid>
          <Row>
            <Col sm={6} md={3}>
              <UserConfig
                userConfig={config.user}
                onSpeedChanged={this.onSpeedChanged}
                onRotationSpeedChanged={this.onRotationSpeedChanged}
                onScaleFactorChanged={this.onScaleFactorChanged}
                onCameraBoundChanged={this.onCameraBoundChanged}
                {...this.state}/>
            </Col>
            <Col sm={6} md={3}>
              <AudioConfig
                audioConfig={config.audio}
                onThresholdChanged={this.onThresholdChanged}
                onIgnoreTimeChanged={this.onIgnoreTimeChanged}
                {...this.state}/>
            </Col>
          </Row>
          <Row>
            <Col sm={6} md={3}>
              <EffectsConfig
                effectsConfig={config.effects}
                onCycloneToggled={this.onCycloneToggled}
                onWobWobToggle={this.onWobWobToggle}
                onSwitcherooToggled={this.onSwitcherooToggled}
                onColorShiftToggled={this.onColorShiftToggled}
                onGlowToggled={this.onGlowToggled}
                onShockWaveToggled={this.onShockWaveToggled}
                {...this.state}/>
            </Col>
            <Col sm={6} md={3}>
                <OrbitConfig
                  orbitConfig={config.orbit}
                  onAChanged={this.onAChanged}
                  onBChanged={this.onBChanged}
                  onCChanged={this.onCChanged}
                  onDChanged={this.onDChanged}
                  onEChanged={this.onEChanged}
                  {...this.state}/>
            </Col>
          </Row>
        </Grid>
      </div>
      ,
      this.containerEl
    );
  }
}
