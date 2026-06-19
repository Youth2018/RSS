// 单元测试：关键词过滤 + 免打扰时段
const test = require('node:test')
const assert = require('node:assert')
const { passesKeywordFilter, isInQuietHours, normalizeKeywords } = require('../lib/filter')

const baseItem = {
  guid: '1', title: 'Roblox Update released', content: 'New limited item available', link: '#',
  pubDate: '', author: 'Roblox', sourceId: 's', sourceName: 'Roblox', imageUrls: [], tweetType: 'original',
}

test('off 模式下全部通过', () => {
  assert.strictEqual(passesKeywordFilter(baseItem, 'off', ['nothing']), true)
})

test('include 白名单：命中关键词才通过', () => {
  assert.strictEqual(passesKeywordFilter(baseItem, 'include', ['limited']), true)
  assert.strictEqual(passesKeywordFilter(baseItem, 'include', ['minecraft']), false)
})

test('exclude 黑名单：命中关键词则过滤', () => {
  assert.strictEqual(passesKeywordFilter(baseItem, 'exclude', ['limited']), false)
  assert.strictEqual(passesKeywordFilter(baseItem, 'exclude', ['minecraft']), true)
})

test('关键词匹配忽略大小写', () => {
  assert.strictEqual(passesKeywordFilter(baseItem, 'include', ['ROBLOX']), true)
})

test('空关键词列表时全部通过', () => {
  assert.strictEqual(passesKeywordFilter(baseItem, 'include', []), true)
})

test('normalizeKeywords 去重去空白', () => {
  assert.deepStrictEqual(normalizeKeywords([' a ', 'A', '', 'b']), ['a', 'b'])
})

test('免打扰：禁用返回false', () => {
  assert.strictEqual(isInQuietHours(-1, -1, new Date('2026-01-01T03:00:00')), false)
})

test('免打扰：同日区间 [1,7)', () => {
  assert.strictEqual(isInQuietHours(1, 7, new Date('2026-01-01T03:00:00')), true)
  assert.strictEqual(isInQuietHours(1, 7, new Date('2026-01-01T07:00:00')), false)
  assert.strictEqual(isInQuietHours(1, 7, new Date('2026-01-01T00:30:00')), false)
})

test('免打扰：跨午夜区间 [23,7)', () => {
  assert.strictEqual(isInQuietHours(23, 7, new Date('2026-01-01T23:30:00')), true)
  assert.strictEqual(isInQuietHours(23, 7, new Date('2026-01-01T02:00:00')), true)
  assert.strictEqual(isInQuietHours(23, 7, new Date('2026-01-01T12:00:00')), false)
})

test('免打扰：开始等于结束视为未设置', () => {
  assert.strictEqual(isInQuietHours(5, 5, new Date('2026-01-01T05:00:00')), false)
})
