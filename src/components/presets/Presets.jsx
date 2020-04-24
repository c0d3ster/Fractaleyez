import React from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'

class Presets extends React.Component {
  render() {
    return(
      <Row>
        <Col className='presets-container'>
          <button onClick={this.props.retrieveConfigPreset}>Default</button>
          <button onClick={this.props.retrieveConfigPreset}>Edge Chase Spin</button>
          <button onClick={this.props.retrieveConfigPreset}>Dispersion Tunnel Spin</button>
          <button onClick={this.props.retrieveConfigPreset}>Crossheir Spin</button>  
          <button onClick={this.props.retrieveConfigPreset}>Pointerz</button>            
          <button onClick={this.props.retrieveConfigPreset}>Galaxy Space</button>
          <button onClick={this.props.retrieveConfigPreset}>Galaxy Salad</button>
          <button onClick={this.props.retrieveConfigPreset}>Galaxy Portal</button>
          <button onClick={this.props.retrieveConfigPreset}>Color Portal</button>
          <button onClick={this.props.retrieveConfigPreset}>Oh Sprite</button>
          <button onClick={this.props.retrieveConfigPreset}>Eye Chase</button>
          <button onClick={this.props.retrieveConfigPreset}>Side Swirl</button> 
          <button onClick={this.props.retrieveConfigPreset}>Circles</button>
          <button onClick={this.props.retrieveConfigPreset}>Square Mandala</button>
          <button onClick={this.props.retrieveConfigPreset}>Notes</button>
          <button onClick={this.props.retrieveConfigPreset}>Note Explosion</button>
          <button onClick={this.props.retrieveConfigPreset}>Fire</button>    
          <button onClick={this.props.retrieveConfigPreset}>Weed</button>    
          {/*<button onClick={this.props.retrieveConfigPreset}>Actual Garbage</button>   
          <button onClick={this.props.retrieveConfigPreset}>Actual Garbage Salad</button>   
          <button onClick={this.props.retrieveConfigPreset}>Actual Garbage Spin</button>   
          <button onClick={this.props.retrieveConfigPreset}>Hyper Actual Garbage</button>               
          <button onClick={this.props.retrieveConfigPreset}>Garbage Monsters</button>
          <button onClick={this.props.retrieveConfigPreset}>Garbage Man</button> 
          <button onClick={this.props.retrieveConfigPreset}>Snikka</button>   
          <button onClick={this.props.retrieveConfigPreset}>Snikka Salad</button>   
          <button onClick={this.props.retrieveConfigPreset}>Snikka Spin</button>   
          <button onClick={this.props.retrieveConfigPreset}>Hyper Snikka</button>
          <button onClick={this.props.retrieveConfigPreset}>Snikka Trippy</button>*/}
          <button onClick={this.props.retrieveConfigPreset}>Drezza</button>   
          <button onClick={this.props.retrieveConfigPreset}>Drezza Salad</button>   
          <button onClick={this.props.retrieveConfigPreset}>Drezza Spin</button>   
          <button onClick={this.props.retrieveConfigPreset}>Hyper Drezza</button>
          <button onClick={this.props.retrieveConfigPreset}>Drezza Transmission</button>
          <button onClick={this.props.retrieveConfigPreset}>Be In</button>   
          <button onClick={this.props.retrieveConfigPreset}>Be In Spin</button>
          <button onClick={this.props.retrieveConfigPreset}>Hyper Be In</button>                                            
          <button onClick={this.props.retrieveConfigPreset}>Bassyndicate</button>
        </Col>
      </Row>
    )
  }
}

export default connectConfig(Presets)
