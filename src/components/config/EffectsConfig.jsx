
import React from 'react';


export default class EffectsConfig extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      cyclone: this.props.effectsConfig.cyclone.value,
      wobwob: this.props.effectsConfig.wobwob.value,
      switcheroo: this.props.effectsConfig.switcheroo.value,
      colorShift: this.props.effectsConfig.colorShift.value,
      glow: this.props.effectsConfig.glow.value,
      shockwave: this.props.effectsConfig.shockwave.value
    };
  }



  componentDidMount() {
    console.log("EffectsConfig mounted");
  }

  componentWillUnmount() {

  }

  render() {

    return (
      <div>
        <h1> Effects Config </h1>
        <p> Cyclone </p>
        <input type="checkbox"
          value={this.props.effectsConfig.cyclone.value}
          onChange={this.props.onCycloneToggled}/>

        <p> Wob Wob </p>
        <input type="checkbox"
          value={this.props.effectsConfig.wobwob.value}
          onChange={this.props.onWobWobToggle}/>

        <p> Switcheroo </p>
        <input type="checkbox"
          value={this.props.effectsConfig.switcheroo.value}
          onChange={this.props.onSwitcherooToggled}/>

        <p> Color Shift </p>
        <input type="checkbox"
          value={this.props.effectsConfig.colorShift.value}
          onChange={this.props.onColorShiftToggled}/>

        <p> Glow </p>
        <input type="checkbox"
          value={this.props.effectsConfig.glow.value}
          onChange={this.props.onGlowToggled}/>

        <p> ShockWave </p>
        <input type="checkbox"
          value={this.props.effectsConfig.shockwave.value}
          onChange={this.props.onShockWaveToggled}/>
      </div>
    );
  }
}
