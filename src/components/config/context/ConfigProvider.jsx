import React, { Component } from 'react'
import PropTypes from 'prop-types'
import axios from 'axios'

import configDefaults from "../../../configDefaults/configDefaults"

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
      retrieveConfigPreset: this.retrieveConfigPreset,
      resetConfig: this.resetConfig
    }
    window.config = this.state.config
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
    
    this.setState((prevState) => { // update state for React context
      return {
        config: {
          ...prevState.config,
          [camelCategory]: {
            ...prevState.config[camelCategory],
            [camelItem]: {
              ...prevState.config[camelCategory][camelItem],
              value
            },
          },
        }
      }
    }, () => {
      window.config = this.state.config
    })
  }

  retrieveConfigPreset = async (event) => {
    let config
    let name
    try {
      name = event.target.innerHTML;
      const result = await axios.get(`/api/getConfig/${name}`);
      config = result.data
    } catch (error) {
      const errorMessage = error.response.data || error.message
      console.error( `Error retrieving ${name} preset: ${errorMessage}`)
      return
    }

    this.setState({ config }, () => window.config = this.state.config)
  }

  resetConfig = async () => {
    let config
    try {
      const result = await axios.get(`/api/getConfigDefaults`);
      config = result.data
    } catch (error) {
      const errorMessage = error.response.data || error.message
      console.error( `Error retrieving ${name} preset: ${errorMessage}`)
      return
    }

    this.setState({ config }, () => window.config = this.state.config)
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
  ConfigProvider,
  connectConfig,
}
