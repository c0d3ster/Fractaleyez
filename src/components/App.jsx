import React from 'react';
import Header from './Header.jsx';

import '../styles/App.css';
//SHOULD ADD CSS FOR HAVING THE HEADER SLIDE IN AND OUT LIKE THE SIDEBAR DOES With a DEFAULT STATE OF HIDDEN
import  '../main.js';

import ConfigWindow from './ConfigWindow.jsx';

export default class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      showConfig: false, //SHOULD STILL INITALLY KEEP CONFIG IN SAME WINDOW AND ADD BUTTON TO DETACH IT TO NEW WINDOW
      counter: 0,
      showConfigWindow: false,
    };

    this.toggleConfigWindow = this.toggleConfigWindow.bind(this);
  }

  componentDidMount() {
    window.setInterval(() => {
      this.setState(state => ({
        ...state,
        counter: state.counter + 1,
      }));
    }, 1000);
  }

  toggleConfigWindow() {
    this.setState(state => ({
      ...state,
      showConfigWindow: !state.showConfigWindow,
    }));
  }

  render() {
    return (
      <div>
        <Header
        onConfigClicked={this.toggleConfigWindow}
        {...this.state}/>

        <h1>Counter: {this.state.counter}</h1>


        {this.state.showConfigWindow && (
          <ConfigWindow>
            <h1>Counter in a portal: {this.state.counter}</h1>
            <p>Even though I render in a different window, I share state!</p>

          </ConfigWindow>
        )}
      </div>
    );
  }
}
