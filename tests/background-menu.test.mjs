import assert from 'node:assert/strict'
import test from 'node:test'

let moduleId = 0
const menuId = 'image_collector_save_image'
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
      local: { get: async (key) => ({ [key]: values[key] }) },
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
    }
  }
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => ({ collectImage: { message: url.includes('/zh_CN/') ? '收集图片' : 'Collect Image' } })
  })
  console.error = (...args) => { errors.push(args) }
  t.after(() => { globalThis.chrome = previousChrome; globalThis.fetch = previousFetch; console.error = previousError })
  const url = new URL('../extension/background.js', import.meta.url)
  url.searchParams.set('freshModule', String(++moduleId))
  await import(url.href)
  return {
    menus, duplicates, unchecked, errors,
    get createCalls() { return createCalls },
    emit(name) { listeners[name]() },
    setLanguages(value) { acceptedLanguages = value },
    changePreference(value) {
      const oldValue = values.ui_language
      values.ui_language = value
      for (const listener of storageListeners) listener({ ui_language: { oldValue, newValue: value } }, 'local')
    },
    async notifyLanguageChange() {
      await new Promise((resolve) => listeners.message({ type: 'image_collector_language_changed' }, {}, resolve))
    },
    failNext(api) { failures.set(api, `fixture ${api} failure`) },
    async flush() {
      await tick()
      while (pending.length) { pending.shift()(); await tick() }
    }
  }
}

test('overlapping install/startup callbacks never create a duplicate menu ID', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.emit('install')
  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual(fixture.duplicates, [], 'both remove callbacks must not create the same persistent ID')
  assert.equal(fixture.createCalls, 1)
  assert.deepEqual([...fixture.menus.keys()], [menuId])
  assert.deepEqual(fixture.unchecked, [])
})

test('menu follows browser language and manual changes update its existing ID', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t, ['zh-TW'])
  fixture.emit('install')
  await fixture.flush()
  assert.equal(fixture.menus.get(menuId).title, '收集图片')
  fixture.changePreference('en')
  await fixture.flush()
  assert.equal(fixture.menus.get(menuId).title, 'Collect Image')
  assert.equal(fixture.createCalls, 1, 'changing language must update rather than duplicate the menu')
  fixture.changePreference('auto')
  await fixture.flush()
  assert.equal(fixture.menus.get(menuId).title, '收集图片')
  assert.deepEqual(fixture.unchecked, [])
})

test('an open page can refresh an automatic menu after browser preferences change', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t, ['zh-CN'])
  fixture.emit('install')
  await fixture.flush()
  fixture.setLanguages(['en-GB'])
  const notification = fixture.notifyLanguageChange()
  await fixture.flush()
  await notification
  assert.equal(fixture.menus.get(menuId).title, 'Collect Image')
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})

test('sequential initialization still leaves one menu and no unchecked errors', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.emit('install')
  await fixture.flush()
  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [menuId])
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})

test('removeAll failure is handled without creating a menu and can be retried', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.failNext('removeAll')
  fixture.emit('install')
  await fixture.flush()
  assert.equal(fixture.createCalls, 0, 'creation must stop when removal fails')
  assert.equal(fixture.menus.size, 0)
  assert.deepEqual(fixture.unchecked, [])
  assert.ok(fixture.errors.length > 0, 'removal failure should be reported')
  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [menuId])
  assert.equal(fixture.createCalls, 1)
  assert.deepEqual(fixture.unchecked, [])
})

test('create failure is handled and the next initialization can retry', { concurrency: false }, async (t) => {
  const fixture = await createFixture(t)
  fixture.failNext('create')
  fixture.emit('install')
  await fixture.flush()
  assert.equal(fixture.menus.size, 0)
  assert.deepEqual(fixture.unchecked, [], 'create callback must read runtime.lastError')
  assert.ok(fixture.errors.length > 0, 'creation failure should be reported')
  fixture.emit('startup')
  await fixture.flush()
  assert.deepEqual([...fixture.menus.keys()], [menuId])
  assert.equal(fixture.createCalls, 2)
  assert.deepEqual(fixture.duplicates, [])
  assert.deepEqual(fixture.unchecked, [])
})
