/** Saves `text` as a JSON file through the browser's download. */
export const downloadJson = (text: string, fileName: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // After the click has handed the file to the browser.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
