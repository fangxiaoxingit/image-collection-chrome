const KEY = 'image_list'
const DOWNLOAD_QUERY_KEY = 'download_query_param'
const DEFAULT_DOWNLOAD_QUERY_PARAM = 'format=jpg&name=large'
const DOWNLOAD_BASE_DIR_KEY = 'download_base_dir'

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeItem(item) {
  return {
    id: item.id || createId(),
    url: item.url || '',
    preview: item.preview || item.url || '',
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    selected: Boolean(item.selected)
  }
}

export async function getList() {
  const res = await chrome.storage.local.get(KEY)
  const list = Array.isArray(res[KEY]) ? res[KEY] : []

  return list
    .filter((item) => item && typeof item === 'object' && item.url)
    .map(normalizeItem)
}

export async function setList(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeItem) : []
  await chrome.storage.local.set({ [KEY]: normalized })
  return normalized
}

export async function addImageIfNotExists(url) {
  const list = await getList()

  if (list.some((item) => item.url === url)) {
    return { added: false, list }
  }

  const nextList = [
    {
      id: createId(),
      url,
      preview: url,
      createdAt: Date.now(),
      selected: false
    },
    ...list
  ]

  await setList(nextList)

  return { added: true, list: nextList }
}

export async function removeById(id) {
  const list = await getList()
  const nextList = list.filter((item) => item.id !== id)
  await setList(nextList)
  return nextList
}

export async function clearAll() {
  await setList([])
  return []
}

export async function setAllSelected(selected) {
  const list = await getList()
  const nextList = list.map((item) => ({ ...item, selected: Boolean(selected) }))
  await setList(nextList)
  return nextList
}

export async function setSelectedById(id, selected) {
  const list = await getList()
  const nextList = list.map((item) => {
    if (item.id !== id) return item

    return {
      ...item,
      selected: Boolean(selected)
    }
  })

  await setList(nextList)
  return nextList
}

function normalizeQueryParam(value) {
  if (typeof value !== 'string') return DEFAULT_DOWNLOAD_QUERY_PARAM
  return value.trim().replace(/^\?+/, '')
}

export async function getDownloadQueryParam() {
  const res = await chrome.storage.local.get(DOWNLOAD_QUERY_KEY)

  if (!Object.prototype.hasOwnProperty.call(res, DOWNLOAD_QUERY_KEY)) {
    return DEFAULT_DOWNLOAD_QUERY_PARAM
  }

  const value = res[DOWNLOAD_QUERY_KEY]
  if (value === '') return ''
  return normalizeQueryParam(value)
}

export async function setDownloadQueryParam(value) {
  const normalized = value === '' ? '' : normalizeQueryParam(value)
  await chrome.storage.local.set({ [DOWNLOAD_QUERY_KEY]: normalized })
  return normalized
}

function normalizeBaseDir(value) {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

export async function getDownloadBaseDir() {
  const res = await chrome.storage.local.get(DOWNLOAD_BASE_DIR_KEY)

  if (!Object.prototype.hasOwnProperty.call(res, DOWNLOAD_BASE_DIR_KEY)) {
    return ''
  }

  return normalizeBaseDir(res[DOWNLOAD_BASE_DIR_KEY])
}

export async function setDownloadBaseDir(value) {
  const normalized = normalizeBaseDir(value)
  await chrome.storage.local.set({ [DOWNLOAD_BASE_DIR_KEY]: normalized })
  return normalized
}
