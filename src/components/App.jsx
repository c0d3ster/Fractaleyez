import React from 'react';
import  '../main.js'; // this starts the three js stuff.
import '../styles/App.css';


import Header from './Header.jsx';
import ConfigWindow from './config/ConfigWindow'
import ConfigSidebar from './config/ConfigSidebar'

export default class App extends React.Component {
  state = {
    showConfig: false, //SHOULD STILL INITALLY KEEP CONFIG IN SAME WINDOW AND ADD BUTTON TO DETACH IT TO NEW WINDOW
    showConfigWindow: false,
  }

  toggleConfigWindow = () => {
    this.setState(state => ({
      showConfigWindow: !state.showConfigWindow,
    }));
  }

  render() {
    return (
      <div>
        <Header onConfigClicked={this.toggleConfigWindow} />
        {this.state.showConfigWindow && <ConfigWindow/>}
        <ConfigSidebar />
      </div>
    );
  }
}
