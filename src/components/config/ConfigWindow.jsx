import React from 'react';
import ReactDOM from 'react-dom';
import UserConfig from './UserConfig.jsx';

import copyStyles from '../../styles/AppStyleCopier.js';

import config from '../../config/configuration.js';


export default class ConfigWindow extends React.PureComponent {
  constructor(props) {
    super(props);
    // STEP 1: create a container <div>
    this.containerEl = document.createElement('div');
    this.externalWindow = null;
  }

  //SHOULD STILL INITALLY KEEP CONFIG IN SAME WINDOW AND ADD BUTTON TO DETACH IT TO NEW WINDOW

  componentDidMount() {
    // STEP 3: open a new browser window and store a reference to it
    this.externalWindow = window.open('', '', 'width=600,height=400,left=200,top=200');

    // STEP 4: append the container <div> (that has props.children appended to it) to the body of the new window
    this.externalWindow.document.body.appendChild(this.containerEl);

    copyStyles(document, this.externalWindow.document);

  }

  componentWillUnmount() {
    // STEP 5: This will fire when this.state.showWindowPortal in the parent component becomes false
    // So we tidy up by closing the window
    this.externalWindow.close();
  }

  onUserSpeedChanged(speed) {
    console.log('speed changed ');

  }

  onUserRotationSpeedChanged(speed) {
    console.log('rotation speed changed ');

  }

  onUserScaleFactorChanged(scale) {
    console.log('onUserScaleFactorChanged ');

  }

  onUserCameraBoundChanged(bound) {
    console.log('onUserCameraBoundChanged ');

  }

  render() {
    // STEP 2: append props.children to the container <div> that isn't mounted anywhere yet
    return ReactDOM.createPortal(
      <UserConfig
        userConfig={config.user}
        onUserSpeedChanged={this.onUserSpeedChanged}
        onUserRotationSpeedChanged={this.onUserRotationSpeedChanged}
        onUserScaleFactorChanged={this.onUserScaleFactorChanged}
        onUserCameraBoundChanged={this.onUserCameraBoundChanged}
        {...this.state}/>
      ,
      this.containerEl
    );
  }
}
