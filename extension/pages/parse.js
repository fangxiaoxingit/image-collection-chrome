import { addImagesIfNotExists, getParseCandidates } from '../utils/storage.js'

const state = {
  sourceUrl: '',
  items: []
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
  openList: document.getElementById('openList')
}

function shortenUrl(url) {
  if (url.length <= 80) return url
  return `${url.slice(0, 77)}...`
}

function updateCount() {
  const selectedCount = state.items.filter((item) => item.selected).length
  elements.count.textContent = `已勾选 ${selectedCount} 项`
}

function toggleEmpty() {
  elements.empty.classList.toggle('show', state.items.length === 0)
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

    const size = document.createElement('span')
    size.className = 'size'
    size.textContent = `${item.width} x ${item.height}`
    lineTop.appendChild(size)

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

async function loadCandidates() {
  const payload = await getParseCandidates()
  state.sourceUrl = payload.sourceUrl || ''
  elements.sourceUrl.textContent = state.sourceUrl || '当前来源：未知页面'
  state.items = (payload.items || []).map((item) => ({
    ...item,
    selected: false
  }))

  render()
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

loadCandidates()
