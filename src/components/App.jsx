import React from 'react';
import Header from './Header.jsx';

import '../styles/App.css';
//SHOULD ADD CSS FOR HAVING THE HEADER SLIDE IN AND OUT LIKE THE SIDEBAR DOES With a DEFAULT STATE OF HIDDEN
import  '../main.js'; // this starts the three js stuff.

import ConfigWindow from './config/ConfigWindow.jsx';

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
      </div>
    );
  }
}
