import { addImageIfNotExists } from './utils/storage.js'
import { LANGUAGE_KEY, initI18n, refreshI18n, t } from './utils/i18n.js'

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
let menuLanguageRefreshPending = false

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
    await initI18n()
    await refreshI18n()
    await runContextMenuOperation((callback) => chrome.contextMenus.removeAll(callback))
    await runContextMenuOperation((callback) => chrome.contextMenus.create({
      id: MENU_ID,
      title: t('collectImage'),
      contexts: MENU_CONTEXTS
    }, callback))
  } catch (error) {
    console.error('Unable to initialize image collection menu:', error)
  } finally {
    contextMenuInitializing = false
    if (menuLanguageRefreshPending) {
      menuLanguageRefreshPending = false
      refreshContextMenuLanguage()
    }
  }
}

async function refreshContextMenuLanguage() {
  try {
    await refreshI18n()
    if (contextMenuInitializing) {
      menuLanguageRefreshPending = true
      return
    }
    await runContextMenuOperation((callback) => chrome.contextMenus.update(MENU_ID, {
      title: t('collectImage')
    }, callback))
  } catch (error) {
    console.error('Unable to update image collection menu language:', error)
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, LANGUAGE_KEY)) {
    refreshContextMenuLanguage()
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'image_collector_language_changed') return
  ;(async () => {
    await refreshContextMenuLanguage()
    sendResponse({ updated: true })
  })()
  return true
})

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

refreshContextMenuLanguage()
