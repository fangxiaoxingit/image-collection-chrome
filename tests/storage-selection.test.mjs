import assert from 'node:assert/strict'
import test from 'node:test'
import * as storage from '../extension/utils/storage.js'

function image(id, selected, createdAt) {
  return {
    id,
    url: `https://example.com/${id}.jpg`,
    preview: `https://example.com/${id}-preview.jpg`,
    createdAt,
    selected
  }
}

function fixture(t, initialList) {
  const previousChrome = globalThis.chrome
  const state = { list: structuredClone(initialList), reads: 0, writes: 0 }
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          assert.equal(key, 'image_list')
          state.reads += 1
          return { [key]: structuredClone(state.list) }
        },
        async set(update) {
          assert.deepEqual(Object.keys(update), ['image_list'])
          state.writes += 1
          state.list = structuredClone(update.image_list)
        }
      }
    }
  }
  t.after(() => { globalThis.chrome = previousChrome })
  return state
}

test('batch selection changes only requested images in one save and preserves order and metadata', async (t) => {
  const first = image('first', false, 300)
  const outsideSelected = image('outside-selected', true, 100)
  const second = image('second', false, 200)
  const outsideUnselected = image('outside-unselected', false, 400)
  const initial = [first, outsideSelected, second, outsideUnselected]
  const state = fixture(t, initial)

  const result = await storage.setSelectedByIds(['second', 'first', 'second', 'missing'], true)

  const expected = [{ ...first, selected: true }, outsideSelected, { ...second, selected: true }, outsideUnselected]
  assert.deepEqual(result, expected)
  assert.deepEqual(state.list, expected)
  assert.equal(state.reads, 1)
  assert.equal(state.writes, 1, 'a group change must save once rather than once per image')
})

test('batch deselection keeps other groups selected and normalizes falsy selection values', async (t) => {
  const first = image('first', true, 300)
  const outside = image('outside', true, 100)
  const second = image('second', true, 200)
  const state = fixture(t, [first, outside, second])

  const result = await storage.setSelectedByIds(['first', 'second'], 0)

  const expected = [{ ...first, selected: false }, outside, { ...second, selected: false }]
  assert.deepEqual(result, expected)
  assert.deepEqual(state.list, expected)
  assert.equal(state.writes, 1)
})

test('batch selection normalizes truthy values to booleans', async (t) => {
  const target = image('target', false, 100)
  const state = fixture(t, [target])

  const result = await storage.setSelectedByIds(['target'], 'selected')

  assert.deepEqual(result, [{ ...target, selected: true }])
  assert.deepEqual(state.list, [{ ...target, selected: true }])
})

test('batch selection reads the latest list without reviving removed images or losing later additions', async (t) => {
  const target = image('target', false, 300)
  const removed = image('removed', false, 200)
  const outside = image('outside', false, 100)
  const state = fixture(t, [target, removed, outside])
  const displayedList = await storage.getList()
  const groupIds = displayedList.slice(0, 2).map((item) => item.id)
  const added = image('added', false, 400)
  state.list = [added, target, { ...outside, selected: true }]

  const result = await storage.setSelectedByIds(groupIds, true)

  const expected = [added, { ...target, selected: true }, { ...outside, selected: true }]
  assert.deepEqual(result, expected)
  assert.deepEqual(state.list, expected)
  assert.equal(state.reads, 2, 'selection must read storage again after the displayed snapshot')
  assert.equal(state.writes, 1)
})

test('empty and nonexistent IDs leave the list unchanged without adding images', async (t) => {
  const initial = [image('selected', true, 200), image('unselected', false, 100)]
  const state = fixture(t, initial)

  for (const ids of [[], ['missing', 'missing']]) {
    const result = await storage.setSelectedByIds(ids, true)
    assert.deepEqual(result, initial)
    assert.deepEqual(state.list, initial)
  }
})
