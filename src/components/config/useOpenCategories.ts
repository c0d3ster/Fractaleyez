import { useCallback, useState } from 'react'

export type OpenCategories = {
  openCategories: string[]
  toggleOpen: (id: string) => void
}

/**
 * Which categories are open. It lives with the owner of the accordion, not in it, so the open categories survive the accordion being taken
 * out of the page and put back (the sidebar does that while the expanded config window is open).
 */
export const useOpenCategories = (canOpenMultiple: boolean): OpenCategories => {
  const [openCategories, setOpenCategories] = useState(['user'])

  const toggleOpen = useCallback((id: string) => {
    setOpenCategories((prev) => {
      const index = prev.indexOf(id)
      if (canOpenMultiple && index === -1) {
        return [...prev, id]
      } else if (index === -1) {
        return [id]
      } else {
        return prev.filter((c) => c !== id)
      }
    })
  }, [canOpenMultiple])

  return { openCategories, toggleOpen }
}
