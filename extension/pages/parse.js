import { addImagesIfNotExists, getParseCandidates, setParseCandidates } from '../utils/storage.js'

const MIN_WIDTH = 120
const MIN_HEIGHT = 120
const MIN_AREA = 120 * 120

const state = {
  sourceUrl: '',
  items: [],
  previewIndex: -1
}

const elements = {
  sourceUrl: document.getElementById('sourceUrl'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  count: document.getElementById('count'),
  selectAll: document.getElementById('selectAll'),
  unselectAll: document.getElementById('unselectAll'),
  addSelected: document.getElementById('addSelected'),
  reload: document.getElementById('reload'),
  openList: document.getElementById('openList'),
  parseForm: document.getElementById('parseForm'),
  parseUrlInput: document.getElementById('parseUrlInput'),
  parseByUrl: document.getElementById('parseByUrl'),
  previewOverlay: document.getElementById('previewOverlay'),
  previewTitle: document.getElementById('previewTitle'),
  previewImage: document.getElementById('previewImage'),
  previewPrev: document.getElementById('previewPrev'),
  previewNext: document.getElementById('previewNext'),
  previewClose: document.getElementById('previewClose')
}

function shortenUrl(url) {
  if (url.length <= 80) return url
  return `${url.slice(0, 77)}...`
}

function formatBytes(sizeBytes) {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '未知'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = sizeBytes
  let idx = 0

  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }

  const value = idx === 0 ? Math.round(size) : size.toFixed(1)
  return `${value}${units[idx]}`
}

function buildMetricsText(item) {
  return `分辨率 ${item.width}x${item.height} | 大小 ${formatBytes(item.sizeBytes)}`
}

function updateCount() {
  const selectedCount = state.items.filter((item) => item.selected).length
  elements.count.textContent = `已勾选 ${selectedCount} 项`
}

function toggleEmpty() {
  elements.empty.classList.toggle('show', state.items.length === 0)
}

function setPreviewVisible(visible) {
  elements.previewOverlay.hidden = !visible
  document.body.classList.toggle('preview-open', visible)
}

function closePreview() {
  setPreviewVisible(false)
  state.previewIndex = -1
  elements.previewImage.removeAttribute('src')
}

function updatePreviewNavState() {
  const hasPrev = state.previewIndex > 0
  const hasNext = state.previewIndex >= 0 && state.previewIndex < state.items.length - 1

  elements.previewPrev.disabled = !hasPrev
  elements.previewNext.disabled = !hasNext
}

function openPreviewByIndex(index) {
  if (index < 0 || index >= state.items.length) return

  state.previewIndex = index
  const item = state.items[index]
  elements.previewTitle.textContent = `图片预览 (${index + 1}/${state.items.length})`
  elements.previewImage.src = item.url
  elements.previewImage.alt = item.alt || item.url
  updatePreviewNavState()
  setPreviewVisible(true)
}

function previewStep(step) {
  if (state.previewIndex < 0) return

  const nextIndex = state.previewIndex + step
  if (nextIndex < 0) {
    alert('已经不存在上一张图片。')
    return
  }

  if (nextIndex >= state.items.length) {
    alert('已经不存在下一张图片。')
    return
  }

  openPreviewByIndex(nextIndex)
}

function isPreviewOpen() {
  return !elements.previewOverlay.hidden
}

function handlePreviewHotkey(event) {
  if (!isPreviewOpen()) return

  if (event.key === 'Escape') {
    closePreview()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    previewStep(-1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    previewStep(1)
  }
}

function updateMetricsForItem(itemId) {
  const item = state.items.find((it) => it.id === itemId)
  if (!item) return

  const node = document.querySelector(`[data-metrics-id="${itemId}"]`)
  if (!node) return

  node.textContent = buildMetricsText(item)
}

function render() {
  elements.grid.innerHTML = ''

  for (const item of state.items) {
    const card = document.createElement('article')
    card.className = 'card'

    const img = document.createElement('img')
    img.src = item.url
    img.alt = item.alt || item.url
    img.loading = 'lazy'
    img.addEventListener('click', () => {
      const index = state.items.findIndex((it) => it.id === item.id)
      openPreviewByIndex(index)
    })
    card.appendChild(img)

    const meta = document.createElement('div')
    meta.className = 'card-meta'

    const lineTop = document.createElement('div')
    lineTop.className = 'card-line'

    const label = document.createElement('label')
    label.textContent = '勾选'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = Boolean(item.selected)
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked
      updateCount()
    })
    label.prepend(checkbox)
    lineTop.appendChild(label)

    const metrics = document.createElement('span')
    metrics.className = 'metrics'
    metrics.dataset.metricsId = item.id
    metrics.textContent = buildMetricsText(item)
    lineTop.appendChild(metrics)

    const lineBottom = document.createElement('div')
    lineBottom.className = 'card-line'

    const link = document.createElement('a')
    link.className = 'url'
    link.href = item.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.title = item.url
    link.textContent = shortenUrl(item.url)
    lineBottom.appendChild(link)

    meta.appendChild(lineTop)
    meta.appendChild(lineBottom)
    card.appendChild(meta)
    elements.grid.appendChild(card)
  }

  updateCount()
  toggleEmpty()
}

function normalizeCandidate(item, index) {
  return {
    id: `cand_${Date.now()}_${index}_${Math.random().toString(16).slice(2, 8)}`,
    url: item.url,
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    alt: typeof item.alt === 'string' ? item.alt : '',
    selected: false,
    sizeBytes: null,
    sizeResolved: false
  }
}

function applyCandidates(payload) {
  state.sourceUrl = payload.sourceUrl || ''
  elements.sourceUrl.textContent = state.sourceUrl || '当前来源：未知页面'

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  state.items = rawItems.map((item, index) => normalizeCandidate(item, index))
  render()
  resolveCandidateSizes()
}

async function loadCandidates() {
  const payload = await getParseCandidates()
  applyCandidates(payload)
}

function setAllSelected(selected) {
  state.items = state.items.map((item) => ({ ...item, selected: Boolean(selected) }))
  render()
}

async function addSelected() {
  const selectedUrls = state.items.filter((item) => item.selected).map((item) => item.url)
  if (selectedUrls.length === 0) {
    alert('请先勾选至少一张图片。')
    return
  }

  const result = await addImagesIfNotExists(selectedUrls)
  alert(`添加完成：新增 ${result.addedCount}，跳过 ${result.skippedCount}`)
}

function openList() {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/list.html') })
}

function normalizeInputUrl(value) {
  const text = (value || '').trim()
  if (!text) return ''

  if (/^https?:\/\//i.test(text)) return text
  return `https://${text}`
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

async function waitTabComplete(tabId, timeoutMs = 18000) {
  const current = await chrome.tabs.get(tabId).catch(() => null)
  if (current && current.status === 'complete') return

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error('页面加载超时，请稍后重试。'))
    }, timeoutMs)

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return
      if (changeInfo.status !== 'complete') return

      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }

    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

async function parseByUrl(url) {
  let tempTabId = null

  try {
    const tab = await chrome.tabs.create({ url, active: false })
    tempTabId = tab.id
    await waitTabComplete(tab.id)

    const frameResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: collectImagesFromDocument,
      args: [MIN_WIDTH, MIN_HEIGHT, MIN_AREA]
    })

    const merged = mergeImageCandidates(frameResults)
    const payload = {
      sourceUrl: url,
      createdAt: Date.now(),
      items: merged
    }

    await setParseCandidates(payload)
    applyCandidates(payload)
  } finally {
    if (tempTabId !== null) {
      chrome.tabs.remove(tempTabId).catch(() => {})
    }
  }
}

async function handleParseFormSubmit(event) {
  event.preventDefault()

  const raw = elements.parseUrlInput.value
  const normalized = normalizeInputUrl(raw)
  if (!normalized) {
    alert('请先输入一个网址。')
    return
  }

  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    alert('网址格式不正确，请检查后重试。')
    return
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    alert('仅支持解析 http/https 页面。')
    return
  }

  elements.parseByUrl.disabled = true

  try {
    await parseByUrl(parsed.toString())
  } catch (error) {
    alert(`解析失败：${String(error)}`)
  } finally {
    elements.parseByUrl.disabled = false
  }
}

async function fetchImageSizeBytes(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store'
    })

    const len = res.headers.get('content-length')
    const size = Number(len)
    if (Number.isFinite(size) && size > 0) return size
  } catch {
    // ignore
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store'
    })

    const contentRange = res.headers.get('content-range')
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/)
      if (match) {
        const size = Number(match[1])
        if (Number.isFinite(size) && size > 0) return size
      }
    }

    const len = res.headers.get('content-length')
    const size = Number(len)
    if (Number.isFinite(size) && size > 0) return size
  } catch {
    // ignore
  }

  return null
}

async function resolveCandidateSizes() {
  for (const item of state.items) {
    if (item.sizeResolved) continue

    item.sizeResolved = true
    const size = await fetchImageSizeBytes(item.url)
    item.sizeBytes = size
    updateMetricsForItem(item.id)
  }
}

elements.selectAll.addEventListener('click', () => {
  setAllSelected(true)
})

elements.unselectAll.addEventListener('click', () => {
  setAllSelected(false)
})

elements.addSelected.addEventListener('click', () => {
  addSelected()
})

elements.reload.addEventListener('click', () => {
  loadCandidates()
})

elements.openList.addEventListener('click', () => {
  openList()
})

elements.parseForm.addEventListener('submit', (event) => {
  handleParseFormSubmit(event)
})

elements.previewClose.addEventListener('click', () => {
  closePreview()
})

elements.previewPrev.addEventListener('click', () => {
  previewStep(-1)
})

elements.previewNext.addEventListener('click', () => {
  previewStep(1)
})

elements.previewOverlay.addEventListener('click', (event) => {
  if (event.target === elements.previewOverlay) {
    closePreview()
  }
})

document.addEventListener('keydown', handlePreviewHotkey)

loadCandidates()
