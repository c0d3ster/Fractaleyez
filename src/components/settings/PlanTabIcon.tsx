import React from 'react'

// labelIcon for the "Plan" tab in Clerk's UserButton profile modal (see TopBar): an eye, for Third Eye.
export const PlanTabIcon = (): React.ReactElement => (
  <svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' style={{ display: 'block' }}>
    <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
    <circle cx='12' cy='12' r='3' />
  </svg>
)
