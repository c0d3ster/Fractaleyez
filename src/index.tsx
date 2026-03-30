import React from 'react'
import ReactDOM from 'react-dom'

import { ConfigProvider } from './components/config/context/ConfigProvider'
import { App } from './components/App'

window.onload = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(ReactDOM as any).render(<ConfigProvider><App /></ConfigProvider>, document.getElementById('root'))
}
