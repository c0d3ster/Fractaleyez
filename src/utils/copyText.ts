/**
 * Puts `text` on the clipboard. The config pop-out is drawn by the main window's script, so the global `navigator` belongs to a
 * window that is not focused when the pop-out is clicked and the browser refuses the write; this goes through the window the
 * element is in instead, and falls back to selecting a hidden field if the clipboard API is refused anyway.
 */
export const copyText = async (element: HTMLElement, text: string): Promise<boolean> => {
  const doc = element.ownerDocument
  const view = doc.defaultView ?? window
  try {
    await view.navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = doc.createElement('textarea')
    field.value = text
    field.style.position = 'fixed'
    field.style.opacity = '0'
    doc.body.appendChild(field)
    field.select()
    const copied = doc.execCommand('copy')
    field.remove()
    return copied
  }
}
