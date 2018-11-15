
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/Header.css';

import React from 'react';
import { Image, Navbar, NavItem, Nav } from 'react-bootstrap';

export default class Header extends React.Component {
  constructor(props) {
    super(props);

  }

  render() {
    return (
      <Navbar id='header' fixedTop defaultExpanded>
        <Navbar.Header>
           <Navbar.Brand>
             <a href='#home'>Fracteleyez</a>
           </Navbar.Brand>
           <Navbar.Toggle/>
         </Navbar.Header>
           <Navbar.Collapse>
             <Nav bsStyle='pills' pullRight>
                <NavItem className='nav-item' href='#home' onClick={this.props.onConfigClicked}>  Config  </NavItem>
              </Nav>
            </Navbar.Collapse>
        </Navbar>
    );
  }
}
