const KEY = 'image_list'
const DOWNLOAD_QUERY_KEY = 'download_query_param'
const DEFAULT_DOWNLOAD_QUERY_PARAM = 'format=jpg&name=large'
const DOWNLOAD_BASE_DIR_KEY = 'download_base_dir'
const PARSE_CANDIDATES_KEY = 'parse_candidates_cache'

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

export async function addImagesIfNotExists(urls) {
  const list = await getList()
  const urlSet = new Set(list.map((item) => item.url))
  const nextList = list.slice()

  let addedCount = 0
  let skippedCount = 0

  for (const url of urls) {
    if (typeof url !== 'string' || !url.trim()) {
      skippedCount += 1
      continue
    }

    const normalizedUrl = url.trim()
    if (urlSet.has(normalizedUrl)) {
      skippedCount += 1
      continue
    }

    urlSet.add(normalizedUrl)
    addedCount += 1
    nextList.unshift({
      id: createId(),
      url: normalizedUrl,
      preview: normalizedUrl,
      createdAt: Date.now(),
      selected: false
    })
  }

  await setList(nextList)

  return {
    addedCount,
    skippedCount,
    list: nextList
  }
}

export async function removeById(id) {
  const list = await getList()
  const nextList = list.filter((item) => item.id !== id)
  await setList(nextList)
  return nextList
}

export async function removeByIds(ids) {
  const idSet = new Set(ids)
  const list = await getList()
  const nextList = list.filter((item) => !idSet.has(item.id))
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

function normalizeParseCandidateItem(item) {
  if (!item || typeof item !== 'object') return null

  const url = typeof item.url === 'string' ? item.url.trim() : ''
  if (!url) return null

  return {
    url,
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    alt: typeof item.alt === 'string' ? item.alt : ''
  }
}

function normalizeParseCandidates(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      sourceUrl: '',
      createdAt: Date.now(),
      items: []
    }
  }

  const sourceUrl = typeof payload.sourceUrl === 'string' ? payload.sourceUrl : ''
  const createdAt = typeof payload.createdAt === 'number' ? payload.createdAt : Date.now()
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items = rawItems.map(normalizeParseCandidateItem).filter(Boolean)

  return {
    sourceUrl,
    createdAt,
    items
  }
}

export async function getParseCandidates() {
  const res = await chrome.storage.local.get(PARSE_CANDIDATES_KEY)
  const payload = res[PARSE_CANDIDATES_KEY]
  return normalizeParseCandidates(payload)
}

export async function setParseCandidates(payload) {
  const normalized = normalizeParseCandidates(payload)
  await chrome.storage.local.set({ [PARSE_CANDIDATES_KEY]: normalized })
  return normalized
}
