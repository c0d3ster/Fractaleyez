import React from 'react'
import '../styles/App.css'
import 'bootstrap/dist/css/bootstrap.min.css'

import { initWithMicrophone } from '../main'
import { connectConfig } from './config/context/ConfigProvider'
import ConfigWindow from './config/ConfigWindow'
import Sidebar from './sidebar/Sidebar'

class App extends React.Component {
  state = {
    configWindowVisible: false,
  }

  componentDidMount() {
    initWithMicrophone()
  }

  setConfigWindow = async () => {
    this.setState({ configWindowVisible: !this.state.configWindowVisible})
  }

  render() {
    return (
        <div>
          {this.state.configWindowVisible && <ConfigWindow onClose={this.setConfigWindow} />}
          <Sidebar 
            setConfigWindow={this.setConfigWindow} 
            configWindowVisible={this.state.configWindowVisible} />
        </div>
    )
  }
}

export default connectConfig(App)
