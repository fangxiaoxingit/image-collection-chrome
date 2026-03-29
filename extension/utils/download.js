function getMonthFolder(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
    if (!match) return 'jpg'

    const ext = match[1].toLowerCase()
    if (ext.length > 5) return 'jpg'
    return ext
  } catch {
    return 'jpg'
  }
}

function sanitizePathSegment(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_')
}

function sanitizeFolderPath(path) {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => sanitizePathSegment(segment.trim()))
    .filter((segment) => segment.length > 0)
    .join('/')
}

export function replaceUrlQuery(url, queryParamOverride) {
  if (typeof queryParamOverride !== 'string') return url

  const query = queryParamOverride.trim().replace(/^\?+/, '')
  if (!query) return url

  try {
    const parsed = new URL(url)
    parsed.search = `?${query}`
    return parsed.toString()
  } catch {
    const hashIndex = url.indexOf('#')
    const hasHash = hashIndex >= 0
    const hash = hasHash ? url.slice(hashIndex) : ''
    const head = hasHash ? url.slice(0, hashIndex) : url
    const base = head.split('?')[0]
    return `${base}?${query}${hash}`
  }
}

export async function downloadImage(url, filename) {
  return chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  })
}

export async function batchDownload(list, options = {}) {
  const source = Array.isArray(list) ? list.slice() : []
  const queue = source
  const results = []

  const concurrency = Math.max(1, Number(options.concurrency) || 3)
  const folder = sanitizeFolderPath(options.folder || getMonthFolder()) || getMonthFolder()

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item || !item.url) continue

      const downloadUrl = replaceUrlQuery(item.url, options.queryParamOverride)
      const ext = getExtFromUrl(downloadUrl)
      const safeId = sanitizePathSegment(item.id || `${Date.now()}`)
      const filename = `${folder}/${safeId}.${ext}`

      try {
        const downloadId = await downloadImage(downloadUrl, filename)
        results.push({
          id: item.id,
          url: item.url,
          downloadUrl,
          success: true,
          downloadId
        })
      } catch (error) {
        results.push({
          id: item.id,
          url: item.url,
          downloadUrl,
          success: false,
          error: String(error)
        })
      }
    }
  }

  await Promise.all(new Array(concurrency).fill(0).map(() => worker()))

  return {
    total: source.length,
    successCount: results.filter((item) => item.success).length,
    failCount: results.filter((item) => !item.success).length,
    results
  }
}
