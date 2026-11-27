/** The clip entry that plays the live camera feed instead of a file. */
export const LIVE_CLIP = 'realtime'

export const isLiveClip = (clip: string): boolean => clip === LIVE_CLIP

/**
 * The live feed plays as long as it is selected, so it is never mixed with clips: a list that has it plays only it.
 * Presets edited by hand (or saved before the UI kept the two apart) may still carry both.
 */
export const normalizeClips = (clips: string[]): string[] => (clips.some(isLiveClip) ? [LIVE_CLIP] : clips)

/**
 * Lighter encodes served in place of a full-size clip. Presets keep the original name, so this maps at load time.
 * `?fullres=1` in the address plays the originals, for load testing against the heavy files.
 */
const LIGHT_CLIPS: Record<string, string> = {
  'galaxy.mp4': 'galaxy-1080.mp4',
}

const wantsFullRes = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('fullres') === '1'
  } catch {
    return false
  }
}

/** The file to load for a clip name. */
export const clipUrl = (clip: string, fullRes: boolean = wantsFullRes()): string => {
  if (fullRes) return clip
  return LIGHT_CLIPS[clip] ?? clip
}

export const videoConfig = {
  clips: ['galaxy.mp4', 'earth.mp4'],
  allClips: ['galaxy.mp4', 'earth.mp4', LIVE_CLIP],
  index: 0,
}
