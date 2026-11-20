import assert from 'node:assert/strict'
import test from 'node:test'
import * as storage from '../extension/utils/storage.js'

function fixture(t, initial = {}) {
  const previousChrome = globalThis.chrome
  const values = structuredClone(initial)
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: values[key] } },
        async set(update) { Object.assign(values, update) }
      }
    }
  }
  t.after(() => { globalThis.chrome = previousChrome })
  return values
}

test('both context menu switches default to enabled', async (t) => {
  fixture(t)
  assert.deepEqual(await storage.getMenuOptions(), { collectImage: true, parsePage: true })
})

test('menu options normalize missing and invalid values to enabled', async (t) => {
  const values = fixture(t, { context_menu_options: { collectImage: false } })
  assert.deepEqual(await storage.getMenuOptions(), { collectImage: false, parsePage: true })

  values.context_menu_options = 'invalid'
  assert.deepEqual(await storage.getMenuOptions(), { collectImage: true, parsePage: true })
})

test('one switch can be changed without touching the other', async (t) => {
  const values = fixture(t)

  await storage.setMenuOption('collectImage', false)
  assert.deepEqual(values.context_menu_options, { collectImage: false, parsePage: true })

  await storage.setMenuOption('parsePage', false)
  assert.deepEqual(values.context_menu_options, { collectImage: false, parsePage: false })

  await storage.setMenuOption('collectImage', true)
  assert.deepEqual(values.context_menu_options, { collectImage: true, parsePage: false })
})

test('unknown menu switch names are rejected', async (t) => {
  const values = fixture(t)
  await assert.rejects(() => storage.setMenuOption('unknown', true), /Unknown menu option/)
  assert.deepEqual(values, {})
})
