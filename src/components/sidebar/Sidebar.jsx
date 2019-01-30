import React from 'react';
import classNames from 'classnames';
import { Grid, Row } from 'react-bootstrap';
import './Sidebar.css';

import Presets from '../presets/Presets'
import ConfigAccordion from '../config/ConfigAccordion'
import { connectConfig } from '../config/context/ConfigProvider'

class Sidebar extends React.Component {
  state = {
    sidebarVisible: null, // set to null to prevent slide out animation on page load
    tabVisible: true,
    hideTimer: null,
  }

  componentDidMount() {this.hideTabDelayed(5000)}

  setConfigWindow = () => this.props.setConfigWindow(!this.props.configWindowVisible)

  setSidebarVisibility = () => this.setState({ sidebarVisible: !this.state.visible })

  showTab = () => {
    if(this.state.hideTimer) {
      window.clearTimeout(this.state.hideTimer);
    }
    this.setState({
      tabVisible: true,
      hideTimer: null
    })
  }

  hideTabDelayed = (waitTime) => {
    if(!this.state.hideTabTimer) {
      const hideTimer = window.setTimeout(() => {
        this.setState({ tabVisible: false })
      }, Number.isInteger(waitTime) ? waitTime : 1000);
      this.setState({ hideTimer });
    }
  }

  render() {
    const sidebarContentClasses = classNames('sidebar-content', {
      'slide-in': this.state.sidebarVisible,
      'slide-out': this.state.sidebarVisible == false
    })
    const tabClasses = classNames('tab', {
      'tab-fade-in': this.state.tabVisible,
      'tab-fade-out': !this.state.tabVisible
    })
    const expandConfigClasses = classNames('expand-config', {
      'expanded': this.props.configWindowVisible
    })
    return (
      <div 
        className='sidebar-container'
        onMouseEnter={this.showTab} 
        onMouseLeave={this.hideTabDelayed}>
        <Grid bsClass={sidebarContentClasses}>
          <button 
            className={tabClasses} 
            onClick={this.setSidebarVisibility}>
            Menu
          </button>
          <Row>
            <h2 className='sidebar-title'>Presets</h2>
          </Row>
          <Presets/>
          <Row>
            <h2 className='sidebar-title'>Configuration</h2>
            <button 
              className={expandConfigClasses} 
              onClick={this.setConfigWindow}>
              expand
            </button>
          </Row>
          <ConfigAccordion canOpenMultiple={false} />
        </Grid>
      </div>
    );
  }
}

export default connectConfig(Sidebar)
