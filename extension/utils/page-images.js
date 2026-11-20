export const MIN_WIDTH = 120
export const MIN_HEIGHT = 120
export const MIN_AREA = 120 * 120

// Kept self-contained: Chrome serializes this function into the target page.
export function collectImagesFromDocument(minWidth, minHeight, minArea) {
  const result = []
  const imgs = Array.from(document.querySelectorAll('img'))

  for (const img of imgs) {
    const url = (img.currentSrc || img.src || '').trim()
    if (!/^https?:\/\//i.test(url)) continue

    const width = Number(img.naturalWidth || img.width || img.clientWidth || 0)
    const height = Number(img.naturalHeight || img.height || img.clientHeight || 0)

    if (width < minWidth || height < minHeight) continue
    if (width * height < minArea) continue

    result.push({
      url,
      width,
      height,
      alt: typeof img.alt === 'string' ? img.alt : ''
    })
  }

  return result
}

export function mergeImageCandidates(frameResults) {
  const mergedByUrl = new Map()

  for (const frameResult of frameResults) {
    const items = Array.isArray(frameResult.result) ? frameResult.result : []
    for (const item of items) {
      if (!item || typeof item.url !== 'string') continue
      if (!mergedByUrl.has(item.url)) {
        mergedByUrl.set(item.url, item)
        continue
      }

      const prev = mergedByUrl.get(item.url)
      if ((item.width || 0) * (item.height || 0) > (prev.width || 0) * (prev.height || 0)) {
        mergedByUrl.set(item.url, item)
      }
    }
  }

  return Array.from(mergedByUrl.values()).sort(
    (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
  )
}

export async function parseTabImages(tabId) {
  const frameResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: collectImagesFromDocument,
    args: [MIN_WIDTH, MIN_HEIGHT, MIN_AREA]
  })
  return mergeImageCandidates(frameResults)
}
