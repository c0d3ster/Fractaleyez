import React from 'react'
import ReactDOM from 'react-dom'
import { Grid, Row, Col } from 'react-bootstrap'

import Presets from '../presets/Presets'
import ConfigCategory from './ConfigCategory'
import { copyStyles } from '../../styles/AppStyleCopier.js'
import { connectConfig } from './context/ConfigProvider'

class ConfigWindow extends React.Component {
  externalWindow = null
  containerEl = document.createElement('div')
  state = {
    width: 200,
    height: 750
  }

  componentDidMount() {
    this.externalWindow = window.open('', '', `width=${this.state.width}, height=${this.state.height}, location=no`)
    this.externalWindow.document.title = "Configuration"
    this.externalWindow.document.body.appendChild(this.containerEl)
    this.externalWindow.addEventListener('resize', this.updateDimensions)
    this.externalWindow.addEventListener('keydown', this.onKeyDown)
    this.externalWindow.addEventListener('beforeunload', this.props.onClose)

    copyStyles(document, this.externalWindow.document)
  }

  componentWillUnmount() {
    this.externalWindow.removeEventListener('resize', this.updateDimensions)
    this.externalWindow.removeEventListener('keydown', this.onKeyDown)
    this.externalWindow.close()
  }

  updateDimensions = () => {
    this.setState({ width: this.externalWindow.innerWidth, height: this.externalWindow.innerHeight })
  }

  render = () => ReactDOM.createPortal(
    <div className='row-configuration' width={this.state.width} height={this.state.height}>
      <Grid>
        <Row>
          <Presets />
        </Row>
        <Row>
          {this.mapConfigCategories()}
        </Row>
      </Grid>
    </div>
    ,
    this.containerEl
  )

  mapConfigCategories = () => (
    Object.keys(this.props.config).map((category) => (
      <Col md={2} key={category}>
        <ConfigCategory
          name={category}
          onChange={this.props.updateConfigItem}
          isOpen={true}
          toggleOpen={() => null}/>
      </Col>
    ))
  )

  onKeyDown = (event) => {
    switch (event.keyCode) {
      // SPEED EVENTS
      case 65: // A - Lower speed
        if (window.config.user.speed.value - 8 < window.config.user.speed.min) {
          window.config.user.speed.value = window.config.user.speed.min;

          break;
        }

        window.config.user.speed.value -= 8;

        break;
      case 90: // Z - Speed to 0
        window.config.user.speed.value = 0;

        break;
      case 69: // E - Low Speed
        window.config.user.speed.value = 4;

        break;
      case 82: // R - Medium Speed
        window.config.user.speed.value = 8;

        break;
      case 84: // T - High Speed
        window.config.user.speed.value = 16;

        break;
      case 89: // Y - Highest speed
        window.config.user.speed.value = 25;

        break;

      // ROTATION EVENTS
      case 81: // Q - Fast left rotate
        window.config.user.rotationSpeed.value = -16 * (Math.random() + Math.random() + Math.random() + Math.random());

        break;
      case 83: // S - Medium left rotate
        window.config.user.rotationSpeed.value = -8 * (Math.random() + Math.random() + Math.random() + Math.random());

        break;
      case 68: // D - Low left rotate
        window.config.user.rotationSpeed.value = -1 * (Math.random() + Math.random() + Math.random() + Math.random());

        break;
      case 70: // F - Low right rotate
        window.config.user.rotationSpeed.value = (Math.random() + Math.random() + Math.random() + Math.random());

        break;
      case 71: // G - Medium right rotate
        window.config.user.rotationSpeed.value = 8 * (Math.random() + Math.random() + Math.random() + Math.random());

        break;
      case 72: // H - Fast right rotate
        window.config.user.rotationSpeed.value = 16 * (Math.random() + Math.random() + Math.random() + Math.random());

        break;

      // SCALE FACTOR EVENTS
      case 87: // W - Lowest small scale
        window.config.user.scaleFactor.value = 0;

        break;
      case 88: // X - Very small scale
        window.config.user.scaleFactor.value = 400;

        break;
      case 67: // C - Small scale
        window.config.user.scaleFactor.value = 800;

        break;
      case 86: // V - Medium scale
        window.config.user.scaleFactor.value = 1200;

        break;
      case 66: // B - High scale
        window.config.user.scaleFactor.value = 1600;

        break;
      case 78: // N - Highest scale
        window.config.user.scaleFactor.value = 2000;

        break;
      default:
        break;
    }
  }
}

export default connectConfig(ConfigWindow)
