import React from 'react';
import Header from './Header.jsx';

import '../styles/App.css';

import VisualizerMain from '../main.js';

export default class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      showConfig: true,
    };
  }

  componentDidMount() {

  }

  componentDidCatch(error, info) {
    alert(`Unexpected Error Occured: ${error.message} \n\n refreshing page`);
    window.location.reload();
  }


  //for when the home nav item is clicked
  onConfigClicked = () => {
    console.log('config clicked');
    this.setState({
      showConfig: true,
    });
  }


  render() {
    let onConfigClose = () => { console.log('config close event') };


    return (
        <div>
          <Header
            onConfigClicked={this.onConfigClicked}
            {...this.state}/>
        </div>
    );
  }

}
