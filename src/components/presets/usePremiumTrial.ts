import { useRef, useState, useCallback, useEffect } from 'react'
import { AppConfig } from '../../config/configDefaults'
import { PresetRetrieveEvent } from '../config/context/ConfigProvider'

const TRIAL_DURATION_MS = 30_000

type UsePremiumTrialOptions = {
  config: AppConfig
  revertConfig: (snapshot: AppConfig) => void
  retrieveConfigPreset: (event: PresetRetrieveEvent) => Promise<void>
}

export const usePremiumTrial = ({ config, revertConfig, retrieveConfigPreset }: UsePremiumTrialOptions) => {
  const snapshotRef = useRef<AppConfig | null>(null)
  const timerRef = useRef<number | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [trialPackName, setTrialPackName] = useState('')

  const clearTrial = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTrial = useCallback((packName: string, event: PresetRetrieveEvent) => {
    clearTrial()
    snapshotRef.current = config
    void retrieveConfigPreset(event)
    setTrialPackName(packName)
    timerRef.current = window.setTimeout(() => setModalVisible(true), TRIAL_DURATION_MS)
  }, [config, retrieveConfigPreset, clearTrial])

  const dismissTrial = useCallback(() => {
    clearTrial()
    setModalVisible(false)
    if (snapshotRef.current) {
      revertConfig(snapshotRef.current)
      snapshotRef.current = null
    }
  }, [revertConfig, clearTrial])

  useEffect(() => () => clearTrial(), [clearTrial])

  return { startTrial, modalVisible, trialPackName, dismissTrial }
}
