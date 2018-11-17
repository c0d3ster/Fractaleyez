
import React from 'react';


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
      <h1> User Config </h1>
      <p> Speed </p>
      <input type="range"
        min={this.props.userConfig.speed.min}
        max={this.props.userConfig.speed.max}
        value={this.props.userConfig.speed.value}
        step={this.props.userConfig.speed.step}
        onChange={this.props.onSpeedChanged}/>

      <p> Rotation Speed </p>
      <input type="range"
        min={this.props.userConfig.rotationSpeed.min}
        max={this.props.userConfig.rotationSpeed.max}
        value={this.props.userConfig.rotationSpeed.value}
        step={this.props.userConfig.rotationSpeed.step}
        onChange={this.props.onRotationSpeedChanged}/>


      <p> Scale Factor </p>
      <input type="range"
        min={this.props.userConfig.scaleFactor.min}
        max={this.props.userConfig.scaleFactor.max}
        value={this.props.userConfig.scaleFactor.value}
        step={this.props.userConfig.scaleFactor.step}
        onChange={this.props.onScaleFactorChanged}/>


      <p> Camera Bound </p>
      <input type="range"
        min={this.props.userConfig.cameraBound.min}
        max={this.props.userConfig.cameraBound.max}
        value={this.props.userConfig.cameraBound.value}
        step={this.props.userConfig.cameraBound.step}
        onChange={this.props.onCameraBoundChanged}/>
      </div>
    );
  }
}
