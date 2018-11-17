
import React from 'react';


export default class OrbitConfig extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      a: this.props.orbitConfig.a.value,
      b: this.props.orbitConfig.b.value,
      c: this.props.orbitConfig.c.value,
      d: this.props.orbitConfig.d.value,
      e: this.props.orbitConfig.e.value
    };
  }



  componentDidMount() {
    console.log("OrbitConfig mounted");
  }

  componentWillUnmount() {

  }


  render() {

    return (
      <div>
      <h1> Orbit Config </h1>
      <p> A </p>
      <input type="range"
        min={this.props.orbitConfig.a.min}
        max={this.props.orbitConfig.a.max}
        value={this.props.orbitConfig.a.value}
        step={this.props.orbitConfig.a.step}
        onChange={this.props.onAChanged}/>

      <p> B </p>
      <input type="range"
        min={this.props.orbitConfig.b.min}
        max={this.props.orbitConfig.b.max}
        value={this.props.orbitConfig.b.value}
        step={this.props.orbitConfig.b.step}
        onChange={this.props.onBChanged}/>


      <p> C </p>
      <input type="range"
        min={this.props.orbitConfig.c.min}
        max={this.props.orbitConfig.c.max}
        value={this.props.orbitConfig.c.value}
        step={this.props.orbitConfig.c.step}
        onChange={this.props.onCChanged}/>


      <p> D </p>
      <input type="range"
        min={this.props.orbitConfig.d.min}
        max={this.props.orbitConfig.d.max}
        value={this.props.orbitConfig.d.value}
        step={this.props.orbitConfig.d.step}
        onChange={this.props.onDChanged}/>

      <p> E </p>
        <input type="range"
          min={this.props.orbitConfig.e.min}
          max={this.props.orbitConfig.e.max}
          value={this.props.orbitConfig.e.value}
          step={this.props.orbitConfig.e.step}
          onChange={this.props.onEChanged}/>
      </div>
    );
  }
}
