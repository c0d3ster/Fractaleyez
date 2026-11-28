import { clipUrl, isLiveClip } from '../../config/video.config'

// The first clip of the look the page boots with starts downloading as soon as the app's code runs, instead of when the layer pipeline
// is built a few seconds later (on a slow connection the clip was the last thing the first meaningful frame waited for). The video layer
// takes the element over when it creates its first slot, so the bytes already buffered are used, not fetched again.

let prefetched: { src: string; video: HTMLVideoElement } | null = null

const release = (video: HTMLVideoElement): void => {
  video.removeAttribute('src')
  video.load()
}

/** Starts loading `src`; at most one clip is prefetched. */
export const prefetchClip = (src: string): void => {
  if (prefetched || isLiveClip(src)) return
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = clipUrl(src)
  prefetched = { src, video }
}

/** The prefetched element for `src`, once. A prefetch for another clip is no longer wanted, so it is stopped. */
export const takePrefetchedClip = (src: string): HTMLVideoElement | null => {
  if (!prefetched) return null
  const { video } = prefetched
  const matches = prefetched.src === src
  prefetched = null
  if (matches) return video
  release(video)
  return null
}
