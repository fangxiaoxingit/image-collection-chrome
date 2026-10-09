export const LANGUAGE_KEY = 'ui_language'

const SUPPORTED_PREFERENCES = ['auto', 'zh-CN', 'en']
const subscribers = new Set()
let preference = 'auto'
let language = 'en'
let catalogs = {}
let initialization
let revision = 0

export function normalizeLanguagePreference(value) {
  return SUPPORTED_PREFERENCES.includes(value) ? value : 'auto'
}

function supportedLanguage(value) {
  if (typeof value !== 'string') return null
  const base = value.toLowerCase().split(/[-_]/)[0]
  if (base === 'zh') return 'zh-CN'
  if (base === 'en') return 'en'
  return null
}

export function resolveLanguage(value, acceptedLanguages = [], uiLanguage = '') {
  const normalized = normalizeLanguagePreference(value)
  if (normalized !== 'auto') return normalized
  const preferred = Array.isArray(acceptedLanguages) ? acceptedLanguages : []
  if (preferred.length === 0) return supportedLanguage(uiLanguage) || 'en'
  for (const candidate of preferred) {
    const supported = supportedLanguage(candidate)
    if (supported) return supported
  }
  return 'en'
}

export function getLanguage() {
  return language
}

export function getLanguagePreference() {
  return preference
}

export function t(key, parameters = {}) {
  const message = catalogs[language]?.[key]?.message || catalogs.en?.[key]?.message || key
  return message.replace(/\{(\w+)\}/g, (placeholder, name) => (
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder
  ))
}

async function loadCatalog(locale) {
  const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`))
  if (!response.ok) throw new Error(`Unable to load language catalog: ${locale}`)
  return response.json()
}

async function refreshLanguage() {
  const requestRevision = ++revision
  const [stored, accepted] = await Promise.all([
    chrome.storage.local.get(LANGUAGE_KEY),
    chrome.i18n.getAcceptLanguages().catch(() => [])
  ])
  if (requestRevision !== revision) return
  const nextPreference = normalizeLanguagePreference(stored[LANGUAGE_KEY])
  const nextLanguage = resolveLanguage(nextPreference, accepted, chrome.i18n.getUILanguage())
  const changed = preference !== nextPreference || language !== nextLanguage
  preference = nextPreference
  language = nextLanguage
  if (changed) for (const subscriber of subscribers) subscriber()
}

async function notifyBackground() {
  if (!globalThis.window || !chrome.runtime.sendMessage) return
  // The worker has no Window languagechange event; open pages keep its menu current.
  try {
    await chrome.runtime.sendMessage({ type: 'image_collector_language_changed' })
  } catch {
    // Pages still localize if the background worker is unavailable.
  }
}

export async function initI18n(onChange) {
  if (!initialization) {
    initialization = (async () => {
      const [english, chinese] = await Promise.all([loadCatalog('en'), loadCatalog('zh_CN')])
      catalogs = { en: english, 'zh-CN': chinese }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, LANGUAGE_KEY)) {
          refreshLanguage().catch((error) => console.error('Unable to update language:', error))
        }
      })
      globalThis.window?.addEventListener('languagechange', async () => {
        try {
          await refreshLanguage()
          await notifyBackground()
        } catch (error) {
          console.error('Unable to update language:', error)
        }
      })
      await refreshLanguage()
    })()
  }
  await initialization
  if (typeof onChange === 'function') {
    subscribers.add(onChange)
    onChange()
  }
  notifyBackground()
}

export async function refreshI18n() {
  await initI18n()
  await refreshLanguage()
}

export async function setLanguagePreference(value) {
  await initI18n()
  await chrome.storage.local.set({ [LANGUAGE_KEY]: normalizeLanguagePreference(value) })
  await refreshLanguage()
}

export function translatePage(root = document) {
  const ownerDocument = root.ownerDocument || root
  ownerDocument.documentElement.lang = language
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n)
  }
  for (const attribute of ['title', 'placeholder', 'aria-label', 'alt']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)))
    }
  }
  for (const select of root.querySelectorAll('[data-language-select]')) {
    select.value = preference
  }
}

export function bindLanguageSelector(select) {
  select.addEventListener('change', async () => {
    try {
      await setLanguagePreference(select.value)
    } catch (error) {
      select.value = preference
      console.error('Unable to save language preference:', error)
    }
  })
}
