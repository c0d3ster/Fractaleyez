import React, { Component } from 'react'
import PropTypes from 'prop-types'
import axios from 'axios'

import configDefaults from "../../../config/configDefaults"
// import { presets } from '../../../config/presets'

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
      saveConfig: this.saveConfig,
      retrieveConfigPreset: this.retrieveConfigPreset,
      resetConfig: this.resetConfig
    }
    window.config = this.state.config
  }

  componentDidMount() {
    console.log('mounted')
    /* const localPresets = JSON.parse(localStorage.getItem('presets'))

    if (!localPresets || presets.length > localPresets.length) {
      localStorage.setItem('presets', JSON.stringify(presets))
    }*/
  }

  titleToCamelCase = (string) => (
    string.toLowerCase().trim().split(/[.\-_\s]/g)
      .reduce((string, word) => string + word[0].toUpperCase() + word.slice(1))
  )

  updateConfigItem = (category, item, value) => {
    const camelItem = this.titleToCamelCase(item)
    const camelCategory = this.titleToCamelCase(category)

    if(this.state.config[camelCategory][camelItem].type === "slider") {
      value = parseFloat(value)
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

  saveConfig = async (name, config) => {
    try {
      const key = this.titleToCamelCase(name)

      const result = await axios.post(`/api/saveConfig/${key}`, { config, name })
      console.log(result.data)
    } catch (error) {
      const errorMessage = error.message
      console.error( `Error saving ${name} preset: ${errorMessage}`)
      return
    }
  }

  retrieveConfigPreset = async (event) => {
    let config

    try {
      const name = event.target.innerHTML
      const key = this.titleToCamelCase(name)
      config = this.retrieveCachedPreset(key)

      if (!config) {
        const result = await axios.get(`/api/getConfig/${key}`)
        console.log(result.data)
        config = result.data
      }

    } catch (error) {
      const errorMessage = error.message
      console.error( `Error retrieving ${name} preset: ${errorMessage}`)
      return
    }
    
    this.setState({ config }, () => window.config = this.state.config)
  }

  retrieveCachedPreset = (key) => JSON.parse(localStorage.getItem('presets'))[key]

  resetConfig = async () => this.retrieveConfigPreset('default')

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
