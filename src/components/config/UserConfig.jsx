
import React from 'react';
import { Image, Navbar, NavItem, Nav } from 'react-bootstrap';

import config from '../../config/configuration.js';

export default class UserConfig extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      speed: config.user.speed.value,
      rotationSpeed: config.user.rotationSpeed.value,
      scaleFactor: config.user.scaleFactor.value,
      cameraBound: config.user.cameraBound.value
    };

    this.onSpeedChanged = this.onSpeedChanged.bind(this);
  }



  componentDidMount() {
    console.log("UserConfig mounted with state of " +
    "\n speed " + this.state.speed +
    "\n rotation speed " + this.state.rotationSpeed);
  }

  componentWillUnmount() {

  }

  onSpeedChanged(event) {
    console.log('onSpeedChanged: new value = ' + event.target.value);
    this.setState({
      speed: event.target.value,
      rotationSpeed: config.user.rotationSpeed.value,
      scaleFactor: config.user.scaleFactor.value,
      cameraBound: config.user.cameraBound.value
    });
  }

  render() {

    return (
      <div>
      <h1> User </h1>
      <p> Speed </p>
      <input orient="vertical" type="range" min={config.user.speed.min} max={config.user.speed.max} value={config.user.speed.value} onChange={this.onSpeedChanged}/>
      </div>
    );
  }
}
