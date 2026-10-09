import {
  clearAll,
  getDownloadBaseDir,
  getDownloadQueryParam,
  getDateGroupPeriod,
  getList,
  removeById,
  removeByIds,
  setDownloadBaseDir,
  setDownloadQueryParam,
  setDateGroupPeriod,
  setAllSelected,
  setList,
  setSelectedById
} from '../utils/storage.js'
import { batchDownload } from '../utils/download.js'
import { groupImagesByDate } from '../utils/date-groups.js'
import { bindLanguageSelector, getLanguage, initI18n, t, translatePage } from '../utils/i18n.js'

const state = {
  list: [],
  viewList: [],
  groupPeriod: 'day',
  queryParam: 'format=jpg&name=large',
  downloadBaseDir: '',
  previewIndex: -1,
  modalMode: null
}

const elements = {
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  count: document.getElementById('count'),
  totalCount: document.getElementById('totalCount'),
  selectAll: document.getElementById('selectAll'),
  unselectAll: document.getElementById('unselectAll'),
  refresh: document.getElementById('refresh'),
  dateGrouping: document.getElementById('dateGrouping'),
  download: document.getElementById('download'),
  batchDelete: document.getElementById('batchDelete'),
  sendMail: document.getElementById('sendMail'),
  clear: document.getElementById('clear'),
  moreActions: document.getElementById('moreActions'),
  usageGuide: document.getElementById('usageGuide'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('modalClose'),
  modalDownload: document.getElementById('modalDownload'),
  modalDelete: document.getElementById('modalDelete'),
  modalText: document.getElementById('modalText'),
  modalConfig: document.getElementById('modalConfig'),
  modalImageWrap: document.getElementById('modalImageWrap'),
  modalImage: document.getElementById('modalImage'),
  modalPrev: document.getElementById('modalPrev'),
  modalNext: document.getElementById('modalNext'),
  configDownloadDir: document.getElementById('configDownloadDir'),
  configQueryParam: document.getElementById('configQueryParam'),
  exportJson: document.getElementById('exportJson'),
  importJson: document.getElementById('importJson'),
  importJsonFile: document.getElementById('importJsonFile')
}

function shortenUrl(url) {
  if (url.length <= 60) return url
  return `${url.slice(0, 57)}...`
}

function getSelectedItems() {
  return state.list.filter((item) => item.selected)
}

function updateSelectedCount() {
  const selectedCount = getSelectedItems().length
  elements.count.textContent = t('selectedCount', { count: selectedCount })
}

function updateTotalCount() {
  elements.totalCount.textContent = t('totalCount', { count: state.list.length })
}

function toggleEmpty() {
  elements.empty.classList.toggle('show', state.list.length === 0)
}

function setModalVisible(visible) {
  elements.modalOverlay.hidden = !visible
  document.body.classList.toggle('modal-open', visible)
}

function closeModal() {
  setModalVisible(false)
  state.previewIndex = -1
  elements.modalImage.removeAttribute('src')
}

function setModalMode(mode) {
  state.modalMode = mode
  const isGuide = mode === 'guide'
  const isImage = mode === 'image'
  const isConfig = mode === 'config'

  elements.modalText.classList.toggle('is-hidden', !isGuide)
  elements.modalConfig.classList.toggle('is-hidden', !isConfig)
  elements.modalImageWrap.classList.toggle('is-hidden', !isImage)
  elements.modalDownload.classList.toggle('is-hidden', !isImage)
  elements.modalDelete.classList.toggle('is-hidden', !isImage)
  elements.modalPrev.classList.toggle('is-hidden', !isImage)
  elements.modalNext.classList.toggle('is-hidden', !isImage)
}

function syncConfigInputsFromState() {
  elements.configQueryParam.value = state.queryParam
  elements.configDownloadDir.value = state.downloadBaseDir
}

function openGuideModal() {
  state.previewIndex = -1
  elements.modalTitle.textContent = t('downloadGuideTitle')
  setModalMode('guide')
  setModalVisible(true)
}

function openMoreModal() {
  state.previewIndex = -1
  elements.modalTitle.textContent = t('moreActions')
  syncConfigInputsFromState()
  setModalMode('config')
  setModalVisible(true)
}

function getCurrentPreviewItem() {
  if (state.previewIndex < 0 || state.previewIndex >= state.viewList.length) return null
  return state.viewList[state.previewIndex]
}

function updatePreviewNavState() {
  const hasPrev = state.previewIndex > 0
  const hasNext = state.previewIndex >= 0 && state.previewIndex < state.viewList.length - 1

  elements.modalPrev.disabled = !hasPrev
  elements.modalNext.disabled = !hasNext
}

function openImageModalByIndex(index) {
  if (index < 0 || index >= state.viewList.length) return

  state.previewIndex = index
  const item = state.viewList[index]
  elements.modalTitle.textContent = t('imagePreviewTitle', { index: index + 1, count: state.viewList.length })
  elements.modalImage.src = item.url
  elements.modalImage.alt = t('previewImageAlt')
  setModalMode('image')
  updatePreviewNavState()
  setModalVisible(true)
}

function openImageModalById(id) {
  const index = state.viewList.findIndex((item) => item.id === id)
  if (index < 0) return
  openImageModalByIndex(index)
}

function handlePreviewStep(step) {
  if (state.previewIndex < 0) return

  const nextIndex = state.previewIndex + step
  if (nextIndex < 0) {
    alert(t('noPreviousWallpaper'))
    return
  }

  if (nextIndex >= state.viewList.length) {
    alert(t('noNextWallpaper'))
    return
  }

  openImageModalByIndex(nextIndex)
}

async function handlePreviewDownload() {
  const item = getCurrentPreviewItem()
  if (!item) return

  const result = await batchDownload([item], {
    concurrency: 1,
    queryParamOverride: state.queryParam,
    folder: buildDownloadFolder()
  })

  if (result.successCount > 0) {
    alert(t('wallpaperDownloadSucceeded'))
    return
  }

  alert(t('wallpaperDownloadFailed'))
}

async function handlePreviewDelete() {
  const item = getCurrentPreviewItem()
  if (!item) return

  const shouldDelete = confirm(t('deleteCurrentWallpaperConfirm'))
  if (!shouldDelete) return

  const removedIndex = state.previewIndex
  state.list = await removeById(item.id)
  renderList()

  if (state.list.length === 0) {
    closeModal()
    alert(t('noMoreWallpapers'))
    return
  }

  if (removedIndex < state.viewList.length) {
    openImageModalByIndex(removedIndex)
    return
  }

  const prevIndex = state.viewList.length - 1
  if (prevIndex >= 0) {
    openImageModalByIndex(prevIndex)
    alert(t('switchedToPreviousWallpaper'))
    return
  }

  closeModal()
  alert(t('noMoreWallpapers'))
}

function isImagePreviewOpen() {
  return !elements.modalOverlay.hidden && !elements.modalImageWrap.classList.contains('is-hidden')
}

function handlePreviewHotkey(event) {
  if (!isImagePreviewOpen()) return

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    handlePreviewStep(-1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    handlePreviewStep(1)
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && !elements.modalOverlay.hidden) {
    closeModal()
    return
  }

  handlePreviewHotkey(event)
}

function createCard(item, index) {
  const card = document.createElement('article')
  card.className = 'card'

  const previewWrap = document.createElement('div')
  previewWrap.className = 'preview-wrap'

  const indexBadge = document.createElement('span')
  indexBadge.className = 'card-index'
  indexBadge.textContent = index + 1
  previewWrap.appendChild(indexBadge)

  const preview = document.createElement('img')
  preview.src = item.preview || item.url
  preview.alt = item.url
  preview.loading = 'lazy'
  preview.addEventListener('click', () => {
    openImageModalById(item.id)
  })
  previewWrap.appendChild(preview)

  const delButton = document.createElement('button')
  delButton.className = 'delete delete-float'
  delButton.type = 'button'
  delButton.dataset.i18n = 'delete'
  delButton.textContent = t('delete')
  delButton.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    state.list = await removeById(item.id)
    renderList()
  })
  previewWrap.appendChild(delButton)

  const meta = document.createElement('div')
  meta.className = 'card-meta'

  const rowMain = document.createElement('div')
  rowMain.className = 'card-row'

  const checkboxLabel = document.createElement('label')
  checkboxLabel.className = 'check-label'
  const checkboxText = document.createElement('span')
  checkboxText.dataset.i18n = 'selectImage'
  checkboxText.textContent = t('selectImage')
  checkboxLabel.appendChild(checkboxText)

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = item.selected
  checkbox.addEventListener('change', async () => {
    state.list = await setSelectedById(item.id, checkbox.checked)
    updateSelectedCount()
  })
  checkboxLabel.prepend(checkbox)
  rowMain.appendChild(checkboxLabel)

  const rowBottom = document.createElement('div')
  rowBottom.className = 'card-row'

  const link = document.createElement('a')
  link.className = 'url-link'
  link.href = item.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.title = item.url
  link.textContent = shortenUrl(item.url)
  rowBottom.appendChild(link)

  meta.appendChild(rowMain)
  meta.appendChild(rowBottom)

  card.appendChild(previewWrap)
  card.appendChild(meta)

  return card
}

function renderList() {
  elements.list.innerHTML = ''
  const groups = groupImagesByDate(state.list, state.groupPeriod, getLanguage())
  state.viewList = groups.flatMap((group) => group.items)
  let cardIndex = 0
  const fragment = document.createDocumentFragment()

  for (const group of groups) {
    const section = document.createElement('section')
    section.className = 'date-group'
    section.dataset.groupKey = group.key
    const header = document.createElement('div')
    header.className = 'date-group-header'
    const title = document.createElement('h2')
    title.className = 'date-group-title'
    title.textContent = group.label
    const count = document.createElement('span')
    count.className = 'date-group-count'
    count.textContent = t('groupImageCount', { count: group.items.length })
    header.append(title, count)
    const grid = document.createElement('div')
    grid.className = 'grid'
    for (const item of group.items) {
      grid.appendChild(createCard(item, cardIndex++))
    }
    section.append(header, grid)
    fragment.appendChild(section)
  }
  elements.list.appendChild(fragment)

  updateSelectedCount()
  updateTotalCount()
  toggleEmpty()
}

async function loadList() {
  state.list = await getList()
  renderList()
}

async function loadSettings() {
  const [queryParam, downloadBaseDir, groupPeriod] = await Promise.all([
    getDownloadQueryParam(),
    getDownloadBaseDir(),
    getDateGroupPeriod()
  ])
  state.queryParam = queryParam
  state.downloadBaseDir = downloadBaseDir
  state.groupPeriod = groupPeriod
  elements.dateGrouping.value = groupPeriod
  syncConfigInputsFromState()
}

async function handleSelectAll(selected) {
  state.list = await setAllSelected(selected)
  renderList()
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

let configSaveRevision = 0

async function persistConfigFromInputs() {
  const revision = ++configSaveRevision
  const queryInput = elements.configQueryParam.value
  const dirInput = elements.configDownloadDir.value
  const nextQuery = normalizeQueryParamValue(queryInput)
  const nextDir = normalizeDownloadDirValue(dirInput)

  const [savedQuery, savedDir] = await Promise.all([
    setDownloadQueryParam(nextQuery),
    setDownloadBaseDir(nextDir)
  ])

  if (revision !== configSaveRevision) return

  state.queryParam = savedQuery
  state.downloadBaseDir = savedDir
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

function mergeImportedImages(importedImages) {
  const merged = state.list.slice()
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
    state.queryParam = await setDownloadQueryParam(normalizeQueryParamValue(nextQuery))
    changed = true
  }

  if (nextDir !== null) {
    state.downloadBaseDir = await setDownloadBaseDir(normalizeDownloadDirValue(nextDir))
    changed = true
  }

  if (changed) {
    syncConfigInputsFromState()
  }

  return changed
}

function buildExportPayload() {
  return {
    version: 1,
    type: 'image-collector-export',
    exportedAt: new Date().toISOString(),
    data: {
      settings: {
        queryParam: state.queryParam,
        downloadBaseDir: state.downloadBaseDir
      },
      images: state.list.map((item) => ({
        id: item.id,
        url: item.url,
        preview: item.preview,
        createdAt: item.createdAt,
        selected: Boolean(item.selected)
      }))
    }
  }
}

async function handleExportJson() {
  await persistConfigFromInputs()

  const payload = buildExportPayload()
  const jsonText = JSON.stringify(payload, null, 2)
  const blob = new Blob([jsonText], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const datePart = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `image-collector-${datePart}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function triggerImportJson() {
  elements.importJsonFile.click()
}

async function handleImportJsonFile(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const { images, settings } = unpackImportPayload(parsed)
    const { merged, addedCount } = mergeImportedImages(images)

    if (addedCount > 0) {
      state.list = await setList(merged)
      renderList()
    }

    const settingsChanged = await applyImportedSettings(settings)

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

function getMonthFolder(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function buildDownloadFolder() {
  const monthFolder = getMonthFolder()
  const baseDir = state.downloadBaseDir
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  if (!baseDir) return monthFolder
  return `${baseDir}/${monthFolder}`
}

async function handleBatchDownload() {
  const selectedItems = getSelectedItems()
  if (selectedItems.length === 0) {
    alert(t('selectImageFirst'))
    return
  }

  const result = await batchDownload(selectedItems, {
    concurrency: 3,
    queryParamOverride: state.queryParam,
    folder: buildDownloadFolder()
  })
  alert(t('downloadCompleted', { succeeded: result.successCount, failed: result.failCount }))
}

function buildMailtoUrlFromSelected(selectedList) {
  const body = selectedList.map((item) => item.url).join('\n')
  return `mailto:?subject=${encodeURIComponent(t('mailSubject'))}&body=${encodeURIComponent(body)}`
}

function handleSendMail() {
  const selectedList = getSelectedItems()
  if (selectedList.length === 0) {
    alert(t('selectImageBeforeMail'))
    return
  }

  const url = buildMailtoUrlFromSelected(selectedList)

  // mailto URL is handled by the OS/default mail client; too long payload may be rejected by some clients.
  if (url.length > 1800) {
    alert(t('mailTooLong'))
  }

  chrome.tabs.create({ url })
}

async function handleClear() {
  const shouldClear = confirm(t('clearAllConfirm'))
  if (!shouldClear) return

  state.list = await clearAll()
  renderList()
}

async function handleBatchDelete() {
  const selectedItems = getSelectedItems()
  if (selectedItems.length === 0) {
    alert(t('selectImageFirst'))
    return
  }

  const shouldDelete = confirm(t('batchDeleteConfirm', { count: selectedItems.length }))
  if (!shouldDelete) return

  const idsToDelete = selectedItems.map((item) => item.id)
  state.list = await removeByIds(idsToDelete)
  renderList()
}

async function handleRefresh() {
  await loadSettings()
  await loadList()
}

function bindEvents() {
  elements.dateGrouping.addEventListener('change', async () => {
    state.groupPeriod = elements.dateGrouping.value
    renderList()
    await setDateGroupPeriod(state.groupPeriod)
  })
  elements.selectAll.addEventListener('click', () => {
    handleSelectAll(true)
  })

  elements.unselectAll.addEventListener('click', () => {
    handleSelectAll(false)
  })

  elements.download.addEventListener('click', () => {
    handleBatchDownload()
  })

  elements.batchDelete.addEventListener('click', () => {
    handleBatchDelete()
  })

  elements.sendMail.addEventListener('click', () => {
    handleSendMail()
  })

  elements.clear.addEventListener('click', () => {
    handleClear()
  })

  elements.refresh.addEventListener('click', () => {
    handleRefresh()
  })

  elements.usageGuide.addEventListener('click', () => {
    openGuideModal()
  })

  elements.moreActions.addEventListener('click', () => {
    openMoreModal()
  })

  elements.configQueryParam.addEventListener('change', () => {
    persistConfigFromInputs()
  })

  elements.configQueryParam.addEventListener('blur', () => {
    persistConfigFromInputs()
  })

  elements.configDownloadDir.addEventListener('change', () => {
    persistConfigFromInputs()
  })

  elements.configDownloadDir.addEventListener('blur', () => {
    persistConfigFromInputs()
  })

  elements.exportJson.addEventListener('click', () => {
    handleExportJson()
  })

  elements.importJson.addEventListener('click', () => {
    triggerImportJson()
  })

  elements.importJsonFile.addEventListener('change', (event) => {
    handleImportJsonFile(event)
  })

  elements.modalClose.addEventListener('click', () => {
    closeModal()
  })

  elements.modalDownload.addEventListener('click', () => {
    handlePreviewDownload()
  })

  elements.modalDelete.addEventListener('click', () => {
    handlePreviewDelete()
  })

  elements.modalPrev.addEventListener('click', () => {
    handlePreviewStep(-1)
  })

  elements.modalNext.addEventListener('click', () => {
    handlePreviewStep(1)
  })

  elements.modalOverlay.addEventListener('click', (event) => {
    if (event.target === elements.modalOverlay) {
      closeModal()
    }
  })

  document.addEventListener('keydown', handleGlobalKeydown)
}

function localizePage() {
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const panel = elements.modalOverlay.querySelector('.modal-panel')
  const panelScrollTop = panel.scrollTop
  const panelScrollLeft = panel.scrollLeft
  translatePage()
  updateSelectedCount()
  updateTotalCount()
  const groups = new Map(groupImagesByDate(state.list, state.groupPeriod, getLanguage()).map((group) => [group.key, group]))
  for (const section of elements.list.querySelectorAll('.date-group')) {
    const group = groups.get(section.dataset.groupKey)
    if (!group) continue
    section.querySelector('.date-group-title').textContent = group.label
    section.querySelector('.date-group-count').textContent = t('groupImageCount', { count: group.items.length })
  }
  if (state.modalMode === 'guide') elements.modalTitle.textContent = t('downloadGuideTitle')
  if (state.modalMode === 'config') elements.modalTitle.textContent = t('moreActions')
  if (state.modalMode === 'image' && state.previewIndex >= 0) {
    elements.modalTitle.textContent = t('imagePreviewTitle', {
      index: state.previewIndex + 1,
      count: state.viewList.length
    })
  }
  window.scrollTo(scrollX, scrollY)
  panel.scrollTop = panelScrollTop
  panel.scrollLeft = panelScrollLeft
}

await initI18n(localizePage)
bindLanguageSelector(document.getElementById('languageSelect'))

closeModal()
bindEvents()
handleRefresh()
