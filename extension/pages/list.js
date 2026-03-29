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
  downloadBaseDir: ''
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
  queryParam: document.getElementById('queryParam'),
  downloadDir: document.getElementById('downloadDir')
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

function createCard(item) {
  const card = document.createElement('article')
  card.className = 'card'

  const previewWrap = document.createElement('div')
  previewWrap.className = 'preview-wrap'

  const preview = document.createElement('img')
  preview.src = item.preview || item.url
  preview.alt = item.url
  preview.loading = 'lazy'
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
}

bindEvents()
loadSettings()
loadList()
