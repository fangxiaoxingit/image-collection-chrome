import { parseTabImages } from '../utils/page-images.js'
import { setParseCandidates } from '../utils/storage.js'
import { bindLanguageSelector, initI18n, t, translatePage } from '../utils/i18n.js'

const elements = {
  openList: document.getElementById('openList'),
  parsePage: document.getElementById('parsePage')
}

function getListPageUrl() {
  return chrome.runtime.getURL('pages/list.html')
}

function getParsePageUrl() {
  return chrome.runtime.getURL('pages/parse.html')
}

async function openListPage() {
  await chrome.tabs.create({ url: getListPageUrl() })
  window.close()
}

async function parseCurrentPage() {
  elements.parsePage.disabled = true

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) {
      alert(t('currentTabMissing'))
      return
    }

    const items = await parseTabImages(tab.id)
    await setParseCandidates({
      sourceUrl: typeof tab.url === 'string' ? tab.url : '',
      createdAt: Date.now(),
      items
    })

    await chrome.tabs.create({ url: getParsePageUrl() })
    window.close()
  } catch (error) {
    alert(t('parseFailed', { error: String(error) }))
  } finally {
    elements.parsePage.disabled = false
  }
}

await initI18n(() => translatePage())
bindLanguageSelector(document.getElementById('languageSelect'))

elements.openList.addEventListener('click', () => {
  openListPage()
})

elements.parsePage.addEventListener('click', () => {
  parseCurrentPage()
})
