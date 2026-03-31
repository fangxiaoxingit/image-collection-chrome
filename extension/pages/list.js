import {
  clearAll,
  getDownloadBaseDir,
  getDownloadQueryParam,
  getList,
  removeById,
  removeByIds,
  setDownloadBaseDir,
  setDownloadQueryParam,
  setAllSelected,
  setList,
  setSelectedById
} from '../utils/storage.js'
import { batchDownload } from '../utils/download.js'

const state = {
  list: [],
  queryParam: 'format=jpg&name=large',
  downloadBaseDir: '',
  previewIndex: -1
}

const elements = {
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  count: document.getElementById('count'),
  totalCount: document.getElementById('totalCount'),
  selectAll: document.getElementById('selectAll'),
  unselectAll: document.getElementById('unselectAll'),
  refresh: document.getElementById('refresh'),
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
  elements.count.textContent = `已勾选 ${selectedCount} 项`
}

function updateTotalCount() {
  elements.totalCount.textContent = `(共 ${state.list.length} 张)`
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
  elements.modalTitle.textContent = '下载设置说明'
  elements.modalText.innerHTML = `
    <p>按下面 4 步设置后，批量下载会更顺畅：</p>
    <ol>
      <li>在浏览器地址栏打开 <code>chrome://settings/downloads</code>。</li>
      <li>关闭“下载前询问每个文件的保存位置（Ask where to save each file before downloading）”。</li>
      <li>回到插件页面，点“更多功能”，在“下载目录”填写子目录（例如 <code>image-collector</code>）；留空就使用系统默认下载目录。</li>
      <li>打开 <code>chrome://extensions/</code>，点击本插件“重新加载”后再测试下载。</li>
    </ol>
  `
  setModalMode('guide')
  setModalVisible(true)
}

function openMoreModal() {
  state.previewIndex = -1
  elements.modalTitle.textContent = '更多功能'
  syncConfigInputsFromState()
  setModalMode('config')
  setModalVisible(true)
}

function getCurrentPreviewItem() {
  if (state.previewIndex < 0 || state.previewIndex >= state.list.length) return null
  return state.list[state.previewIndex]
}

function updatePreviewNavState() {
  const hasPrev = state.previewIndex > 0
  const hasNext = state.previewIndex >= 0 && state.previewIndex < state.list.length - 1

  elements.modalPrev.disabled = !hasPrev
  elements.modalNext.disabled = !hasNext
}

function openImageModalByIndex(index) {
  if (index < 0 || index >= state.list.length) return

  state.previewIndex = index
  const item = state.list[index]
  elements.modalTitle.textContent = `图片预览 (${index + 1}/${state.list.length})`
  elements.modalImage.src = item.url
  elements.modalImage.alt = item.url
  setModalMode('image')
  updatePreviewNavState()
  setModalVisible(true)
}

function openImageModalById(id) {
  const index = state.list.findIndex((item) => item.id === id)
  if (index < 0) return
  openImageModalByIndex(index)
}

function handlePreviewStep(step) {
  if (state.previewIndex < 0) return

  const nextIndex = state.previewIndex + step
  if (nextIndex < 0) {
    alert('已经不存在上一张壁纸。')
    return
  }

  if (nextIndex >= state.list.length) {
    alert('已经不存在下一张壁纸。')
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
    alert('当前壁纸下载成功。')
    return
  }

  alert('当前壁纸下载失败，请稍后重试。')
}

async function handlePreviewDelete() {
  const item = getCurrentPreviewItem()
  if (!item) return

  const shouldDelete = confirm('确认删除当前壁纸吗？')
  if (!shouldDelete) return

  const removedIndex = state.previewIndex
  state.list = await removeById(item.id)
  renderList()

  if (state.list.length === 0) {
    closeModal()
    alert('已经不存在下一张壁纸或者上一张壁纸。')
    return
  }

  if (removedIndex < state.list.length) {
    openImageModalByIndex(removedIndex)
    return
  }

  const prevIndex = state.list.length - 1
  if (prevIndex >= 0) {
    openImageModalByIndex(prevIndex)
    alert('已不存在下一张壁纸，已切换到上一张壁纸。')
    return
  }

  closeModal()
  alert('已经不存在下一张壁纸或者上一张壁纸。')
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
  delButton.textContent = '删除'
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
  checkboxLabel.textContent = '勾选'

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

  state.list.forEach((item, index) => {
    elements.list.appendChild(createCard(item, index))
  })

  updateSelectedCount()
  updateTotalCount()
  toggleEmpty()
}

async function loadList() {
  state.list = await getList()
  renderList()
}

async function loadSettings() {
  const [queryParam, downloadBaseDir] = await Promise.all([
    getDownloadQueryParam(),
    getDownloadBaseDir()
  ])
  state.queryParam = queryParam
  state.downloadBaseDir = downloadBaseDir
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

async function persistConfigFromInputs() {
  const nextQuery = normalizeQueryParamValue(elements.configQueryParam.value)
  const nextDir = normalizeDownloadDirValue(elements.configDownloadDir.value)

  const [savedQuery, savedDir] = await Promise.all([
    setDownloadQueryParam(nextQuery),
    setDownloadBaseDir(nextDir)
  ])

  state.queryParam = savedQuery
  state.downloadBaseDir = savedDir
  syncConfigInputsFromState()
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
      alert('导入完成，但没有可新增的数据。')
    } else {
      alert(`导入完成：新增 ${addedCount} 张图片${settingsChanged ? '，并更新了配置' : ''}。`)
    }
  } catch (error) {
    alert(`导入失败：${String(error)}`)
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
    alert('请先勾选至少一张图片')
    return
  }

  const result = await batchDownload(selectedItems, {
    concurrency: 3,
    queryParamOverride: state.queryParam,
    folder: buildDownloadFolder()
  })
  alert(`下载完成：成功 ${result.successCount}，失败 ${result.failCount}`)
}

function buildMailtoUrlFromSelected(selectedList) {
  const body = selectedList.map((item) => item.url).join('\n')
  return `mailto:?subject=${encodeURIComponent('图片列表')}&body=${encodeURIComponent(body)}`
}

function handleSendMail() {
  const selectedList = getSelectedItems()
  if (selectedList.length === 0) {
    alert('请先勾选至少一张图片后再发送邮件。')
    return
  }

  const url = buildMailtoUrlFromSelected(selectedList)

  // mailto URL is handled by the OS/default mail client; too long payload may be rejected by some clients.
  if (url.length > 1800) {
    alert('选中图片较多，邮件内容可能过长，建议分批发送。')
  }

  chrome.tabs.create({ url })
}

async function handleClear() {
  const shouldClear = confirm('确定清空全部采集记录吗？')
  if (!shouldClear) return

  state.list = await clearAll()
  renderList()
}

async function handleBatchDelete() {
  const selectedItems = getSelectedItems()
  if (selectedItems.length === 0) {
    alert('请先勾选至少一张图片')
    return
  }

  const shouldDelete = confirm(`确定删除选中的 ${selectedItems.length} 张图片吗？`)
  if (!shouldDelete) return

  const idsToDelete = selectedItems.map((item) => item.id)
  state.list = await removeByIds(idsToDelete)
  renderList()
}

async function handleRefresh() {
  await Promise.all([loadSettings(), loadList()])
}

function bindEvents() {
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

closeModal()
bindEvents()
loadSettings()
loadList()
