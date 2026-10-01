import React, { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Grid } from 'react-bootstrap'

import { Presets, PresetSelection } from '../presets/Presets'
import { SavePreset } from '../presets/SavePreset'
import { ConfigCategory } from './ConfigCategory'
import { ConfigVideo } from './ConfigVideo'
import { copyStyles } from '../../styles/AppStyleCopier'
import { CONFIG_WINDOW_COLUMN_ORDER } from '../../config/configDefaults'
import { connectConfig, ConfigContext, ConfigContextValue } from './context/ConfigProvider'
import { CameraTouchpad } from './CameraTouchpad'
import { ShapePad } from './ShapePad'
import { FrequencyHud, PerfHud, ParticleSpriteHud } from '../huds'
import { useVisualizerActive } from './useVisualizerActive'

// Seven 205px columns (1435) plus the grid's 15px side padding is 1465; the rest is margin.
const POPOUT_WIDTH = 1500
const DEFAULT_WINDOW_FEATURES = `width=${POPOUT_WIDTH},height=860,location=no`

// Positions the popout on a second screen at full available height when the Window Management
// API is available and permitted; falls back to the default same-screen size/placement otherwise
// (unsupported in Firefox/Safari, and requires a permission prompt in Chromium).
const resolveWindowFeatures = async (): Promise<string> => {
  if (!window.getScreenDetails || !window.screen.isExtended) return DEFAULT_WINDOW_FEATURES
  try {
    const screenDetails = await window.getScreenDetails()
    const { currentScreen } = screenDetails
    const secondScreen = screenDetails.screens.find((s) => s !== currentScreen)
    if (!secondScreen) return DEFAULT_WINDOW_FEATURES
    // A screen narrower than the columns need just scrolls horizontally.
    const popoutWidth = Math.min(POPOUT_WIDTH, secondScreen.availWidth)
    // Dock against the seam between the two screens rather than always at the second
    // screen's left edge: if it's to the left of the current screen, that seam is its
    // right edge; if it's to the right, the seam is its left edge (today's behavior).
    const secondScreenIsToTheLeft = secondScreen.availLeft < currentScreen.availLeft
    const left = secondScreenIsToTheLeft
      ? secondScreen.availLeft + secondScreen.availWidth - popoutWidth
      : secondScreen.availLeft
    return `width=${popoutWidth},height=${secondScreen.availHeight},left=${left},top=${secondScreen.availTop},location=no`
  } catch {
    return DEFAULT_WINDOW_FEATURES
  }
}

// Input types that take typed text; keys pressed in these must stay with the field instead of acting as hotkeys.
const NON_TEXT_INPUT_TYPES = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']

// A focused slider already moves on these keys, so forwarding them would also fire the matching hotkey.
const SLIDER_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

const isTypingTarget = (element: Element | null, key: string): boolean => {
  if (!element) return false
  if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return true
  if (element.hasAttribute('contenteditable')) return true
  if (element.tagName === 'INPUT' && element.getAttribute('type') === 'range' && SLIDER_KEYS.includes(key)) return true
  return element.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.includes(element.getAttribute('type') ?? 'text')
}

type ExternalWindowBridgeProps = ConfigContextValue

// Renders inside the external window's React root, bridging ConfigContext from the main window
const ExternalWindowBridge = ({
  config,
  updateConfigItem,
  updateVideoClips,
  updateParticleSprites,
  retrieveConfigPreset,
  revertConfig,
  resetConfig,
  savePreset,
  isSignedIn,
  currentUserId,
  getToken,
  presets,
  packs,
  userSettings,
  updateUserSettings,
}: ExternalWindowBridgeProps): React.ReactElement => {
  const [prefill, setPrefill] = useState<PresetSelection | null>(null)
  const { orbit: orbitActive } = useVisualizerActive()
  return (
    <ConfigContext.Provider
      value={{
        config,
        updateConfigItem,
        updateVideoClips,
        updateParticleSprites,
        retrieveConfigPreset,
        revertConfig,
        resetConfig,
        savePreset,
        isSignedIn,
        currentUserId,
        getToken,
        presets,
        packs,
        userSettings,
        updateUserSettings,
      }}
    >
      <Grid fluid>
        <Presets
          expanded
          onSelect={setPrefill}
          onPackSelect={(pack: string) => setPrefill(prev => prev ? { ...prev, pack } : { name: '', label: '', pack, isOwn: false })}
          headerActions={<SavePreset prefill={prefill} onSaved={() => setPrefill(null)} />}
        />
        <div className='config-columns'>
          {CONFIG_WINDOW_COLUMN_ORDER.map((segment) => {
            if (segment === 'effects_particle') {
              return (
                <div className='config-column' key='effects_particle'>
                  <ConfigCategory
                    name='effects'
                    onChange={updateConfigItem}
                    isOpen={true}
                    toggleOpen={() => null}
                  />
                  <div className={orbitActive ? undefined : 'config-inactive'}>
                    <ParticleSpriteHud />
                  </div>
                </div>
              )
            }
            if (segment === 'video') {
              return (
                <div className='config-column' key='video'>
                  <ConfigVideo isOpen={true} toggleOpen={() => null} />
                  <PerfHud />
                </div>
              )
            }
            return (
              <div className='config-column' key={segment}>
                <ConfigCategory
                  name={segment}
                  onChange={updateConfigItem}
                  isOpen={true}
                  toggleOpen={() => null}
                >
                  {segment === 'user' ? <CameraTouchpad /> : null}
                  {segment === 'fractal' ? <ShapePad /> : null}
                </ConfigCategory>
                {segment === 'audio' ? <FrequencyHud /> : null}
              </div>
            )
          })}
        </div>
      </Grid>
    </ConfigContext.Provider>
  )
}

type ConfigWindowProps = ConfigContextValue & {
  onClose: () => void
}

const ConfigWindowInner = ({
  config,
  updateConfigItem,
  updateVideoClips,
  updateParticleSprites,
  retrieveConfigPreset,
  revertConfig,
  resetConfig,
  savePreset,
  isSignedIn,
  currentUserId,
  getToken,
  presets,
  packs,
  userSettings,
  updateUserSettings,
  onClose,
}: ConfigWindowProps): null => {
  const reactRootRef = useRef<Root | null>(null)
  // Root creation is now async (waits on second-screen resolution) — this flips once the root
  // exists so the render effect below re-fires even if config/presets/etc haven't changed since.
  const [externalRootReady, setExternalRootReady] = useState(false)

  // Open the external window once on mount
  useEffect(() => {
    let cancelled = false
    let externalWindow: Window | null = null

    const closeExternalWindow = (): void => externalWindow?.close()

    // Keys pressed while the popup has focus go to the popup's document, so the main page's hotkeys (J, S,
    // E, M, H, arrows, preset numbers) never see them. Replay them on the main document, unless the user is
    // typing in a field or holding a browser-shortcut modifier.
    const forwardKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // The popup's own preset list already handles the 1-9 keys on its document.
      if (/^[1-9]$/.test(event.key)) return
      if (isTypingTarget(externalWindow?.document.activeElement ?? null, event.key)) return
      document.dispatchEvent(new KeyboardEvent(event.type, {
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        which: event.which,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        bubbles: true,
        cancelable: true,
      }))
    }

    const setup = async (): Promise<void> => {
      const features = await resolveWindowFeatures()
      if (cancelled) return

      externalWindow = window.open('', '', features)
      if (!externalWindow) return

      const container = externalWindow.document.createElement('div')
      container.className = 'config-window-root'
      externalWindow.document.title = 'Configuration'
      externalWindow.document.body.appendChild(container)
      externalWindow.addEventListener('beforeunload', onClose)
      externalWindow.document.addEventListener('keydown', forwardKey)
      externalWindow.document.addEventListener('keyup', forwardKey)
      window.addEventListener('beforeunload', closeExternalWindow)
      copyStyles(document, externalWindow.document)

      reactRootRef.current = createRoot(container)
      setExternalRootReady(true)
    }

    void setup()

    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', closeExternalWindow)
      externalWindow?.removeEventListener('beforeunload', onClose)
      externalWindow?.document.removeEventListener('keydown', forwardKey)
      externalWindow?.document.removeEventListener('keyup', forwardKey)
      reactRootRef.current?.unmount()
      reactRootRef.current = null
      externalWindow?.close()
    }
  }, [])

  // Re-render the external root whenever config changes, keeping both windows in sync
  useEffect(() => {
    if (!reactRootRef.current) return
    reactRootRef.current.render(
      <ExternalWindowBridge
        config={config}
        updateConfigItem={updateConfigItem}
        updateVideoClips={updateVideoClips}
        updateParticleSprites={updateParticleSprites}
        retrieveConfigPreset={retrieveConfigPreset}
        revertConfig={revertConfig}
        resetConfig={resetConfig}
        savePreset={savePreset}
        isSignedIn={isSignedIn}
        currentUserId={currentUserId}
        getToken={getToken}
        presets={presets}
        packs={packs}
        userSettings={userSettings}
        updateUserSettings={updateUserSettings}
      />
    )
  }, [
    externalRootReady,
    config,
    updateConfigItem,
    updateVideoClips,
    updateParticleSprites,
    retrieveConfigPreset,
    resetConfig,
    savePreset,
    isSignedIn,
    currentUserId,
    getToken,
    presets,
    userSettings,
    updateUserSettings,
  ])

  return null
}

export const ConfigWindow = connectConfig(ConfigWindowInner)
