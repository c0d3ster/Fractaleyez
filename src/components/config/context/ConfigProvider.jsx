import React, { Component } from 'react'
import PropTypes from 'prop-types'
import axios from 'axios'

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
      updateConfigPreset: this.updateConfigPreset,
      resetConfig: this.resetConfig
    }
  }

  titleToCamelCase = (string) => (
    string.toLowerCase().trim().split(/[.\-_\s]/g)
      .reduce((string, word) => string + word[0].toUpperCase() + word.slice(1))
  )

  updateConfigItem = (category, item, value) => {
    const camelItem = this.titleToCamelCase(item)
    const camelCategory = this.titleToCamelCase(category)

    if(this.state.config[camelCategory][camelItem].type == "slider") {
      value = parseFloat(value);
    }
    
    configDefaults[camelCategory][camelItem].value = value // update static file for three context
    
    this.setState((prevState) => { // update state for React context
      return {
        config: {
          [camelCategory]: {
            [camelItem]: value,
            ...prevState.config[camelCategory]
          },
          ...prevState.config
        }
      }
    })
    console.log(configDefaults[camelCategory][camelItem].value, this.state.config[camelCategory][camelItem])
  }

  updateConfigPreset = (presetObject) => {
    this.setState({
        config: presetObject
    })
  }

  resetConfig = async () => {
    const { data: config } = await axios.get("/api/getConfigDefaults");
    this.setState({ config })

    Object.keys(config).map( (category) => {
      configDefaults[category] = config[category]
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
  ConfigContext,
  ConfigProvider,
  connectConfig,
}
