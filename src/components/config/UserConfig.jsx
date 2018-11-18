import React from 'react';

export default class UserConfig extends React.Component {
  componentWillUnmount() {

  }

  componentDidUpdate() {
    console.log(this.props.userConfig.speed.value)
  }

  render() {
    return (
      <div>
      <h1> User Config </h1>
      <p> Speed </p>
      <input type="range"
        min={this.props.userConfig.speed.min}
        max={this.props.userConfig.speed.max}
        defaultValue={this.props.speedValue}
        step={this.props.userConfig.speed.step}
        onChange={(e) => this.props.onSpeedChanged(e)}/>

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
