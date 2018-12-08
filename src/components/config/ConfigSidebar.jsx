import React from 'react';
import { Grid, Row, Col, } from 'react-bootstrap';

import ConfigCategory from './ConfigCategory';
import config from '../../config/configuration.js';

export default class ConfigSidebar extends React.Component {
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
    return (
      <Grid>
        <Row>
          {this.mapConfigCategories()}
        </Row>
      </Grid>
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
