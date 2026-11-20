import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDownloadFolder } from '../extension/utils/download.js'

const date = new Date(2026, 0, 9)

test('an empty base directory saves directly into the year-month folder', () => {
  assert.equal(buildDownloadFolder('', date), '2026-01')
  assert.equal(buildDownloadFolder(undefined, date), '2026-01')
})

test('a custom base directory is prepended to the year-month folder', () => {
  assert.equal(buildDownloadFolder('image-collector', date), 'image-collector/2026-01')
})

test('base directory separators and surrounding slashes are normalized', () => {
  assert.equal(buildDownloadFolder('  my\\images\\  ', date), 'my/images/2026-01')
  assert.equal(buildDownloadFolder('/nested/folder/', date), 'nested/folder/2026-01')
})

test('month is zero-padded', () => {
  assert.equal(buildDownloadFolder('images', new Date(2026, 10, 20)), 'images/2026-11')
})
