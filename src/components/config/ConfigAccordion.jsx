import React from 'react'
import { Row, Col } from 'react-bootstrap';

import ConfigCategory from '../config/ConfigCategory';
import configFile from '../../config/configuration';
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
  
  render() {
    return(
      Object.keys(configFile).map((category) => (
        <Row key={category}>
          <Col>
            <ConfigCategory
              name={category}
              onChange={this.props.updateConfigItem}
              isOpen={this.isCategoryOpen(category)}
              toggleOpen={this.toggleOpen} />
          </Col>
        </Row>
      ))
    )
  }
}

export default connectConfig(ConfigAccordion)
