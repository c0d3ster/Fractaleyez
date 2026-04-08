import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { Analytics } from '@vercel/analytics/react'

import { ConfigProvider } from './components/config/context/ConfigProvider'
import { App } from './components/App'

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim()
if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) {
  throw new Error(
    'CLERK_PUBLISHABLE_KEY must be set to a valid Clerk publishable key (pk_test_... or pk_live_...).'
  )
}

window.onload = () => {
  const rootEl = document.getElementById('root')
  if (!rootEl) return
  const root = createRoot(rootEl)
  root.render(
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        variables: {
          colorBackground: '#0a0a0a',
          colorText: 'rgba(220, 220, 220, 0.9)',
          colorTextSecondary: 'rgba(160, 160, 160, 0.9)',
          colorInputBackground: '#1a1a1a',
          colorInputText: 'rgba(220, 220, 220, 0.9)',
          colorPrimary: '#ffffff',
          colorTextOnPrimaryBackground: '#0a0a0a',
          colorNeutral: 'rgba(220, 220, 220, 0.9)',
          fontSize: '1.1rem',
        },
        elements: {
          card: {
            border: '1px solid rgba(40, 40, 40, 0.9)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
          },
        },
      }}
    >
      <ConfigProvider>
        <App />
      </ConfigProvider>
      <Analytics />
    </ClerkProvider>
  )
}
