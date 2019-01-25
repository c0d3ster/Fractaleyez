import React from 'react';
import  '../main.js'; // this starts the three js stuff.
import '../styles/App.css';
import 'bootstrap/dist/css/bootstrap.min.css';


import ConfigWindow from './config/ConfigWindow'
import Sidebar from './sidebar/Sidebar'

export default class App extends React.Component {
  state = {
    configWindowVisible: false,
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
