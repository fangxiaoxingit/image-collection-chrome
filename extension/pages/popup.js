import { setParseCandidates } from '../utils/storage.js'

const MIN_WIDTH = 120
const MIN_HEIGHT = 120
const MIN_AREA = 120 * 120

const elements = {
  openList: document.getElementById('openList'),
  parsePage: document.getElementById('parsePage')
}

function getListPageUrl() {
  return chrome.runtime.getURL('pages/list.html')
}

function getParsePageUrl() {
  return chrome.runtime.getURL('pages/parse.html')
}

function collectImagesFromDocument(minWidth, minHeight, minArea) {
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

function mergeImageCandidates(frameResults) {
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

async function openListPage() {
  await chrome.tabs.create({ url: getListPageUrl() })
  window.close()
}

async function parseCurrentPage() {
  elements.parsePage.disabled = true

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      alert('未找到当前标签页。')
      return
    }

    const frameResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: collectImagesFromDocument,
      args: [MIN_WIDTH, MIN_HEIGHT, MIN_AREA]
    })

    const merged = mergeImageCandidates(frameResults)
    await setParseCandidates({
      sourceUrl: typeof tab.url === 'string' ? tab.url : '',
      createdAt: Date.now(),
      items: merged
    })

    await chrome.tabs.create({ url: getParsePageUrl() })
    window.close()
  } catch (error) {
    alert(`解析失败：${String(error)}`)
  } finally {
    elements.parsePage.disabled = false
  }
}

elements.openList.addEventListener('click', () => {
  openListPage()
})

elements.parsePage.addEventListener('click', () => {
  parseCurrentPage()
})
