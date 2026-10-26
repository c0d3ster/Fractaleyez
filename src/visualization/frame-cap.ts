/**
 * Whether a display frame should be drawn under a frame cap. The cap's interval is rounded to the nearest display frame:
 * a frame is drawn once the time since the last drawn one is within half a display frame of the interval. That keeps a
 * 120fps cap at 120 on a 240Hz screen, leaves a 144Hz screen at 144 instead of halving it to 72, and keeps a 30fps cap at 30 on 60Hz.
 */
export const shouldDrawUnderCap = (sinceLastDrawMs: number, capFps: number, displayFrameMs: number): boolean =>
  sinceLastDrawMs >= 1000 / capFps - displayFrameMs / 2
