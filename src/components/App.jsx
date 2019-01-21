import React from 'react';
import axios from 'axios';
import  '../main.js'; // this starts the three js stuff.
import '../styles/App.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import { ConfigProvider } from './config/context/ConfigProvider'
import ConfigWindow from './config/ConfigWindow'
import Sidebar from './sidebar/Sidebar'

export default class App extends React.Component {
  state = {
    configWindowVisible: false,
  }

  setConfigWindow = async (show) => {
    // this.setState({ configWindowVisible: show })

    const res = await axios.get("/api/getUsername");
    console.log(res)
  }

  render() {
    return (
      <ConfigProvider>
        <div>
          {this.state.configWindowVisible && <ConfigWindow onClose={() => this.setConfigWindow(false)} />}
          <Sidebar 
            setConfigWindow={this.setConfigWindow} 
            configWindowVisible={this.state.configWindowVisible} />
        </div>
      </ConfigProvider>
    );
  }
}
