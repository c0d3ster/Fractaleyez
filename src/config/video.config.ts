/** The clip entry that plays the live camera feed instead of a file. */
export const LIVE_CLIP = 'realtime'

export const isLiveClip = (clip: string): boolean => clip === LIVE_CLIP

/**
 * The live feed plays as long as it is selected, so it is never mixed with clips: a list that has it plays only it.
 * Presets edited by hand (or saved before the UI kept the two apart) may still carry both.
 */
export const normalizeClips = (clips: string[]): string[] => (clips.some(isLiveClip) ? [LIVE_CLIP] : clips)

export const videoConfig = {
  clips: ['galaxy.mp4', 'earth.mp4'],
  allClips: ['galaxy.mp4', 'earth.mp4', LIVE_CLIP],
  index: 0,
}
