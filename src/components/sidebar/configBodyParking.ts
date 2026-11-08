/** How long the sidebar's slide-out animation runs (Sidebar.css `.slide-out`), plus a little, before its config body may be dropped. */
export const SLIDE_OUT_MS = 600

/**
 * Whether the sidebar's config body can be taken out of the page. The expanded config window holds the same controls, so while it is open and the
 * sidebar is not showing, the body only costs work: every config change re-renders it and the page lays it out again, for nothing anyone sees.
 * `sidebarVisible` is null until the sidebar has first been opened, true while shown and false once it has been closed.
 */
export const canParkConfigBody = (configWindowVisible: boolean, sidebarVisible: boolean | null): boolean =>
  configWindowVisible && sidebarVisible !== true

/**
 * Whether to render the body now. It stays until the slide-out has finished (`settled`), so it does not vanish while the sidebar is still moving off
 * screen, and it is back in the same render that shows the sidebar again.
 */
export const shouldRenderConfigBody = (configWindowVisible: boolean, sidebarVisible: boolean | null, settled: boolean): boolean =>
  !(canParkConfigBody(configWindowVisible, sidebarVisible) && settled)
