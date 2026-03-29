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

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '收集图片',
      contexts: MENU_CONTEXTS
    })
  })
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
