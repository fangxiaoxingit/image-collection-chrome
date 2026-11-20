import {
  getDownloadBaseDir,
  getDownloadQueryParam,
  getList,
  getMenuOptions,
  setDownloadBaseDir,
  setDownloadQueryParam,
  setList,
  setMenuOption
} from '../utils/storage.js'
import { bindLanguageSelector, initI18n, t, translatePage } from '../utils/i18n.js'

const elements = {
  backToList: document.getElementById('backToList'),
  menuCollect: document.getElementById('menuCollectImage'),
  menuParse: document.getElementById('menuParsePage'),
  configDownloadDir: document.getElementById('configDownloadDir'),
  configQueryParam: document.getElementById('configQueryParam'),
  exportJson: document.getElementById('exportJson'),
  importJson: document.getElementById('importJson'),
  importJsonFile: document.getElementById('importJsonFile')
}

function normalizeQueryParamValue(value) {
  if (typeof value !== 'string') return 'format=jpg&name=large'
  return value.trim().replace(/^\?+/, '')
}

function normalizeDownloadDirValue(value) {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

let downloadSaveRevision = 0

async function persistDownloadSettings() {
  const revision = ++downloadSaveRevision
  const queryInput = elements.configQueryParam.value
  const dirInput = elements.configDownloadDir.value
  const nextQuery = normalizeQueryParamValue(queryInput)
  const nextDir = normalizeDownloadDirValue(dirInput)

  const [savedQuery, savedDir] = await Promise.all([
    setDownloadQueryParam(nextQuery),
    setDownloadBaseDir(nextDir)
  ])

  if (revision !== downloadSaveRevision) return

  if (elements.configQueryParam.value === queryInput) {
    elements.configQueryParam.value = savedQuery
  }
  if (elements.configDownloadDir.value === dirInput) {
    elements.configDownloadDir.value = savedDir
  }
}

function createFallbackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeImportedImage(item) {
  if (!item || typeof item !== 'object') return null
  if (typeof item.url !== 'string' || item.url.trim() === '') return null

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createFallbackId(),
    url: item.url.trim(),
    preview: typeof item.preview === 'string' && item.preview ? item.preview : item.url.trim(),
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    selected: Boolean(item.selected)
  }
}

function unpackImportPayload(payload) {
  if (Array.isArray(payload)) {
    return { images: payload, settings: {} }
  }

  if (!payload || typeof payload !== 'object') {
    return { images: [], settings: {} }
  }

  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const images =
    (Array.isArray(data.images) && data.images) ||
    (Array.isArray(payload.images) && payload.images) ||
    (Array.isArray(data.list) && data.list) ||
    (Array.isArray(payload.list) && payload.list) ||
    []

  const settings =
    (data.settings && typeof data.settings === 'object' && data.settings) ||
    (payload.settings && typeof payload.settings === 'object' && payload.settings) ||
    {}

  return { images, settings }
}

function mergeImportedImages(currentList, importedImages) {
  const merged = currentList.slice()
  const urlSet = new Set(merged.map((item) => item.url))
  let addedCount = 0

  for (const raw of importedImages) {
    const normalized = normalizeImportedImage(raw)
    if (!normalized) continue
    if (urlSet.has(normalized.url)) continue

    urlSet.add(normalized.url)
    merged.unshift({ ...normalized, selected: false })
    addedCount += 1
  }

  return { merged, addedCount }
}

async function applyImportedSettings(settings) {
  if (!settings || typeof settings !== 'object') return false

  let nextQuery = null
  if (typeof settings.queryParam === 'string') nextQuery = settings.queryParam
  if (nextQuery === null && typeof settings.query === 'string') nextQuery = settings.query

  let nextDir = null
  if (typeof settings.downloadBaseDir === 'string') nextDir = settings.downloadBaseDir
  if (nextDir === null && typeof settings.downloadDir === 'string') nextDir = settings.downloadDir
  if (nextDir === null && typeof settings.baseDir === 'string') nextDir = settings.baseDir

  let changed = false

  if (nextQuery !== null) {
    await setDownloadQueryParam(normalizeQueryParamValue(nextQuery))
    changed = true
  }

  if (nextDir !== null) {
    await setDownloadBaseDir(normalizeDownloadDirValue(nextDir))
    changed = true
  }

  const menuOptions = settings.menuOptions
  if (menuOptions && typeof menuOptions === 'object') {
    if (typeof menuOptions.collectImage === 'boolean') {
      await setMenuOption('collectImage', menuOptions.collectImage)
      changed = true
    }
    if (typeof menuOptions.parsePage === 'boolean') {
      await setMenuOption('parsePage', menuOptions.parsePage)
      changed = true
    }
  }

  return changed
}

async function handleExportJson() {
  await persistDownloadSettings()

  const [list, menuOptions, queryParam, downloadBaseDir] = await Promise.all([
    getList(),
    getMenuOptions(),
    getDownloadQueryParam(),
    getDownloadBaseDir()
  ])

  const payload = {
    version: 2,
    type: 'image-collector-export',
    exportedAt: new Date().toISOString(),
    data: {
      settings: { queryParam, downloadBaseDir, menuOptions },
      images: list.map((item) => ({
        id: item.id,
        url: item.url,
        preview: item.preview,
        createdAt: item.createdAt,
        selected: Boolean(item.selected)
      }))
    }
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `image-collector-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function handleImportJsonFile(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return

  try {
    const parsed = JSON.parse(await file.text())
    const { images, settings } = unpackImportPayload(parsed)
    const currentList = await getList()
    const { merged, addedCount } = mergeImportedImages(currentList, images)

    if (addedCount > 0) await setList(merged)

    const settingsChanged = await applyImportedSettings(settings)
    await loadSettings()

    if (addedCount === 0 && !settingsChanged) {
      alert(t('importNoChanges'))
    } else {
      alert(t(settingsChanged ? 'importCompletedWithSettings' : 'importCompleted', { count: addedCount }))
    }
  } catch (error) {
    alert(t('importFailed', { error: String(error) }))
  } finally {
    event.target.value = ''
  }
}

async function loadSettings() {
  const [menuOptions, queryParam, downloadBaseDir] = await Promise.all([
    getMenuOptions(),
    getDownloadQueryParam(),
    getDownloadBaseDir()
  ])

  elements.menuCollect.checked = menuOptions.collectImage
  elements.menuParse.checked = menuOptions.parsePage
  elements.configQueryParam.value = queryParam
  elements.configDownloadDir.value = downloadBaseDir
}

async function handleMenuToggle(key, input) {
  const enabled = input.checked
  try {
    await setMenuOption(key, enabled)
  } catch (error) {
    input.checked = !enabled
    alert(t('settingsSaveFailed', { error: String(error) }))
  }
}

function bindEvents() {
  elements.backToList.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('pages/list.html')
  })

  elements.menuCollect.addEventListener('change', () => {
    handleMenuToggle('collectImage', elements.menuCollect)
  })

  elements.menuParse.addEventListener('change', () => {
    handleMenuToggle('parsePage', elements.menuParse)
  })

  for (const input of [elements.configQueryParam, elements.configDownloadDir]) {
    input.addEventListener('change', persistDownloadSettings)
    input.addEventListener('blur', persistDownloadSettings)
  }

  elements.exportJson.addEventListener('click', () => {
    handleExportJson()
  })

  elements.importJson.addEventListener('click', () => {
    elements.importJsonFile.click()
  })

  elements.importJsonFile.addEventListener('change', (event) => {
    handleImportJsonFile(event)
  })
}

await initI18n(() => translatePage())
bindLanguageSelector(document.getElementById('languageSelect'))
bindEvents()
loadSettings()
