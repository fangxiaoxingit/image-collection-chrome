import { addImageIfNotExists } from './utils/storage.js'

const MENU_ID = 'image_collector_save_image'
const MENU_CONTEXTS = [
  'image',
  'all',
  'page',
  'link',
  'frame',
  'video',
  'audio',
  'selection'
]

function findUrlInText(text) {
  if (typeof text !== 'string') return ''
  const match = text.match(/https?:\/\/[^\s]+/i)
  return match ? match[0] : ''
}

function pickTargetUrl(info, tab) {
  const candidates = [
    info.srcUrl,
    info.linkUrl,
    info.frameUrl,
    info.pageUrl,
    tab && tab.url
  ]

  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) {
      return item.trim()
    }
  }

  return findUrlInText(info.selectionText)
}

let contextMenuInitializing = false

function runContextMenuOperation(operation) {
  return new Promise((resolve, reject) => {
    operation(() => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve()
    })
  })
}

async function createContextMenu() {
  // Installation and startup can overlap; keep the lock until creation completes.
  if (contextMenuInitializing) return
  contextMenuInitializing = true

  try {
    await runContextMenuOperation((callback) => chrome.contextMenus.removeAll(callback))
    await runContextMenuOperation((callback) => chrome.contextMenus.create({
      id: MENU_ID,
      title: '收集图片',
      contexts: MENU_CONTEXTS
    }, callback))
  } catch (error) {
    console.error('初始化收集图片菜单失败：', error)
  } finally {
    contextMenuInitializing = false
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
  createContextMenu()
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return
  const targetUrl = pickTargetUrl(info, tab)
  if (!targetUrl) return

  await addImageIfNotExists(targetUrl)
})
