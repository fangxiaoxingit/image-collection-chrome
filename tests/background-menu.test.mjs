import assert from 'node:assert/strict'
import test from 'node:test'

let moduleId = 0
const SAVE_MENU_ID = 'image_collector_save_image'
const PARSE_MENU_ID = 'image_collector_parse_page'
const tick = () => new Promise((resolve) => setImmediate(resolve))

async function createFixture(t, languages = ['en-US']) {
  const previousChrome = globalThis.chrome
  const previousFetch = globalThis.fetch
  const previousError = console.error
  const listeners = {}
  const pending = []
  const failures = new Map()
  const menus = new Map()
  const duplicates = []
  const unchecked = []
  const errors = []
  const storageListeners = []
  const values = {}
  const createdTabs = []
  const scriptCalls = []
  let acceptedLanguages = languages
  let createCalls = 0
  let activeError
  let errorRead = false
  const event = (name) => ({ addListener: (listener) => { listeners[name] = listener } })
  const runtime = {
    onInstalled: event('install'),
    onStartup: event('startup'),
    onMessage: event('message'),
    getURL: (path) => `chrome-extension://fixture/${path}`,
    get lastError() { errorRead = true; return activeError }
  }
  function finish(api, callback, error) {
    activeError = error ? { message: error } : undefined
    errorRead = false
    try {
      if (callback) callback()
    } finally {
      if (error && !errorRead) unchecked.push({ api, message: error })
      activeError = undefined
    }
  }
  function enqueue(api, callback, perform) {
    const error = failures.get(api)
    failures.delete(api)
    pending.push(() => finish(api, callback, error || perform()))
  }
  globalThis.chrome = {
    runtime,
    i18n: { getAcceptLanguages: async () => acceptedLanguages, getUILanguage: () => 'en-US' },
    storage: {
      local: {
        async get(key) { return { [key]: values[key] } },
        async set(update) { Object.assign(values, update) }
      },
      onChanged: { addListener: (listener) => storageListeners.push(listener) }
    },
    contextMenus: {
      onClicked: event('click'),
      removeAll(callback) {
        enqueue('removeAll', callback, () => { menus.clear() })
      },
      update(id, options, callback) {
        enqueue('update', callback, () => {
          if (!menus.has(id)) return 'Menu does not exist'
          menus.set(id, { ...menus.get(id), ...options })
        })
      },
      create(options, callback) {
        createCalls += 1
        enqueue('create', callback, () => {
          if (menus.has(options.id)) {
            duplicates.push(options.id)
            return `Cannot create item with duplicate id ${options.id}`
          }
          menus.set(options.id, options)
        })
        return options.id
      }
    },
    scripting: {
      async executeScript(options) {
        scriptCalls.push(options)
        return [{ result: [{ url: 'https://example.com/photo.jpg', width: 400, height: 300, alt: 'photo' }] }]
      }
    },
    tabs: {
      async create(options) {
        createdTabs.push(options)
        return { id: 99, url: options.url }
      }
    }
  }
  globalThis.fetch = async (url) => {
    const chinese = url.includes('/zh_CN/')
    return {
      ok: true,
      json: async () => ({
        collectImage: { message: chinese ? '收集图片' : 'Collect Image' },
        parsePage: { message: chinese ? '解析页面' : 'Parse Page' }
      })
    }
  }
  console.error = (...args) => { errors.push(args) }
  t.after(() => { globalThis.chrome = previousChrome; globalThis.fetch = previousFetch; console.error = previousError })
  const url = new URL('../extension/background.js', import.meta.url)
  url.searchParams.set('freshModule', String(++moduleId))
  await import(url.href)
  return {
    menus, duplicates, unchecked, errors, createdTabs, scriptCalls,
    get createCalls() { return createCalls },
    emit(name) { listeners[name]() },
    setLanguages(value) { acceptedLanguages = value },
    changePreference(value) {
      const oldValue = values.ui_language
      values.ui_language = value
      for (const listener of storageListeners) listener({ ui_language: { oldValue, newValue: value } }, 'local')
    },
    changeMenuOptions(value) {
      const oldValue = values.context_menu_options
      values.context_menu_options = value
      for (const listener of storageListeners) listener({ context_menu_options: { oldValue, newValue: value } }, 'local')
    },
    async notifyLanguageChange() {
      await new Promise((resolve) => listeners.message({ type: 'image_collector_language_changed' }, {}, resolve))
    },
    async click(menuItemId, tab = { id: 7, url: 'https://example.com/gallery' }) {
      await listeners.click({ menuItemId, pageUrl: tab.url }, tab)
    },
    failNext(api) { failures.set(api, `fixture ${api} failure`) },
    async flush() {
      await tick()
      while (pending.length) { pending.shift()(); await tick() }
    }
  }
}

test('install and startup create both menus once with no duplicate or unchecked errors', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.emit('install')
  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual(fixture.duplicates, [])
  assert.equal(fixture.createCalls, 2)
  assert.deepEqual([...fixture.menus.keys()], [SAVE_MENU_ID, PARSE_MENU_ID])
  assert.equal(fixture.menus.get(SAVE_MENU_ID).title, 'Collect Image')
  assert.equal(fixture.menus.get(PARSE_MENU_ID).title, 'Parse Page')
  assert.deepEqual(fixture.menus.get(PARSE_MENU_ID).contexts, ['page', 'frame', 'selection'])
  assert.deepEqual(fixture.unchecked, [])
})

test('language changes update existing titles without duplicating menus', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t, ['zh-TW'])
  fixture.emit('install')
  await fixture.flush()
  assert.equal(fixture.menus.get(SAVE_MENU_ID).title, '收集图片')
  assert.equal(fixture.menus.get(PARSE_MENU_ID).title, '解析页面')

  fixture.changePreference('en')
  await fixture.flush()
  assert.equal(fixture.menus.get(SAVE_MENU_ID).title, 'Collect Image')
  assert.equal(fixture.menus.get(PARSE_MENU_ID).title, 'Parse Page')
  assert.equal(fixture.createCalls, 2, 'language changes must update rather than recreate menus')

  fixture.changePreference('auto')
  await fixture.flush()
  assert.equal(fixture.menus.get(SAVE_MENU_ID).title, '收集图片')
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})

test('an open page can refresh automatic menu language after browser preferences change', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t, ['zh-CN'])
  fixture.emit('install')
  await fixture.flush()
  fixture.setLanguages(['en-GB'])
  const notification = fixture.notifyLanguageChange()
  await fixture.flush()
  await notification
  assert.equal(fixture.menus.get(SAVE_MENU_ID).title, 'Collect Image')
  assert.equal(fixture.menus.get(PARSE_MENU_ID).title, 'Parse Page')
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})

test('menu switches rebuild entries and both can be disabled', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.emit('install')
  await fixture.flush()

  fixture.changeMenuOptions({ collectImage: false, parsePage: true })
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [PARSE_MENU_ID])

  fixture.changeMenuOptions({ collectImage: true, parsePage: false })
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [SAVE_MENU_ID])

  fixture.changeMenuOptions({ collectImage: false, parsePage: false })
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [])

  fixture.changeMenuOptions({})
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [SAVE_MENU_ID, PARSE_MENU_ID], 'missing options default to enabled')
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})

test('parse menu click parses the active tab and opens the candidate page', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.emit('install')
  await fixture.flush()

  await fixture.click(PARSE_MENU_ID)

  assert.equal(fixture.scriptCalls.length, 1)
  assert.equal(fixture.scriptCalls[0].target.tabId, 7)
  assert.deepEqual(fixture.createdTabs, [{ url: 'chrome-extension://fixture/pages/parse.html' }])
  assert.deepEqual(fixture.unchecked, [])
})

test('removeAll and create failures are handled and retried on the next startup', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.failNext('removeAll')
  fixture.emit('install')
  await fixture.flush()
  assert.equal(fixture.createCalls, 0)
  assert.equal(fixture.menus.size, 0)
  assert.deepEqual(fixture.unchecked, [])
  assert.ok(fixture.errors.length > 0)

  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [SAVE_MENU_ID, PARSE_MENU_ID])
  assert.equal(fixture.createCalls, 2)
  assert.deepEqual(fixture.unchecked, [])
})

test('a create failure stops initialization and can be retried', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.failNext('create')
  fixture.emit('install')
  await fixture.flush()
  assert.equal(fixture.menus.size, 0)
  assert.deepEqual(fixture.unchecked, [])
  assert.ok(fixture.errors.length > 0)

  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [SAVE_MENU_ID, PARSE_MENU_ID])
  assert.equal(fixture.createCalls, 3)
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})
