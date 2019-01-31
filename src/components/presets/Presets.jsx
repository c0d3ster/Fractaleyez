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
            <button onClick={this.props.retrieveConfigPreset}>galaxySpace</button>
          </div>
        </Col>
      </Row>
    )
  }
}

export default connectConfig(Presets)
