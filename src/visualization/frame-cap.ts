/**
 * Whether a display frame should be drawn under a frame cap. The cap's interval is rounded to the nearest display frame:
 * a frame is drawn once the time since the last drawn one is within half a display frame of the interval. That keeps a
 * 120fps cap at 120 on a 240Hz screen, leaves a 144Hz screen at 144 instead of halving it to 72, and keeps a 30fps cap at 30 on 60Hz.
 */
export const shouldDrawUnderCap = (sinceLastDrawMs: number, capFps: number, displayFrameMs: number): boolean =>
  sinceLastDrawMs >= 1000 / capFps - displayFrameMs / 2

// A new video frame is drawn at once, ahead of the cap, when waiting for the cap's next draw would hold it back longer than this.
const VIDEO_FRAME_MAX_WAIT_MS = 6

/**
 * Whether a display frame should be drawn ahead of the cap because a new video frame is waiting. Showing each video frame when it
 * arrives gives every frame its own duration; waiting for the cap's next draw holds some frames one draw longer than others (a 24fps
 * clip under a 30 or 60fps cap shows frames for 1 or 2, or 2 or 3, draws), which looks like a hop. It only draws early when the cap's
 * next draw is more than `VIDEO_FRAME_MAX_WAIT_MS` away, so a cap already close to the clip's rate adds no draws, and never within
 * two display frames of the last draw.
 */
export const shouldDrawForVideoFrame = (sinceLastDrawMs: number, capFps: number, displayFrameMs: number): boolean => {
  const untilCapDrawMs = 1000 / capFps - displayFrameMs / 2 - sinceLastDrawMs
  return sinceLastDrawMs >= displayFrameMs * 1.5 && untilCapDrawMs > VIDEO_FRAME_MAX_WAIT_MS
}
