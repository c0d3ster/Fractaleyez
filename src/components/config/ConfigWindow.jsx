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
    width:  1200,
    height: 750
  }

  componentDidMount() {
    this.externalWindow = window.open('', '', `width=${this.state.width}, height=${this.state.height}, location=no`)
    this.externalWindow.document.title = "Configuration"
    this.externalWindow.document.body.appendChild(this.containerEl)
    this.externalWindow.addEventListener('resize', this.updateDimensions)
    this.externalWindow.addEventListener('beforeunload', this.props.onClose)

    copyStyles(document, this.externalWindow.document)
  }

  componentWillUnmount() {
    this.externalWindow.removeEventListener('resize', this.updateDimensions)
    this.externalWindow.close()
  }

  updateDimensions = () => {
    this.setState({ width: this.externalWindow.innerWidth, height: this.externalWindow.innerHeight })
  }

  render = () => ReactDOM.createPortal(
    <div width={this.state.width} height={this.state.height}>
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
      <Col sm={2} key={category}>
        <ConfigCategory
          name={category}
          onChange={this.props.updateConfigItem}
          isOpen={true}
          toggleOpen={() => null}/>
      </Col>
    ))
  )
}

export default connectConfig(ConfigWindow)
