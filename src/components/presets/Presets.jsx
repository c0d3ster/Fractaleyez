import React from 'react'
import { Row, Col } from 'react-bootstrap';
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'

class Presets extends React.Component {
  

  render() {
    return(
      <Row>
        <Col>
          <div className='presets-container'>
          <button onClick={this.props.retrieveConfigPreset}>default</button>
          <button onClick={this.props.retrieveConfigPreset}>edgeChaseSpin</button>
          <button onClick={this.props.retrieveConfigPreset}>dispersionTunnelSpin</button>
          <button onClick={this.props.retrieveConfigPreset}>crossheirSpin</button>            
          <button onClick={this.props.retrieveConfigPreset}>galaxySpace</button>
          <button onClick={this.props.retrieveConfigPreset}>ohSprite</button>
          <button onClick={this.props.retrieveConfigPreset}>eyeChase</button>
          <button onClick={this.props.retrieveConfigPreset}>sideSwirl</button>
          <button onClick={this.props.retrieveConfigPreset}>bassPhysics</button>
          <button onClick={this.props.retrieveConfigPreset}>bassyndicate</button>
          </div>
        </Col>
      </Row>
    )
  }
}

export default connectConfig(Presets)
