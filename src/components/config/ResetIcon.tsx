import React from 'react'

type ResetIconProps = {
  size?: number
}

export const ResetIcon = ({ size = 15 }: ResetIconProps): React.ReactElement => (
  <svg viewBox='0 0 24 24' width={size} height={size} fill='none' stroke='currentColor' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' aria-hidden>
    <path d='M3.3 14.3A9 9 0 1 0 12 3a9.75 9.75 0 0 0-6.74 2.74L3 8' />
    <path d='M3 3v5h5' />
  </svg>
)
