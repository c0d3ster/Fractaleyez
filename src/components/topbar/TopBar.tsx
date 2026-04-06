import React, { useState, useCallback, useEffect, useRef } from 'react'
import classNames from 'classnames'
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react'
import './TopBar.css'

const TRIGGER_Y_PX = 100
const HIDE_AFTER_Y_PX = 120
const TRIGGER_X_FROM_RIGHT_PX = 200

export const TopBar = (): React.ReactElement => {
  const { isSignedIn, isLoaded } = useUser()
  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<number | null>(null)

  const show = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setVisible(true)
  }, [])

  const hideDelayed = useCallback(() => {
    if (!hideTimerRef.current) {
      hideTimerRef.current = window.setTimeout(() => {
        setVisible(false)
        hideTimerRef.current = null
      }, 800)
    }
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      const nearRight = e.clientX >= window.innerWidth - TRIGGER_X_FROM_RIGHT_PX
      if (e.clientY <= TRIGGER_Y_PX && nearRight) {
        show()
      } else if (e.clientY > HIDE_AFTER_Y_PX || !nearRight) {
        hideDelayed()
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [show, hideDelayed])

  const contentClasses = classNames('topbar-content', {
    'topbar-fade-in': visible,
    'topbar-fade-out': !visible,
  })

  return (
    <div className='topbar-container'>
      <div className={contentClasses}>
        {isLoaded && (
          isSignedIn
            ? <UserButton appearance={{ elements: { avatarBox: { width: 56, height: 56 } } }} />
            : <SignInButton mode='modal'>
                <button className='topbar-signin-btn'>Sign In</button>
              </SignInButton>
        )}
      </div>
    </div>
  )
}
