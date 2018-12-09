import React from 'react';
import { Grid, Row, Col, } from 'react-bootstrap';
import '../../sidebar/sidebar.css';

import ConfigCategory from './ConfigCategory';
import config from '../../config/configuration.js';

export default class ConfigSidebar extends React.Component {
  toggleSidebar = () => {
    if(this.$sidebar.hasClass('slide-in')) {
      this.$sidebar.removeClass('slide-in');
      this.$sidebar.addClass('slide-out');
    }
    else {
      this.$sidebar.addClass('slide-in');
      this.$sidebar.removeClass('slide-out');
    }
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
    return (
      <div className='sidebar-container'>
        <Grid bsClass='sidebar-content slide-out'>
          <Row>
            <h2 className='sidebar-title'>Configuration</h2>
          </Row>
          {this.mapConfigCategories()}
        </Grid>

      </div>
    );
  }

  mapConfigCategories = () => (
    Object.keys(config).map((category) => (
      <Row  key={category}>
        <Col sm={6} md={3}>
          <ConfigCategory
            name={category}
            data={config[category]}
            onChange={this.handleConfigFileChange}/>
        </Col>
      </Row>
    ))
  )
}
