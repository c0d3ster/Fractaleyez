import React from 'react';
import ReactDOM from 'react-dom';
import { Grid, Row, Col, } from 'react-bootstrap';

import ConfigCategory from './ConfigCategory';
import copyStyles from '../../styles/AppStyleCopier.js';
import config from '../../config/configuration.js';

export default class ConfigWindow extends React.Component {
  externalWindow = null;
  containerEl = document.createElement('div');
  state = {
    width:  1200,
    height: 420
  };

  //TODO SHOULD STILL INITALLY KEEP CONFIG IN SAME WINDOW AND ADD BUTTON TO DETACH IT TO NEW WINDOW

  componentDidMount() {
    this.externalWindow = window.open('', '', 'width=' + this.state.width + ',height=' + this.state.height);
    this.externalWindow.document.body.appendChild(this.containerEl);
    this.externalWindow.addEventListener("resize", this.updateDimensions);

    copyStyles(document, this.externalWindow.document);
  }

  componentWillUnmount() {
    this.externalWindow.removeEventListener("resize", this.updateDimensions);
    this.externalWindow.close();
  }

  updateDimensions = () => {
    console.log('updating dimensions');
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
      <Col sm={6} md={3} key={category}>
        <ConfigCategory
          name={category}
          data={config[category]}
          onChange={this.handleConfigFileChange}/>
      </Col>
    ))
  )
}
