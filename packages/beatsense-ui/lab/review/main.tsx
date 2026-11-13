import React from 'react'
import { createRoot } from 'react-dom/client'

import { ReviewPage } from './ReviewPage'
import '../lab.css'
import './review.css'

const container = document.getElementById('root')
if (!container) throw new Error('The review page has no #root element')

createRoot(container).render(
  <React.StrictMode>
    <ReviewPage />
  </React.StrictMode>,
)
