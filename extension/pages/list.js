import {
  clearAll,
  DOWNLOAD_BASE_DIR_KEY,
  DOWNLOAD_QUERY_KEY,
  getDownloadBaseDir,
  getDownloadQueryParam,
  getDateGroupPeriod,
  getList,
  removeById,
  removeByIds,
  setDateGroupPeriod,
  setAllSelected,
  setSelectedById,
  setSelectedByIds
} from '../utils/storage.js'
import { batchDownload, buildDownloadFolder } from '../utils/download.js'
import { groupImagesByDate } from '../utils/date-groups.js'
import { getLanguage, initI18n, t, translatePage } from '../utils/i18n.js'

const state = {
  list: [],
  viewList: [],
  groupPeriod: 'day',
  queryParam: 'format=jpg&name=large',
  downloadBaseDir: '',
  previewIndex: -1
}

let selectionUpdates = Promise.resolve()

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
  openParse: document.getElementById('openParse'),
  openSettings: document.getElementById('openSettings'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('modalClose'),
  modalDownload: document.getElementById('modalDownload'),
  modalDelete: document.getElementById('modalDelete'),
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
  elements.count.textContent = t('selectedCount', { count: selectedCount })
}

function syncSelectionState() {
  const itemsById = new Map(state.list.map((item) => [item.id, item]))
  state.viewList = state.viewList.map((item) => itemsById.get(item.id) || item)
  for (const card of elements.list.querySelectorAll('.card')) {
    card.querySelector('input[type="checkbox"]').checked = Boolean(itemsById.get(card.dataset.id)?.selected)
  }
  updateSelectedCount()
}

function updateSelection(update) {
  selectionUpdates = selectionUpdates.then(async () => {
    const nextList = await update()
    const contentChanged = nextList.length !== state.list.length || nextList.some((item, index) => (
      ['id', 'url', 'preview', 'createdAt'].some((key) => item[key] !== state.list[index][key])
    ))
    state.list = nextList
    if (contentChanged) renderList()
    else syncSelectionState()
  }).catch((error) => {
    syncSelectionState()
    alert(t('selectionUpdateFailed', { error: error.message || String(error) }))
  })
  return selectionUpdates
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

function showImageModalControls() {
  for (const node of [
    elements.modalImageWrap,
    elements.modalDownload,
    elements.modalDelete,
    elements.modalPrev,
    elements.modalNext
  ]) {
    node.classList.remove('is-hidden')
  }
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
  showImageModalControls()
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
    folder: buildDownloadFolder(state.downloadBaseDir)
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
  card.dataset.id = item.id

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
    const selected = checkbox.checked
    await updateSelection(() => setSelectedById(item.id, selected))
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

  for (const [groupIndex, group] of groups.entries()) {
    const section = document.createElement('section')
    section.className = 'date-group'
    section.dataset.groupKey = group.key
    const header = document.createElement('div')
    header.className = 'date-group-header'
    const heading = document.createElement('div')
    heading.className = 'date-group-heading'
    const title = document.createElement('h2')
    title.className = 'date-group-title'
    title.id = `date-group-title-${groupIndex}`
    title.textContent = group.label
    const count = document.createElement('span')
    count.className = 'date-group-count'
    count.textContent = t('groupImageCount', { count: group.items.length })
    heading.append(title, count)
    const actions = document.createElement('div')
    actions.className = 'date-group-actions'
    actions.setAttribute('role', 'group')
    actions.setAttribute('aria-labelledby', title.id)
    const ids = group.items.map((item) => item.id)
    for (const [selected, key, color] of [[true, 'selectAll', 'btn-teal'], [false, 'deselectGroupAll', 'btn-ash']]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `date-group-button ${color}`
      const label = document.createElement('span')
      label.id = `date-group-action-${groupIndex}-${selected}`
      label.dataset.i18n = key
      label.textContent = t(key)
      button.appendChild(label)
      button.setAttribute('aria-labelledby', `${label.id} ${title.id}`)
      button.addEventListener('click', () => updateSelection(() => setSelectedByIds(ids, selected)))
      actions.appendChild(button)
    }
    header.append(heading, actions)
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
}

async function handleSelectAll(selected) {
  await updateSelection(() => setAllSelected(selected))
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
    folder: buildDownloadFolder(state.downloadBaseDir)
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

  elements.openParse.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('pages/parse.html')
  })

  elements.openSettings.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('pages/settings.html')
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
  if (state.previewIndex >= 0) {
    elements.modalTitle.textContent = t('imagePreviewTitle', {
      index: state.previewIndex + 1,
      count: state.viewList.length
    })
  }
  window.scrollTo(scrollX, scrollY)
  panel.scrollTop = panelScrollTop
  panel.scrollLeft = panelScrollLeft
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (Object.prototype.hasOwnProperty.call(changes, DOWNLOAD_QUERY_KEY)) {
    state.queryParam = changes[DOWNLOAD_QUERY_KEY].newValue ?? state.queryParam
  }
  if (Object.prototype.hasOwnProperty.call(changes, DOWNLOAD_BASE_DIR_KEY)) {
    state.downloadBaseDir = changes[DOWNLOAD_BASE_DIR_KEY].newValue ?? state.downloadBaseDir
  }
})

await initI18n(localizePage)

closeModal()
bindEvents()
handleRefresh()
