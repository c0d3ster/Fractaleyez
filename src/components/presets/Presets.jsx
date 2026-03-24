import React from 'react'
import { Row, Col } from 'react-bootstrap'
import './Presets.css'

import { connectConfig } from '../config/context/ConfigProvider'

const Presets = ({ retrieveConfigPreset }) => (
  <Row>
    <Col className='presets-container'>
      <button onClick={retrieveConfigPreset}>Default</button>
      <button onClick={retrieveConfigPreset}>Kaiber</button>
      <button onClick={retrieveConfigPreset}>Edge Chase Spin</button>
      <button onClick={retrieveConfigPreset}>Dispersion Tunnel Spin</button>
      <button onClick={retrieveConfigPreset}>Crossheir Spin</button>
      <button onClick={retrieveConfigPreset}>Pointerz</button>
      <button onClick={retrieveConfigPreset}>Galaxy Space</button>
      <button onClick={retrieveConfigPreset}>Galaxy Salad</button>
      <button onClick={retrieveConfigPreset}>Galaxy Portal</button>
      <button onClick={retrieveConfigPreset}>Galaxy Spiral</button>
      <button onClick={retrieveConfigPreset}>Color Portal</button>
      <button onClick={retrieveConfigPreset}>Oh Sprite</button>
      <button onClick={retrieveConfigPreset}>Eye Chase</button>
      <button onClick={retrieveConfigPreset}>Side Swirl</button>
      <button onClick={retrieveConfigPreset}>Circles</button>
      <button onClick={retrieveConfigPreset}>Square Mandala</button>
      <button onClick={retrieveConfigPreset}>Notes</button>
      <button onClick={retrieveConfigPreset}>Note Explosion</button>
      <button onClick={retrieveConfigPreset}>Fire</button>
      <button onClick={retrieveConfigPreset}>Weed</button>
      <button onClick={retrieveConfigPreset}>Chopping Hands</button>
      <button onClick={retrieveConfigPreset}>Slime Hands</button>
      <button onClick={retrieveConfigPreset}>Honeycomb</button>
      <button onClick={retrieveConfigPreset}>Blackout</button>
      <button onClick={retrieveConfigPreset}>Emorfik</button>
      <button onClick={retrieveConfigPreset}>Emorfik Intro Jumpy</button>
      <button onClick={retrieveConfigPreset}>Emorfik Zombie Wave</button>
      <button onClick={retrieveConfigPreset}>Emorfik Wire White</button>
      <button onClick={retrieveConfigPreset}>Emorfik Wire</button>
      <button onClick={retrieveConfigPreset}>Emorfik Wire Logo</button>
      <button onClick={retrieveConfigPreset}>Emorfik Fire</button>
      <button onClick={retrieveConfigPreset}>Emorfik Skull</button>
      <button onClick={retrieveConfigPreset}>Emorfik Skull Vid</button>
      <button onClick={retrieveConfigPreset}>Hyper Emorfik</button>
      <button onClick={retrieveConfigPreset}>Emorfik Spin</button>
      <button onClick={retrieveConfigPreset}>Emorfik Salad Color</button>
      <button onClick={retrieveConfigPreset}>Emorfik Salad</button>
    </Col>
  </Row>
)

export default connectConfig(Presets)
