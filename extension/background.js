import { addImageIfNotExists } from './utils/storage.js'

const MENU_ID = 'image_collector_save_image'
const LIST_PAGE_URL = 'pages/list.html'

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '收集图片',
      contexts: ['image']
    })
  })
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
  createContextMenu()
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return
  if (!info.srcUrl) return

  await addImageIfNotExists(info.srcUrl)
})

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL(LIST_PAGE_URL)
  })
})
