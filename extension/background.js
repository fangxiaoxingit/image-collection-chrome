import { parseTabImages } from './utils/page-images.js'
import { addImageIfNotExists, getMenuOptions, setParseCandidates } from './utils/storage.js'
import { LANGUAGE_KEY, initI18n, refreshI18n, t } from './utils/i18n.js'

const SAVE_MENU_ID = 'image_collector_save_image'
const PARSE_MENU_ID = 'image_collector_parse_page'
const SAVE_MENU_CONTEXTS = [
  'image',
  'all',
  'page',
  'link',
  'frame',
  'video',
  'audio',
  'selection'
]
const PARSE_MENU_CONTEXTS = ['page', 'frame', 'selection']

const MENU_TITLES = [
  [SAVE_MENU_ID, 'collectImage'],
  [PARSE_MENU_ID, 'parsePage']
]

const activeMenuIds = new Set()
let contextMenuInitializing = false
let menuLanguageRefreshPending = false

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

async function createMenuItem(id, title, contexts) {
  await runContextMenuOperation((callback) => chrome.contextMenus.create({
    id,
    title,
    contexts
  }, callback))
  activeMenuIds.add(id)
}

async function rebuildContextMenu() {
  // Installation, startup and option changes can overlap; keep one creation at a time.
  if (contextMenuInitializing) {
    menuLanguageRefreshPending = true
    return
  }
  contextMenuInitializing = true

  try {
    await initI18n()
    await refreshI18n()
    const options = await getMenuOptions()
    await runContextMenuOperation((callback) => chrome.contextMenus.removeAll(callback))
    activeMenuIds.clear()

    if (options.collectImage) {
      await createMenuItem(SAVE_MENU_ID, t('collectImage'), SAVE_MENU_CONTEXTS)
    }
    if (options.parsePage) {
      await createMenuItem(PARSE_MENU_ID, t('parsePage'), PARSE_MENU_CONTEXTS)
    }
  } catch (error) {
    console.error('Unable to initialize context menus:', error)
  } finally {
    contextMenuInitializing = false
    if (menuLanguageRefreshPending) {
      menuLanguageRefreshPending = false
      refreshContextMenuLanguage()
    }
  }
}

async function refreshContextMenuLanguage() {
  if (contextMenuInitializing) {
    menuLanguageRefreshPending = true
    return
  }

  try {
    await initI18n()
    await refreshI18n()
    for (const [id, key] of MENU_TITLES) {
      if (!activeMenuIds.has(id)) continue
      await runContextMenuOperation((callback) => chrome.contextMenus.update(id, {
        title: t(key)
      }, callback))
    }
  } catch (error) {
    console.error('Unable to update context menu language:', error)
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (Object.prototype.hasOwnProperty.call(changes, LANGUAGE_KEY)) {
    refreshContextMenuLanguage()
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'context_menu_options')) {
    rebuildContextMenu()
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
  rebuildContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenu()
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === SAVE_MENU_ID) {
    const targetUrl = pickTargetUrl(info, tab)
    if (targetUrl) await addImageIfNotExists(targetUrl)
    return
  }

  if (info.menuItemId !== PARSE_MENU_ID) return
  if (!tab || !tab.id) return

  try {
    const items = await parseTabImages(tab.id)
    await setParseCandidates({
      sourceUrl: typeof tab.url === 'string' ? tab.url : '',
      createdAt: Date.now(),
      items
    })
    await chrome.tabs.create({ url: chrome.runtime.getURL('pages/parse.html') })
  } catch (error) {
    console.error('Unable to parse page from context menu:', error)
  }
})

refreshContextMenuLanguage()
