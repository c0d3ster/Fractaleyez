import React from 'react';
import ReactDOM from 'react-dom';
import { Grid, Row, Col } from 'react-bootstrap';

import ConfigCategory from './ConfigCategory';
import copyStyles from '../../styles/AppStyleCopier.js';
import config from '../../config/configuration.js';

export default class ConfigWindow extends React.Component {
  externalWindow = null;
  containerEl = document.createElement('div');
  state = {
    width:  1200,
    height: 600
  };

  componentDidMount() {
    this.externalWindow = window.open('', '', `width=${this.state.width}, height=${this.state.height}, location=no`);
    this.externalWindow.document.title = "Configuration";
    this.externalWindow.document.body.appendChild(this.containerEl);
    this.externalWindow.addEventListener('resize', this.updateDimensions);
    this.externalWindow.addEventListener('beforeunload', this.props.onClose)

    copyStyles(document, this.externalWindow.document);
  }

  componentWillUnmount() {
    this.externalWindow.removeEventListener('resize', this.updateDimensions);
    this.externalWindow.close();
  }

  updateDimensions = () => {
    this.setState({ width: this.externalWindow.innerWidth, height: this.externalWindow.innerHeight });
  }

  handleConfigFileChange = (category, item, value) => {
    const camelItem = this.titleToCamelCase(item)
    const camelCategory = this.titleToCamelCase(category)

    config[camelCategory][camelItem].value = value
  }

  titleToCamelCase = (string) => (
    string.toLowerCase().trim().split(/[.\-_\s]/g)
      .reduce((string, word) => string + word[0].toUpperCase() + word.slice(1))
  )

  render() {
    return ReactDOM.createPortal(
      <div width={this.state.width} height={this.state.height}>
        <Grid>
          <Row>
            {this.mapConfigCategories()}
          </Row>
        </Grid>
      </div>
      ,
      this.containerEl
    );
  }

  mapConfigCategories = () => (
    Object.keys(config).map((category) => (
      <Col sm={3} key={category}>
        <ConfigCategory
          name={category}
          data={config[category]}
          onChange={this.handleConfigFileChange}
          isOpen={true}
          toggleOpen={() => {return null}}/>
      </Col>
    ))
  )
}
