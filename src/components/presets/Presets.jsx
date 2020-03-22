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
          <button onClick={this.props.retrieveConfigPreset}>pointerz</button>            
          <button onClick={this.props.retrieveConfigPreset}>galaxySpace</button>
          <button onClick={this.props.retrieveConfigPreset}>galaxySalad</button>
          <button onClick={this.props.retrieveConfigPreset}>colorPortal</button>
          <button onClick={this.props.retrieveConfigPreset}>ohSprite</button>
          <button onClick={this.props.retrieveConfigPreset}>eyeChase</button>
          <button onClick={this.props.retrieveConfigPreset}>sideSwirl</button> 
          <button onClick={this.props.retrieveConfigPreset}>circles</button>
          <button onClick={this.props.retrieveConfigPreset}>weed</button>              
          <button onClick={this.props.retrieveConfigPreset}>bassyndicate</button>
          </div>
        </Col>
      </Row>
    )
  }
}

export default connectConfig(Presets)
