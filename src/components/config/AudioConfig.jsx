
import React from 'react';


export default class AudioConfig extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      soundThreshold: this.props.audioConfig.threshold.value,
      ignoreTime: this.props.audioConfig.ignoreTime.value
    };
  }



  componentDidMount() {
    console.log("AudioConfig mounted with state of " +
    "\n soundThreshold " + this.state.soundThreshold +
    "\n ignoreTime " + this.state.ignoreTime);
  }

  componentWillUnmount() {

  }


  render() {

    return (
      <div>
        <h1> Audio Config </h1>
        <p> Threshold </p>
        <input type="range"
          min={this.props.audioConfig.threshold.min}
          max={this.props.audioConfig.threshold.max}
          value={this.props.audioConfig.threshold.value}
          step={this.props.audioConfig.threshold.step}
          onChange={this.props.onThresholdChanged}/>

        <p> Ignore Time </p>
        <input type="range"
          min={this.props.audioConfig.ignoreTime.min}
          max={this.props.audioConfig.ignoreTime.max}
          value={this.props.audioConfig.ignoreTime.value}
          step={this.props.audioConfig.ignoreTime.step}
          onChange={this.props.onIgnoreTimeChanged}/>
      </div>
    );
  }
}
