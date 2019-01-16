import React, { Component } from 'react'
import PropTypes from 'prop-types'

import configDefaults from "../../../config/configuration"

const ConfigContext = React.createContext()

const connectConfig = WrappedComponent => props => (
  <ConfigContext.Consumer>
    {context => <WrappedComponent {...props} {...context} />}
  </ConfigContext.Consumer>
)

class ConfigProvider extends Component {
  constructor(props) {
    super(props)
    this.state = {
      config: configDefaults,
      updateConfigItem: this.updateConfigItem,
      updateConfigPreset: this.updateConfigPreset
    }
  }

  updateConfigItem = (category, item, value) => {
    const camelItem = this.titleToCamelCase(item)
    const camelCategory = this.titleToCamelCase(category)

    if(this.state.config[camelCategory][camelItem].type == "slider") {
      value = parseFloat(value);
    }
    
    this.setState((prevState) => {
      return {
        config: {
          [camelCategory]: {
            [camelItem]: value,
            ...prevState.config[camelCategory]
          },
          ...prevState.config
        },
        ...prevState
      }
    })
  }

  updateConfigPreset = (presetObject) => {
    this.setState((prevState) => {
      return {
        config: presetObject,
        ...prevState
      }
    })
  }

  render() {
    return (
      <ConfigContext.Provider value={this.state}>
        {this.props.children}
      </ConfigContext.Provider>
    )
  }
}

ConfigProvider.propTypes = {
  config: PropTypes.object,
  updateConfigItem: PropTypes.func,
  updateConfigPreset: PropTypes.func
}

export {
  connectConfig,
  ConfigProvider,
}
