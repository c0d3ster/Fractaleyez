import React from 'react';
import '../styles/App.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import { initWithMicrophone } from '../main'
import { connectConfig } from './config/context/ConfigProvider'
import ConfigWindow from './config/ConfigWindow'
import Sidebar from './sidebar/Sidebar'

class App extends React.Component {
  state = {
    configWindowVisible: false,
  }

  componentDidMount() {
    window.config = this.props.config
    initWithMicrophone()
  }

  setConfigWindow = async (show) => {
    this.setState({ configWindowVisible: show })
  }

  render() {
    return (
        <div>
          {this.state.configWindowVisible && <ConfigWindow onClose={() => this.setConfigWindow(false)} />}
          <Sidebar 
            setConfigWindow={this.setConfigWindow} 
            configWindowVisible={this.state.configWindowVisible} />
        </div>
    );
  }
}

export default connectConfig(App)
