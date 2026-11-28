import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { useClerk } from '@clerk/clerk-react'

import { PlanPage } from './PlanPage'
import { PlanTabIcon } from './PlanTabIcon'
import { UserSettingsPage } from './UserSettingsPage'
import { VisualizerTabIcon } from './VisualizerTabIcon'

// The custom pages of Clerk's "Manage account" modal, in order: the desktop UserButton (TopBar) renders them as
// UserButton.UserProfilePage children, and the mobile account sheet opens the same modal with openUserProfile.

type ProfilePage = { label: string; url: string; Icon: React.ComponentType; Page: React.ComponentType }

export const PROFILE_PAGES: readonly ProfilePage[] = [
  { label: 'Visualizer', url: 'visualizer', Icon: VisualizerTabIcon, Page: UserSettingsPage },
  { label: 'Plan', url: 'plan', Icon: PlanTabIcon, Page: PlanPage },
]

type CustomPages = NonNullable<NonNullable<Parameters<ReturnType<typeof useClerk>['openUserProfile']>[0]>['customPages']>

type Slots = Record<string, HTMLDivElement>

/**
 * PROFILE_PAGES as openUserProfile's `customPages`. Clerk hands each page and icon an element to fill; the returned portals
 * render into them from this tree, so the pages keep the app's providers (as Clerk's own UserButton does). Render `portals`
 * from a component that stays mounted while the modal is open.
 */
export const useProfilePages = (): { customPages: CustomPages; portals: React.ReactNode } => {
  const [slots, setSlots] = useState<Slots>({})

  const customPages = useMemo<CustomPages>(() => {
    const mount = (key: string) => (el: HTMLDivElement): void => setSlots((prev) => ({ ...prev, [key]: el }))
    const unmount = (key: string) => (el?: HTMLDivElement): void => setSlots((prev) => {
      if (!(key in prev) || (el && prev[key] !== el)) return prev
      const { [key]: _gone, ...rest } = prev
      return rest
    })
    return PROFILE_PAGES.map(({ label, url }) => ({
      label,
      url,
      mount: mount(`${url}:page`),
      unmount: unmount(`${url}:page`),
      mountIcon: mount(`${url}:icon`),
      unmountIcon: unmount(`${url}:icon`),
    }))
  }, [])

  const portals = PROFILE_PAGES.flatMap(({ url, Icon, Page }) => {
    const page = slots[`${url}:page`]
    const icon = slots[`${url}:icon`]
    return [
      page ? createPortal(<Page />, page, `${url}:page`) : null,
      icon ? createPortal(<Icon />, icon, `${url}:icon`) : null,
    ]
  })

  return { customPages, portals }
}
