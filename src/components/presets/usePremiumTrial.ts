import { useRef, useState, useCallback, useEffect } from 'react'
import { AppConfig } from '../../config/configDefaults'
import { PresetRetrieveEvent } from '../config/context/ConfigProvider'

const TRIAL_DURATION_S = 30

type UsePremiumTrialOptions = {
  revertConfig: (snapshot: AppConfig) => void
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
}

export const usePremiumTrial = ({ revertConfig, retrieveConfigPreset }: UsePremiumTrialOptions) => {
  const snapshotRef = useRef<AppConfig | null>(null)
  const timerRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [trialPackName, setTrialPackName] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  const clearTrial = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startTrial = useCallback((packName: string, event: PresetRetrieveEvent) => {
    clearTrial()
    // The live config at the moment the trial starts, so this hook does not depend on (and re-render with) the config.
    snapshotRef.current = window.config
    void retrieveConfigPreset(event)
    setTrialPackName(packName)
    setSecondsLeft(TRIAL_DURATION_S)

    intervalRef.current = window.setInterval(() => {
      setSecondsLeft(prev => (prev !== null && prev > 1 ? prev - 1 : prev))
    }, 1000)

    timerRef.current = window.setTimeout(() => {
      clearInterval(intervalRef.current!)
      intervalRef.current = null
      setSecondsLeft(null)
      setModalVisible(true)
    }, TRIAL_DURATION_S * 1000)
  }, [retrieveConfigPreset, clearTrial])

  const cancelTrial = useCallback(() => {
    clearTrial()
    setSecondsLeft(null)
    setTrialPackName('')
    snapshotRef.current = null
  }, [clearTrial])

  const dismissTrial = useCallback(() => {
    clearTrial()
    setModalVisible(false)
    setSecondsLeft(null)
    if (snapshotRef.current) {
      revertConfig(snapshotRef.current)
      snapshotRef.current = null
    }
  }, [revertConfig, clearTrial])

  useEffect(() => () => clearTrial(), [clearTrial])

  return { startTrial, cancelTrial, modalVisible, trialPackName, secondsLeft, dismissTrial }
}
