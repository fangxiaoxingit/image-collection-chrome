import assert from 'node:assert/strict'
import test from 'node:test'

let moduleId = 0

async function fixture(t, { preference, languages = ['en-US'], uiLanguage = 'en-US' } = {}) {
  const previous = { chrome: globalThis.chrome, fetch: globalThis.fetch, window: globalThis.window }
  const listeners = new Set()
  const values = preference === undefined ? {} : { ui_language: preference }
  let accepted = languages
  globalThis.window = new EventTarget()
  globalThis.chrome = {
    runtime: { getURL: (path) => `chrome-extension://fixture/${path}` },
    i18n: {
      getAcceptLanguages: async () => accepted,
      getUILanguage: () => uiLanguage
    },
    storage: {
      local: {
        async get(key) { return { [key]: values[key] } },
        async set(update) {
          const changes = {}
          for (const [key, value] of Object.entries(update)) {
            changes[key] = { oldValue: values[key], newValue: value }
            values[key] = value
          }
          for (const listener of listeners) listener(changes, 'local')
        }
      },
      onChanged: { addListener: (listener) => listeners.add(listener) }
    }
  }
  globalThis.fetch = async (url) => ({
    ok: true,
    async json() {
      return url.includes('/zh_CN/')
        ? { selected: { message: '已勾选 {count} 项' } }
        : { selected: { message: '{count} selected' }, fallback: { message: 'English fallback' } }
    }
  })
  t.after(() => Object.assign(globalThis, previous))
  const url = new URL('../extension/utils/i18n.js', import.meta.url)
  url.searchParams.set('fixture', String(++moduleId))
  const module = await import(url.href)
  return {
    module, values,
    setLanguages(next) { accepted = next },
    async externalPreference(value) { await chrome.storage.local.set({ ui_language: value }) },
    async settle() { await new Promise((resolve) => setImmediate(resolve)) }
  }
}

test('automatic language follows ordered browser preferences and normalizes regions', async (t) => {
  const { module } = await fixture(t)
  for (const [languages, expected] of [
    [['en-GB', 'zh-CN'], 'en'],
    [['ja-JP', 'zh-TW', 'en'], 'zh-CN'],
    [['zh-Hant-HK'], 'zh-CN'],
    [['fr-FR', 'ja-JP'], 'en'],
    [['EN_us'], 'en']
  ]) assert.equal(module.resolveLanguage('auto', languages, 'zh-CN'), expected)
  assert.equal(module.resolveLanguage('auto', [], 'zh-TW'), 'zh-CN')
  assert.equal(module.resolveLanguage('auto', [], ''), 'en')
})

test('manual override wins and invalid stored preferences return to automatic mode', async (t) => {
  const { module } = await fixture(t)
  assert.equal(module.resolveLanguage('en', ['zh-CN']), 'en')
  assert.equal(module.resolveLanguage('zh-CN', ['en-US']), 'zh-CN')
  assert.equal(module.resolveLanguage('invalid', ['zh-CN']), 'zh-CN')
  assert.equal(module.normalizeLanguagePreference(null), 'auto')
})

test('initialization keeps automatic preference while rendering the resolved language', async (t) => {
  const { module, values } = await fixture(t, { languages: ['zh-TW'] })
  await module.initI18n()
  assert.equal(module.getLanguagePreference(), 'auto')
  assert.equal(module.getLanguage(), 'zh-CN')
  assert.equal(module.t('selected', { count: 3 }), '已勾选 3 项')
  assert.equal(module.t('fallback'), 'English fallback')
  assert.equal(module.t('missing_key'), 'missing_key')
  assert.deepEqual(values, {}, 'auto must not be replaced by a detected fixed language')
})

test('manual choice is persisted and external preference changes notify open contexts', async (t) => {
  const { module, values, externalPreference, settle } = await fixture(t, { languages: ['zh-CN'] })
  const changes = []
  await module.initI18n(() => changes.push(module.getLanguage()))
  await module.setLanguagePreference('en')
  await settle()
  assert.equal(values.ui_language, 'en')
  assert.equal(module.getLanguage(), 'en')
  assert.equal(module.t('selected', { count: 2 }), '2 selected')
  await externalPreference('zh-CN')
  await settle()
  assert.equal(module.getLanguage(), 'zh-CN')
  assert.deepEqual(changes, ['zh-CN', 'en', 'zh-CN'])
})

test('browser language changes affect auto mode but preserve a manual override', async (t) => {
  const { module, setLanguages, settle } = await fixture(t)
  await module.initI18n()
  setLanguages(['zh-CN'])
  window.dispatchEvent(new Event('languagechange'))
  await settle()
  assert.equal(module.getLanguage(), 'zh-CN')
  await module.setLanguagePreference('en')
  setLanguages(['zh-TW'])
  window.dispatchEvent(new Event('languagechange'))
  await settle()
  assert.equal(module.getLanguage(), 'en')
  await module.setLanguagePreference('auto')
  assert.equal(module.getLanguage(), 'zh-CN')
})

test('named substitutions preserve literal user content instead of replacement patterns', async (t) => {
  const { module } = await fixture(t)
  await module.initI18n()
  assert.equal(module.t('selected', { count: '$& <url>' }), '$& <url> selected')
})

test('a failed preferred-language lookup uses the browser UI language', async (t) => {
  const { module } = await fixture(t, { uiLanguage: 'zh-HK' })
  chrome.i18n.getAcceptLanguages = async () => { throw new Error('lookup unavailable') }
  await module.initI18n()
  assert.equal(module.getLanguage(), 'zh-CN')
  assert.equal(module.getLanguagePreference(), 'auto')
})

test('a slow old lookup cannot overwrite a newer language choice', async (t) => {
  const { module, externalPreference, settle } = await fixture(t)
  await module.initI18n()
  let finishOldLookup
  chrome.i18n.getAcceptLanguages = () => new Promise((resolve) => { finishOldLookup = resolve })
  await externalPreference('zh-CN')
  await settle()
  chrome.i18n.getAcceptLanguages = async () => ['en-US']
  await module.setLanguagePreference('en')
  finishOldLookup(['zh-CN'])
  await settle()
  assert.equal(module.getLanguage(), 'en')
  assert.equal(module.getLanguagePreference(), 'en')
})
