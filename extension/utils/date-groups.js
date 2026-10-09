function dateKey(date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateLabel(date, formatter) {
  if (formatter) return formatter.format(date)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function groupInfo(date, period, formatter) {
  if (!date) return { key: 'unknown', label: formatter ? 'Date added unknown' : '添加日期未知' }

  const start = new Date(date.getTime())
  start.setHours(0, 0, 0, 0)
  if (period === 'month') {
    start.setDate(1)
    return {
      key: dateKey(start).slice(0, -3),
      label: formatter ? formatter.format(start) : `${start.getFullYear()}年${start.getMonth() + 1}月`
    }
  }
  if (period === 'week') {
    // Calendar arithmetic keeps Monday/Sunday correct across DST changes.
    start.setDate(start.getDate() - (start.getDay() + 6) % 7)
    const end = new Date(start.getTime())
    end.setDate(end.getDate() + 6)
    return { key: dateKey(start), label: `${dateLabel(start, formatter)}${formatter ? ' – ' : ' 至 '}${dateLabel(end, formatter)}` }
  }
  return { key: dateKey(start), label: dateLabel(start, formatter) }
}

export function groupImagesByDate(items, period = 'day', language = 'zh-CN') {
  if (!['day', 'week', 'month'].includes(period)) period = 'day'
  const formatter = language === 'en' ? new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'long', ...(period === 'month' ? {} : { day: 'numeric' })
  }) : null
  const entries = (Array.isArray(items) ? items : []).map((item, index) => {
    const timestamp = item?.createdAt
    const date = typeof timestamp === 'number' && Number.isFinite(timestamp)
      ? new Date(timestamp)
      : null
    const valid = date && Number.isFinite(date.getTime())
    return { item, index, timestamp: valid ? timestamp : -Infinity, date: valid ? date : null }
  })
  entries.sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)

  const groups = new Map()
  for (const entry of entries) {
    const { key, label } = groupInfo(entry.date, period, formatter)
    if (!groups.has(key)) groups.set(key, { key, label, items: [] })
    groups.get(key).items.push(entry.item)
  }
  return Array.from(groups.values())
}
