import { AppConfig, configDefaults } from './configDefaults'

let config: AppConfig | null = null

/**
 * The config the page boots with: a copy of the default look, made once and shared by the visuals (which start before the UI mounts)
 * and ConfigProvider, so both begin on the same object, as they did when the provider made it.
 */
export const bootConfig = (): AppConfig => {
  config ??= structuredClone(configDefaults)
  return config
}
