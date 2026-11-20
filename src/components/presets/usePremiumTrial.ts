import { useRef, useState, useCallback, useEffect } from 'react'
import { ConfigSnapshot, PresetRetrieveEvent } from '../config/context/ConfigProvider'
import { isPreviewedToday, recordPreview } from './previewRecord'
import { previewLock } from './previewLock'

export const TRIAL_DURATION_S = 15

type UsePremiumTrialOptions = {
  snapshotConfig: () => ConfigSnapshot
  revertConfig: (snapshot: ConfigSnapshot) => void
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
}

type PremiumTrial = {
  /** Previews a locked preset once per local day. False (nothing loaded) when it was already previewed today. */
  startTrial: (presetKey: string, packName: string, event: PresetRetrieveEvent) => boolean
  /** Ends the preview without putting the old config back (another preset is loading over it). */
  cancelTrial: () => void
  /** Ends the preview and puts back the config from before it. */
  dismissTrial: () => void
  modalVisible: boolean
  trialPackName: string
  secondsLeft: number | null
}

/**
 * The premium preview: 15 seconds of a locked preset with the config controls locked, then the subscribe prompt. Which presets
 * were already previewed today lives in `previewRecord`; the lock in `previewLock`.
 */
export const usePremiumTrial = ({ snapshotConfig, revertConfig, retrieveConfigPreset }: UsePremiumTrialOptions): PremiumTrial => {
  const snapshotRef = useRef<ConfigSnapshot | null>(null)
  const timerRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [trialPackName, setTrialPackName] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const clearTimers = useCallback((): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    if (intervalRef.current !== null) clearInterval(intervalRef.current)
    timerRef.current = null
    intervalRef.current = null
  }, [])

  const startTrial = useCallback((presetKey: string, packName: string, event: PresetRetrieveEvent): boolean => {
    if (isPreviewedToday(presetKey)) return false
    clearTimers()
    recordPreview(presetKey)
    // The config from before the first preview, kept across back-to-back previews, read live so this hook does not re-render with the config.
    snapshotRef.current ??= snapshotConfig()
    previewLock.set(true)
    void retrieveConfigPreset(event)
    setTrialPackName(packName)
    setSecondsLeft(TRIAL_DURATION_S)

    intervalRef.current = window.setInterval(() => {
      setSecondsLeft(prev => (prev !== null && prev > 1 ? prev - 1 : prev))
    }, 1000)

    // The controls stay locked behind the prompt: the premium config is still showing until it is dismissed.
    timerRef.current = window.setTimeout(() => {
      clearTimers()
      setSecondsLeft(null)
      setModalVisible(true)
    }, TRIAL_DURATION_S * 1000)
    return true
  }, [snapshotConfig, retrieveConfigPreset, clearTimers])

  const cancelTrial = useCallback((): void => {
    clearTimers()
    previewLock.set(false)
    setSecondsLeft(null)
    setTrialPackName('')
    snapshotRef.current = null
  }, [clearTimers])

  const dismissTrial = useCallback((): void => {
    clearTimers()
    setModalVisible(false)
    setSecondsLeft(null)
    if (snapshotRef.current) revertConfig(snapshotRef.current)
    snapshotRef.current = null
    previewLock.set(false)
  }, [revertConfig, clearTimers])

  // The pop-out's preset list unmounts with its window: a preview it started ends there, config put back.
  const dismissRef = useRef(dismissTrial)
  dismissRef.current = dismissTrial
  useEffect(() => () => {
    if (snapshotRef.current) dismissRef.current()
    else clearTimers()
  }, [clearTimers])

  return { startTrial, cancelTrial, modalVisible, trialPackName, secondsLeft, dismissTrial }
}
