import React from 'react'
import { createRoot } from 'react-dom/client'

import { LabPage } from './LabPage'
import './lab.css'

const container = document.getElementById('root')
if (!container) throw new Error('The lab page has no #root element')

createRoot(container).render(
  <React.StrictMode>
    <LabPage />
  </React.StrictMode>,
)
