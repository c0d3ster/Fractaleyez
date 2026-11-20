import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './SpritePicker.css'
import '../upgrade/PremiumRing.css'

import { useInfo } from '../config/info/info'
import { useConfigContext } from '../config/context/ConfigProvider'
import { useUpgrade } from '../upgrade/UpgradeProvider'
import { hasRoomFor, quotaMessage } from '../../config/plans.config'
import { presetSpriteSrc } from '../../utils/presetSpriteSrc'
import { USER_REFERENCE } from '../../utils/userReference'
import { useSpriteUpload } from './useSpriteUpload'
import { uploadLibrary, useUploadLibrary } from './uploadLibrary'
import {
  GRID_ROWS,
  SPRITE_SOURCES,
  SpriteSource,
  SpriteTile,
  builtinTiles,
  clampPage,
  columnsFor,
  pageCount,
  pageItems,
  uploadCountLabel,
  usedByLiveConfig,
  yoursTiles,
} from './spritePickerModel'

export type SpritePickerProps = {
  builtins: readonly string[]
  isSelected: (src: string) => boolean
  /** A built-in or uploaded image was clicked. The caller decides whether that toggles it in a list or replaces a value. */
  onPick: (src: string) => void
  /** A new upload landed; the URL is already in the library. */
  onUploaded: (url: string) => void
  /** The viewer's own logo tile: selected state and what a click does (it may need to release `@user` first). */
  logoSelected: boolean
  onPickLogo: (url: string) => void
  /** Admins only: the `@user` tile. */
  referenceSelected: boolean
  onPickReference: () => void
  /** An image that can't be picked right now (the particle list is full and it is not in it). */
  isTileDisabled?: (src: string) => boolean
  /** Why nothing new can be added right now (the particle list is full). The upload tile is disabled with this as its hint. */
  addBlockedReason?: string
  /** "particle" or "logo", for the hints. */
  noun: string
}

type Notice = { text: string; tone: 'error' | 'info' }

// A refusal stays up long enough to read the preset names, and goes on a click before that.
const NOTICE_DISPLAY_MS = 6000
// The expanded config window's columns, the narrowest place the picker lives, until the first measure.
const INITIAL_COLUMNS = 3

/**
 * Columns that fit the grid's own width, re-measured when it changes. The observer comes from the grid's own window: in the
 * popped-out config window the element belongs to that document, which the main window's ResizeObserver doesn't watch.
 */
const useGridColumns = (ref: React.RefObject<HTMLElement>): number => {
  const [columns, setColumns] = useState(INITIAL_COLUMNS)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const measure = (): void => setColumns(columnsFor(element.clientWidth))
    measure()
    const Observer = element.ownerDocument.defaultView?.ResizeObserver
    if (!Observer) return undefined
    const observer = new Observer(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return columns
}

const TrashIcon = (): React.ReactElement => (
  <svg viewBox='0 0 16 16' width='10' height='10' aria-hidden focusable='false'>
    <path fill='currentColor' d='M6 1h4l.5 1H14v2H2V2h3.5L6 1Zm-3 4h10l-.8 10H3.8L3 5Zm3 2v6h1V7H6Zm3 0v6h1V7H9Z' />
  </svg>
)

const spriteLabel = (src: string): string => {
  const base = src.split('/').pop() ?? src
  return base.replace(/\.[^.]+$/, '') || base
}

/**
 * The one image picker for particles and the logo. A Built-in | Yours switch shows one set at a time, in a fixed two-row grid
 * with arrow paging, so the panel keeps its height whatever the user has uploaded. Yours starts with the upload tile and lets
 * the owner delete an upload (the server refuses one a saved preset or their logo still uses, and says where).
 */
export const SpritePicker = ({
  builtins,
  isSelected,
  onPick,
  onUploaded,
  logoSelected,
  onPickLogo,
  referenceSelected,
  onPickReference,
  isTileDisabled,
  addBlockedReason,
  noun,
}: SpritePickerProps): React.ReactElement => {
  const info = useInfo()
  const { isSignedIn, getToken, currentUserId, entitlements, usage, refreshAccount, isAdmin, userSettings } = useConfigContext()
  const { requestUpgrade } = useUpgrade()
  const library = useUploadLibrary()
  const [source, setSource] = useState<SpriteSource>('builtin')
  const [pages, setPages] = useState<Record<SpriteSource, number>>({ builtin: 0, yours: 0 })
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [uploadErrorDismissed, setUploadErrorDismissed] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useGridColumns(gridRef)
  const pageSize = columns * GRID_ROWS

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), NOTICE_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // One fetch per signed-in user, shared by every picker; signing out clears it.
  useEffect(() => {
    void uploadLibrary.load(isSignedIn ? currentUserId : null, getToken)
  }, [isSignedIn, currentUserId, getToken])

  const logoUrl = userSettings?.logoParticle
  const tiles = useMemo(
    () => (source === 'builtin' ? builtinTiles(builtins) : yoursTiles({ uploads: library.uploads, logoUrl, isAdmin })),
    [source, builtins, library.uploads, logoUrl, isAdmin],
  )
  const page = clampPage(pages[source], tiles.length, pageSize)
  const totalPages = pageCount(tiles.length, pageSize)
  const visible = pageItems(tiles, page, pageSize)

  const changeSource = useCallback((next: SpriteSource): void => {
    setSource(next)
    setConfirmId(null)
    setNotice(null)
  }, [])

  const changePage = useCallback((next: number): void => {
    setPages((previous) => ({ ...previous, [source]: (next + totalPages) % totalPages }))
    setConfirmId(null)
  }, [source, totalPages])

  const handleUploaded = useCallback((url: string): void => {
    onUploaded(url)
    setPages((previous) => ({ ...previous, yours: 0 }))
    void uploadLibrary.load(currentUserId, getToken, true)
  }, [onUploaded, currentUserId, getToken])

  const { onFiles, uploadError } = useSpriteUpload({
    isSignedIn,
    getToken,
    atCapacity: addBlockedReason !== undefined,
    onUploaded: handleUploaded,
    entitlements,
    usage,
    refreshAccount,
  })
  // A new error shows again even after the last one was clicked away.
  useEffect(() => setUploadErrorDismissed(false), [uploadError])

  const askDelete = useCallback((uploadId: string, src: string): void => {
    // The config at call time, not a closed-over copy (see CLAUDE.md, Config UI rendering).
    if (usedByLiveConfig(window.config, src)) {
      setConfirmId(null)
      setNotice({ text: 'On screen right now. Take it out of the current look first.', tone: 'error' })
      return
    }
    setNotice(null)
    setConfirmId(uploadId)
  }, [])

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!confirmId) return
    setDeleting(true)
    const outcome = await uploadLibrary.remove(confirmId, getToken)
    setDeleting(false)
    setConfirmId(null)
    if (outcome.ok) {
      setNotice(null)
      refreshAccount()
      return
    }
    setNotice({ text: outcome.message, tone: 'error' })
  }, [confirmId, getToken, refreshAccount])

  const atQuota = !!entitlements && !hasRoomFor(entitlements, usage, 'particleUploads')
  const limit = entitlements?.quotas.particleUploads

  const renderAddTile = (): React.ReactElement => {
    if (isSignedIn && atQuota && entitlements) {
      const message = quotaMessage({ quota: 'particleUploads', limit: limit ?? 0, plan: entitlements.plan })
      return (
        <button
          type='button'
          className='sprite-picker__tile sprite-picker__tile--add sprite-picker__tile--premium premium-ring-host'
          aria-label='Upgrade for more uploads'
          {...info(`${message} Upgrade for more.`)}
          onClick={() => requestUpgrade(message)}
        >
          <span className='premium-ring' aria-hidden />
          +
        </button>
      )
    }
    const disabledReason = !isSignedIn ? `Sign in to upload a custom ${noun}` : addBlockedReason
    return (
      <label
        className={`sprite-picker__tile sprite-picker__tile--add${disabledReason ? ' sprite-picker__tile--disabled' : ''}`}
        aria-label='Upload an image'
        {...info(disabledReason ?? `Upload an image as a ${noun}`)}
      >
        +
        <input type='file' accept='image/*' disabled={disabledReason !== undefined} onChange={onFiles} />
      </label>
    )
  }

  const renderTile = (tile: SpriteTile, index: number): React.ReactElement => {
    if (tile.type === 'add') return <div key='add' className='sprite-picker__cell'>{renderAddTile()}</div>
    if (tile.type === 'reference') {
      return (
        <div key='reference' className='sprite-picker__cell'>
          <button
            type='button'
            className={`sprite-picker__tile sprite-picker__tile--text${referenceSelected ? ' sprite-picker__tile--selected' : ''}`}
            {...info('Adds the @user reference: each viewer sees their own logo')}
            onClick={onPickReference}
            disabled={!referenceSelected && addBlockedReason !== undefined}
            aria-pressed={referenceSelected}
          >
            {USER_REFERENCE}
          </button>
        </div>
      )
    }
    const { src, uploadId, isLogo } = tile
    const selected = isLogo ? logoSelected : isSelected(src)
    const disabled = !selected && (isTileDisabled?.(src) ?? false)
    // The logo can't be deleted while it is the logo (the server would refuse), so it gets no trash can.
    const deletable = uploadId !== null && !isLogo
    const confirming = uploadId !== null && uploadId === confirmId
    return (
      <div key={`${src.slice(0, 64)}-${index}`} className={`sprite-picker__cell${confirming ? ' sprite-picker__cell--confirming' : ''}`}>
        <button
          type='button'
          className={`sprite-picker__tile${selected ? ' sprite-picker__tile--selected' : ''}`}
          {...info(isLogo ? 'Your logo' : uploadId ? 'Your upload' : spriteLabel(src))}
          onClick={() => (isLogo ? onPickLogo(src) : onPick(src))}
          disabled={disabled}
          aria-pressed={selected}
        >
          <img src={presetSpriteSrc(src)} alt={isLogo ? 'Your logo' : ''} />
        </button>
        {deletable ? (
          <button
            type='button'
            className='sprite-picker__trash'
            aria-label='Delete this upload'
            {...info('Delete this upload')}
            onClick={() => askDelete(uploadId, src)}
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>
    )
  }

  const confirmSrc = confirmId ? library.uploads.find((u) => u.id === confirmId)?.url : undefined

  // Messages cover the grid instead of taking a line under it, so the panel keeps its height in the narrow expanded window.
  const renderOverlay = (): React.ReactNode => {
    if (confirmId) {
      return (
        <div className='sprite-picker__overlay' role='dialog' aria-label='Delete this upload'>
          {confirmSrc ? <img className='sprite-picker__overlay-thumb' src={presetSpriteSrc(confirmSrc)} alt='' /> : null}
          <span>Delete for good?</span>
          <span className='sprite-picker__overlay-actions'>
            <button type='button' className='sprite-picker__confirm-btn sprite-picker__confirm-btn--danger' disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? '...' : 'Delete'}
            </button>
            <button type='button' className='sprite-picker__confirm-btn' disabled={deleting} onClick={() => setConfirmId(null)}>
              Cancel
            </button>
          </span>
        </div>
      )
    }
    const text = notice?.text ?? (uploadError && !uploadErrorDismissed ? uploadError : null)
    if (text) {
      return (
        <button
          type='button'
          className='sprite-picker__overlay sprite-picker__overlay--notice'
          role='alert'
          {...info('Click to dismiss')}
          onClick={() => {
            setNotice(null)
            setUploadErrorDismissed(true)
          }}
        >
          {text}
        </button>
      )
    }
    if (source === 'yours' && library.status === 'error') {
      return (
        <div className='sprite-picker__overlay'>
          <span>Could not load your uploads.</span>
          <button type='button' className='sprite-picker__confirm-btn' onClick={() => void uploadLibrary.load(currentUserId, getToken, true)}>
            Retry
          </button>
        </div>
      )
    }
    return null
  }

  const showCount = source === 'yours' && isSignedIn && usage !== null && limit !== undefined

  return (
    <div className='sprite-picker'>
      <div className='sprite-picker__switch' role='tablist' aria-label='Image source'>
        {SPRITE_SOURCES.map(({ id, label }) => (
          <button
            key={id}
            type='button'
            role='tab'
            aria-selected={source === id}
            className={`sprite-picker__switch-btn${source === id ? ' sprite-picker__switch-btn--active' : ''}`}
            onClick={() => changeSource(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className='sprite-picker__body'>
        <div ref={gridRef} className='sprite-picker__grid' role='tabpanel' style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {visible.map(renderTile)}
          {/* Empty cells hold the second row on a short page, so the grid is always two rows tall. */}
          {Array.from({ length: pageSize - visible.length }, (_, i) => <div key={`filler-${i}`} className='sprite-picker__cell' aria-hidden />)}
        </div>
        {renderOverlay()}
      </div>
      {/* Both ends keep their space when empty (Built-in has no count, one page has no arrows), so nothing moves between tabs. */}
      <div className='sprite-picker__footer'>
        <span className={`sprite-picker__count${showCount ? '' : ' sprite-picker__hidden'}`} {...info(showCount ? 'Uploads used on your plan' : undefined)}>
          {showCount && usage ? uploadCountLabel(usage.particleUploads, limit ?? null) : '0 / 0'}
        </span>
        <div className={`sprite-picker__pagination${totalPages > 1 ? '' : ' sprite-picker__hidden'}`}>
          <button type='button' className='sprite-picker__arrow' aria-label='Previous page' onClick={() => changePage(page - 1)}>&#8592;</button>
          <span className='sprite-picker__page-label'>{page + 1}/{totalPages}</span>
          <button type='button' className='sprite-picker__arrow' aria-label='Next page' onClick={() => changePage(page + 1)}>&#8594;</button>
        </div>
      </div>
    </div>
  )
}
