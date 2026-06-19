// 单元测试：QQ Markdown 转换（含5个Nitter源的单独适配）
const test = require('node:test')
const assert = require('node:assert')
const { convertBatchToMarkdown, convertToMarkdown, formatTestPushResult } = require('../lib/markdown')

function makeItem(overrides) {
  return Object.assign({
    guid: '1',
    title: '标题第一句',
    content: '标题第一句\n这是正文段落。',
    link: 'https://x.com/Roblox_RTC/status/123',
    pubDate: '2026-06-19T10:00:00Z',
    author: 'Roblox_RTC',
    sourceId: 'roblox_rtc',
    sourceName: 'Roblox_RTC',
    imageUrls: ['https://pbs.twimg.com/media/abc.jpg'],
    tweetType: 'original',
  }, overrides)
}

test('批次横幅包含源画像标签与emoji', () => {
  const md = convertBatchToMarkdown([makeItem()], '测试推送')
  assert.match(md, /# 📰 测试推送 · Roblox RTC/)
  assert.match(md, /> 📰 来源：Roblox RTC/)
})

test('图片使用标准QQ Markdown语法 img #宽px #高px', () => {
  const md = convertBatchToMarkdown([makeItem()])
  assert.match(md, /!\[img #400px #300px\]\(https:\/\/pbs\.twimg\.com\/media\/abc\.jpg\)/)
})

test('原文链接渲染', () => {
  const md = convertBatchToMarkdown([makeItem()])
  assert.match(md, /\[查看原文 ›\]\(https:\/\/x\.com\/Roblox_RTC\/status\/123\)/)
})

test('标题与正文首段去重', () => {
  const md = convertToMarkdown(makeItem())
  // 标题出现在粗体标题中
  assert.match(md, /\*\*标题第一句\*\*/)
  // 正文段落保留
  assert.match(md, /这是正文段落。/)
  // 标题不应在正文列表项中重复出现
  assert.doesNotMatch(md, /- 标题第一句/)
})

test('回复/转推显示对应图标', () => {
  const reply = convertToMarkdown(makeItem({ tweetType: 'reply' }))
  assert.match(reply, /💬/)
  const rt = convertToMarkdown(makeItem({ tweetType: 'retweet' }))
  assert.match(rt, /🔁/)
})

test('5个Nitter源各自渲染对应标签', () => {
  const cases = [
    ['Roblox_RTC', 'Roblox_RTC', 'Roblox RTC', '📰'],
    ['Bloxy_News', 'Bloxy_News', 'Bloxy News', '📢'],
    ['Roblox', 'Roblox', 'Roblox 官方', '🟥'],
    ['MrNotifier', 'MrNotifier', 'MrNotifier', '🔔'],
    ['Rolimons', 'Rolimons', 'Rolimons', '💰'],
  ]
  for (const [sourceName, handle, label, emoji] of cases) {
    const item = makeItem({ sourceName, author: handle, link: `https://x.com/${handle}/status/9` })
    const md = convertBatchToMarkdown([item])
    assert.ok(md.includes(label), `${sourceName} 应包含标签 ${label}`)
    assert.ok(md.includes(emoji), `${sourceName} 应包含emoji ${emoji}`)
  }
})

test('Rolimons 行情数值字段加粗', () => {
  const item = makeItem({
    sourceName: 'Rolimons',
    author: 'Rolimons',
    link: 'https://x.com/Rolimons/status/9',
    title: 'Dominus Empyreus',
    content: 'Dominus Empyreus\nValue: 1,000,000\nRAP: 500,000',
    imageUrls: [],
    tweetType: 'original',
  })
  const md = convertBatchToMarkdown([item])
  assert.match(md, /\*\*Value：\*\*/)
  assert.match(md, /\*\*RAP：\*\*/)
})

test('formatTestPushResult 渲染汇总与明细', () => {
  const md = formatTestPushResult({
    totalSources: 2, okSources: 1, failedSources: 1, emptySources: 0, pushedMessages: 1,
    groups: ['G1'],
    details: [
      { source: 'Roblox_RTC', status: 'ok', items: 3 },
      { source: 'Bloxy_News', status: 'error', items: 0, error: 'timeout' },
    ],
  })
  assert.match(md, /# 测试推送结果/)
  assert.match(md, /✅ \*\*Roblox_RTC\*\*/)
  assert.match(md, /❌ \*\*Bloxy_News\*\*.*timeout/)
})
