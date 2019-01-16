import React from 'react'
import { Row, Col } from 'react-bootstrap';

import ConfigCategory from '../config/ConfigCategory';
import config from '../../config/configuration.js';
import { connectConfig } from './context/ConfigProvider';

class ConfigAccordion extends React.Component {
  state = {
    openCategories: ['user']
  }

  toggleOpen = (id) => {
    const { canOpenMultiple } = this.props
    const { openCategories } = this.state

    const index = openCategories.indexOf(id)
    if (canOpenMultiple && index === -1) {
      this.setState((prevState) => ({
        openCategories: [...prevState.openCategories, id],
      }))
    } else if (index === -1) {
      this.setState({
        openCategories: [id],
      })
    } else {
      this.setState((prevState) => ({
        openCategories: prevState.openCategories.slice(0, index).concat(prevState.openCategories.slice(index + 1)),
      }))
    }
  }

  isCategoryOpen = (category) => this.state.openCategories.indexOf(category) !== -1

  handleConfigFileChange = (category, item, value) => {
    const camelItem = this.titleToCamelCase(item)
    const camelCategory = this.titleToCamelCase(category)

    if(config[camelCategory][camelItem].type == "slider") {
      value = parseFloat(value);
    }
    config[camelCategory][camelItem].value = value
    console.log(this.props.updateConfigItem, this.props.config)
  }

  titleToCamelCase = (string) => (
    string.toLowerCase().trim().split(/[.\-_\s]/g)
      .reduce((string, word) => string + word[0].toUpperCase() + word.slice(1))
  )
  
  render() {
    return(
      Object.keys(config).map((category) => (
        <Row key={category}>
          <Col>
            <ConfigCategory
              name={category}
              data={config[category]}
              onChange={this.handleConfigFileChange}
              isOpen={this.isCategoryOpen(category)}
              toggleOpen={this.toggleOpen} />
          </Col>
        </Row>
      ))
    )
  }
}

export default connectConfig(ConfigAccordion)
