// 单元测试：源画像（5个受适配Nitter账号）
const test = require('node:test')
const assert = require('node:assert')
const { extractHandleFromUrl, getSourceProfile, isKnownProfile } = require('../lib/source-profiles')

test('从nitter RSS URL提取handle', () => {
  assert.strictEqual(extractHandleFromUrl('https://nitter.net/Roblox_RTC/rss'), 'Roblox_RTC')
  assert.strictEqual(extractHandleFromUrl('https://nitter.poast.org/Bloxy_News/rss'), 'Bloxy_News')
})

test('从x.com链接提取handle', () => {
  assert.strictEqual(extractHandleFromUrl('https://x.com/Rolimons/status/123'), 'Rolimons')
})

test('5个账号均有专属画像', () => {
  const cases = [
    ['Roblox_RTC', 'community'],
    ['Bloxy_News', 'news'],
    ['Roblox', 'official'],
    ['MrNotifier', 'news'],
    ['Rolimons', 'trading'],
  ]
  for (const [name, category] of cases) {
    const p = getSourceProfile({ sourceName: name })
    assert.strictEqual(p.category, category, `${name} 应为 ${category}`)
    assert.ok(p.emoji, `${name} 应有emoji`)
    assert.ok(p.label, `${name} 应有label`)
    assert.ok(isKnownProfile(p), `${name} 应为已知画像`)
  }
})

test('通过URL匹配画像', () => {
  const p = getSourceProfile({ url: 'https://nitter.net/Rolimons/rss' })
  assert.strictEqual(p.category, 'trading')
  assert.strictEqual(p.label, 'Rolimons')
})

test('未知源返回generic画像', () => {
  const p = getSourceProfile({ sourceName: 'GamerJournalist_Roblox', url: 'https://gamerjournalist.com/roblox/feed/' })
  assert.strictEqual(p.category, 'generic')
  assert.strictEqual(isKnownProfile(p), false)
})
