import React from 'react';
import ReactDOM from 'react-dom';
import UserConfig from './UserConfig.jsx';
import ConfigCategory from './ConfigCategory'


import { Grid, Row, Col, } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';


import copyStyles from '../../styles/AppStyleCopier.js';

import config from '../../config/configuration.js';


export default class ConfigWindow extends React.Component {
  externalWindow = null;
  containerEl = document.createElement('div');
  state = {
    width:  600,
    height: 400
  };

  //SHOULD STILL INITALLY KEEP CONFIG IN SAME WINDOW AND ADD BUTTON TO DETACH IT TO NEW WINDOW

  componentDidMount() {
    this.externalWindow = window.open('', '', 'width=' + this.state.width + ',height=' + this.state.height);
    this.externalWindow.document.body.appendChild(this.containerEl);
    this.externalWindow.addEventListener("resize", this.updateDimensions);

    copyStyles(document, this.externalWindow.document);
  }

  componentWillUnmount() {
    this.externalWindow.removeEventListener("resize", this.updateDimensions);
    this.externalWindow.close();
  }

  /**
   * Calculate & Update state of new dimensions
   */
  updateDimensions = () => {
    console.log('updating dimensions');
    this.setState({ width: this.externalWindow.innerWidth, height: this.externalWindow.innerHeight });
  }

  onSpeedChanged = (event) => {
    console.log(event.target)
    config.user.speed.value = event.target.value;
    this.externalWindow.console.log('speed changed ' + event.target.value);
  }

  handleConfigChange = (category, event) => {
    const { name, value } = event.target
    config[category][name].value = value
  }

  render() {
    return ReactDOM.createPortal(
      <div width={this.state.width} height={this.state.height}>
        <Grid>
          <Row>
            <Col sm={6} md={3}>
              <UserConfig
                userConfig={config.user}
                speedValue={config.user.speed.value}
                onSpeedChanged={this.onSpeedChanged}
                onRotationSpeedChanged={this.onRotationSpeedChanged}
                onScaleFactorChanged={this.onScaleFactorChanged}
                onCameraBoundChanged={this.onCameraBoundChanged}
                {...this.state}/>
            </Col>
            <Col sm={6} md={3}>
              <ConfigCategory 
                name="User"
                data={config.user}
                onChange={this.handleConfigChange}/>
            </Col>
          </Row>
        </Grid>
      </div>
      ,
      this.containerEl
    );
  }
}
