import { useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

import { useConfigContext } from '../config/context/ConfigProvider'
import { listenRecorder } from '../../spotify/listen-recorder'

/** Hands the training recorder (it runs outside React) the signed-in user's Clerk token and whether they may record (admins only). */
export const ListenRecorderBridge = (): null => {
  const { getToken, isSignedIn } = useAuth()
  const { isAdmin } = useConfigContext()

  useEffect(() => {
    listenRecorder.setAuth(isSignedIn ? getToken : null, isAdmin)
  }, [getToken, isSignedIn, isAdmin])

  return null
}
