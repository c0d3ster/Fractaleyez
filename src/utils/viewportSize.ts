// window.innerWidth/innerHeight can force a style and layout flush when the page is dirty, so reading them every frame
// in the render loop shows up as "forced reflow". The size only changes on resize, so cache it there.
type ViewportSize = { width: number; height: number }

let viewportSize: ViewportSize = { width: window.innerWidth, height: window.innerHeight }

window.addEventListener('resize', () => {
  viewportSize = { width: window.innerWidth, height: window.innerHeight }
})

export const getViewportSize = (): ViewportSize => viewportSize
