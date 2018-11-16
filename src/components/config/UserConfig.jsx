
import React from 'react';
import { Image, Navbar, NavItem, Nav } from 'react-bootstrap';


export default class UserConfig extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      speed: this.props.userConfig.speed.value,
      rotationSpeed: this.props.userConfig.rotationSpeed.value,
      scaleFactor: this.props.userConfig.scaleFactor.value,
      cameraBound: this.props.userConfig.cameraBound.value
    };
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
      rotationSpeed: this.props.userConfig.rotationSpeed.value,
      scaleFactor: this.props.userConfig.scaleFactor.value,
      cameraBound: this.props.userConfig.cameraBound.value
    });
  }

  render() {

    return (
      <div>
      <h1> User </h1>
      <p> Speed </p>
      <input type="range"
        min={this.props.userConfig.speed.min}
        max={this.props.userConfig.speed.max}
        value={this.props.userConfig.speed.value}
        onChange={this.props.onUserSpeedChanged}/>
      </div>
    );
  }
}
