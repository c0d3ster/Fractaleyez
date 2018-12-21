import React from 'react';
import  '../main.js'; // this starts the three js stuff.
import '../styles/App.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import ConfigWindow from './config/ConfigWindow'
import ConfigSidebar from './config/ConfigSidebar'

export default class App extends React.Component {
  state = {
    configWindowVisible: false,
  }

  setConfigWindow = (show) => this.setState({ configWindowVisible: show })

  render() {
    return (
      <div>
        {this.state.configWindowVisible && <ConfigWindow onClose={() => this.setConfigWindow(false)} />}
        <ConfigSidebar 
          setConfigWindow={this.setConfigWindow} 
          configWindowVisible={this.state.configWindowVisible} />
      </div>
    );
  }
}
