import {
  clearAll,
  getDownloadBaseDir,
  getDownloadQueryParam,
  getList,
  removeById,
  setDownloadBaseDir,
  setDownloadQueryParam,
  setAllSelected,
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
  selectAll: document.getElementById('selectAll'),
  unselectAll: document.getElementById('unselectAll'),
  refresh: document.getElementById('refresh'),
  download: document.getElementById('download'),
  clear: document.getElementById('clear'),
  usageGuide: document.getElementById('usageGuide'),
  queryParam: document.getElementById('queryParam'),
  downloadDir: document.getElementById('downloadDir'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('modalClose'),
  modalDownload: document.getElementById('modalDownload'),
  modalDelete: document.getElementById('modalDelete'),
  modalText: document.getElementById('modalText'),
  modalImageWrap: document.getElementById('modalImageWrap'),
  modalImage: document.getElementById('modalImage'),
  modalPrev: document.getElementById('modalPrev'),
  modalNext: document.getElementById('modalNext')
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

function openGuideModal() {
  state.previewIndex = -1
  elements.modalTitle.textContent = '下载设置说明'
  elements.modalText.innerHTML = `
    <p>按下面 4 步设置后，批量下载会更顺畅：</p>
    <ol>
      <li>在浏览器地址栏打开 <code>chrome://settings/downloads</code>。</li>
      <li>关闭“下载前询问每个文件的保存位置（Ask where to save each file before downloading）”。</li>
      <li>回到插件页面，在“下载目录”填写你想要的子目录（例如 <code>image-collector</code>）；留空就使用系统默认下载目录。</li>
      <li>打开 <code>chrome://extensions/</code>，点击本插件“重新加载”后再测试下载。</li>
    </ol>
  `
  elements.modalText.classList.remove('is-hidden')
  elements.modalImageWrap.classList.add('is-hidden')
  elements.modalDownload.classList.add('is-hidden')
  elements.modalDelete.classList.add('is-hidden')
  elements.modalPrev.classList.add('is-hidden')
  elements.modalNext.classList.add('is-hidden')
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
  elements.modalText.classList.add('is-hidden')
  elements.modalImageWrap.classList.remove('is-hidden')
  elements.modalDownload.classList.remove('is-hidden')
  elements.modalDelete.classList.remove('is-hidden')
  elements.modalPrev.classList.remove('is-hidden')
  elements.modalNext.classList.remove('is-hidden')
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

  await handleSaveQueryParam()
  await handleSaveDownloadBaseDir()

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

function createCard(item) {
  const card = document.createElement('article')
  card.className = 'card'

  const previewWrap = document.createElement('div')
  previewWrap.className = 'preview-wrap'

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

  for (const item of state.list) {
    elements.list.appendChild(createCard(item))
  }

  updateSelectedCount()
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
  elements.queryParam.value = state.queryParam
  elements.downloadDir.value = state.downloadBaseDir
}

async function handleSelectAll(selected) {
  state.list = await setAllSelected(selected)
  renderList()
}

async function handleSaveQueryParam() {
  const nextValue = elements.queryParam.value.trim().replace(/^\?+/, '')
  state.queryParam = await setDownloadQueryParam(nextValue)
  elements.queryParam.value = state.queryParam
}

async function handleSaveDownloadBaseDir() {
  const nextValue = elements.downloadDir.value
  state.downloadBaseDir = await setDownloadBaseDir(nextValue)
  elements.downloadDir.value = state.downloadBaseDir
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

  await handleSaveQueryParam()
  await handleSaveDownloadBaseDir()
  const result = await batchDownload(selectedItems, {
    concurrency: 3,
    queryParamOverride: state.queryParam,
    folder: buildDownloadFolder()
  })
  alert(`下载完成：成功 ${result.successCount}，失败 ${result.failCount}`)
}

async function handleClear() {
  const shouldClear = confirm('确定清空全部采集记录吗？')
  if (!shouldClear) return

  state.list = await clearAll()
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

  elements.clear.addEventListener('click', () => {
    handleClear()
  })

  elements.refresh.addEventListener('click', () => {
    handleRefresh()
  })

  elements.usageGuide.addEventListener('click', () => {
    openGuideModal()
  })

  elements.queryParam.addEventListener('change', () => {
    handleSaveQueryParam()
  })

  elements.queryParam.addEventListener('blur', () => {
    handleSaveQueryParam()
  })

  elements.downloadDir.addEventListener('change', () => {
    handleSaveDownloadBaseDir()
  })

  elements.downloadDir.addEventListener('blur', () => {
    handleSaveDownloadBaseDir()
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
