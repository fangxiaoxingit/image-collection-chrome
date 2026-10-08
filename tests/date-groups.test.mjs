import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const moduleUrl = new URL('../extension/utils/date-groups.js', import.meta.url).href

function runInTimezone(timezone, body) {
  const source = `
    import assert from 'node:assert/strict'
    const { groupImagesByDate } = await import(${JSON.stringify(moduleUrl)})
    ${body}
  `
  const result = spawnSync(process.execPath, [
    '--experimental-default-type=module', '--input-type=module', '--eval', source
  ], { encoding: 'utf8', env: { ...process.env, TZ: timezone } })
  assert.equal(result.status, 0, `${timezone}: ${result.stderr || result.error || result.stdout}`)
}

test('local midnight defines day groups, with newest groups and images first', () => {
  runInTimezone('Asia/Shanghai', `
    const before = { id: 'before', createdAt: Date.parse('2026-10-04T15:59:59Z') }
    const midnight = { id: 'midnight', createdAt: Date.parse('2026-10-04T16:00:00Z') }
    const noon = { id: 'noon', createdAt: Date.parse('2026-10-05T04:00:00Z') }
    const groups = groupImagesByDate([before, midnight, noon])
    assert.deepEqual(groups, [
      { key: '2026-10-05', label: '2026年10月5日', items: [noon, midnight] },
      { key: '2026-10-04', label: '2026年10月4日', items: [before] }
    ])
  `)
  runInTimezone('UTC', `
    const item = { createdAt: Date.parse('2026-10-04T16:00:00Z') }
    assert.equal(groupImagesByDate([item])[0].key, '2026-10-04')
  `)
})

test('weeks start on Monday and show full dates across a year boundary', () => {
  runInTimezone('Asia/Shanghai', `
    const nextMonday = { id: 'next', createdAt: Date.parse('2026-01-04T16:00:00Z') }
    const sunday = { id: 'sunday', createdAt: Date.parse('2026-01-04T08:00:00Z') }
    const monday = { id: 'monday', createdAt: Date.parse('2025-12-29T00:00:00Z') }
    const previousSunday = { id: 'previous', createdAt: Date.parse('2025-12-28T08:00:00Z') }
    assert.deepEqual(groupImagesByDate([monday, previousSunday, nextMonday, sunday], 'week'), [
      { key: '2026-01-05', label: '2026年1月5日 至 2026年1月11日', items: [nextMonday] },
      { key: '2025-12-29', label: '2025年12月29日 至 2026年1月4日', items: [sunday, monday] },
      { key: '2025-12-22', label: '2025年12月22日 至 2025年12月28日', items: [previousSunday] }
    ])
  `)
})

test('months group by the local calendar across months and years', () => {
  runInTimezone('Asia/Shanghai', `
    const december = { createdAt: Date.parse('2025-12-31T15:59:59Z') }
    const january = { createdAt: Date.parse('2025-12-31T16:00:00Z') }
    const november = { createdAt: Date.parse('2025-11-30T15:59:59Z') }
    assert.deepEqual(groupImagesByDate([november, january, december], 'month'), [
      { key: '2026-01', label: '2026年1月', items: [january] },
      { key: '2025-12', label: '2025年12月', items: [december] },
      { key: '2025-11', label: '2025年11月', items: [november] }
    ])
  `)
})

test('New York DST changes use calendar dates rather than fixed 24-hour offsets', () => {
  runInTimezone('America/New_York', `
    const sunday = { createdAt: Date.parse('2026-03-09T03:30:00Z') }
    const monday = { createdAt: Date.parse('2026-03-09T04:30:00Z') }
    assert.deepEqual(groupImagesByDate([sunday, monday], 'week'), [
      { key: '2026-03-09', label: '2026年3月9日 至 2026年3月15日', items: [monday] },
      { key: '2026-03-02', label: '2026年3月2日 至 2026年3月8日', items: [sunday] }
    ])
    const firstHour = { createdAt: Date.parse('2026-11-01T05:30:00Z') }
    const repeatedHour = { createdAt: Date.parse('2026-11-01T06:30:00Z') }
    assert.deepEqual(groupImagesByDate([firstHour, repeatedHour]), [
      { key: '2026-11-01', label: '2026年11月1日', items: [repeatedHour, firstHour] }
    ])
    assert.deepEqual(groupImagesByDate([firstHour, repeatedHour], 'week'), [
      { key: '2026-10-26', label: '2026年10月26日 至 2026年11月1日', items: [repeatedHour, firstHour] }
    ])
  `)
})

test('sorting is stable and preserves input, object identities and selection', () => {
  runInTimezone('UTC', `
    const older = Object.freeze({ id: 'older', createdAt: Date.parse('2026-10-04T20:00:00Z'), selected: true })
    const first = Object.freeze({ id: 'first', createdAt: Date.parse('2026-10-05T08:00:00Z'), selected: true })
    const second = Object.freeze({ id: 'second', createdAt: first.createdAt, selected: false })
    const newest = Object.freeze({ id: 'newest', createdAt: Date.parse('2026-10-05T09:00:00Z'), selected: false })
    const items = Object.freeze([older, first, newest, second])
    const groups = groupImagesByDate(items)
    assert.deepEqual(groups[0].items, [newest, first, second])
    assert.equal(groups[0].items[0], newest)
    assert.equal(groups[0].items[1], first)
    assert.equal(groups[0].items[2], second)
    assert.equal(groups[1].items[0], older)
    assert.deepEqual(items, [older, first, newest, second])
    assert.equal(first.selected, true)
    assert.equal(second.selected, false)
  `)
})

test('invalid and missing dates stay in a final unknown group without coercion', () => {
  runInTimezone('UTC', `
    const unknown = [
      { id: 'missing' }, { createdAt: null }, { createdAt: '123' },
      { createdAt: NaN }, { createdAt: Infinity }, { createdAt: -Infinity },
      { createdAt: 8640000000000001 }
    ]
    const epoch = { id: 'epoch', createdAt: 0 }
    const current = { createdAt: Date.parse('2026-10-05T00:00:00Z') }
    const groups = groupImagesByDate([unknown[0], epoch, ...unknown.slice(1), current])
    assert.deepEqual(groups, [
      { key: '2026-10-05', label: '2026年10月5日', items: [current] },
      { key: '1970-01-01', label: '1970年1月1日', items: [epoch] },
      { key: 'unknown', label: '添加日期未知', items: unknown }
    ])
  `)
})

test('invalid periods fall back to daily grouping', () => {
  runInTimezone('UTC', `
    const items = [{ createdAt: Date.parse('2026-10-05T00:00:00Z') }]
    const expected = [{ key: '2026-10-05', label: '2026年10月5日', items }]
    for (const period of [undefined, null, 'year', '', 0]) {
      assert.deepEqual(groupImagesByDate(items, period), expected)
    }
  `)
})

test('empty lists have no date groups in every period', () => {
  runInTimezone('UTC', `
    for (const period of ['day', 'week', 'month']) {
      assert.deepEqual(groupImagesByDate([], period), [])
    }
  `)
})
