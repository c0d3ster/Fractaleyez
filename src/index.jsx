import React from 'react'
import ReactDOM from 'react-dom'

import { ConfigProvider } from './components/config/context/ConfigProvider'
import App from './components/App.jsx'

window.onload = () => {
  ReactDOM.render(<ConfigProvider><App/></ConfigProvider>, document.getElementById('root'))
}
