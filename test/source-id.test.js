// 单元测试：generateSourceId —— 防止"新增RSS源后加载错误"（主键冲突/非法ID）回归
const test = require('node:test')
const assert = require('node:assert')
const { generateSourceId } = require('../lib/storage')

test('英文名生成规范ID', () => {
  assert.strictEqual(generateSourceId('Roblox News', new Set()), 'roblox_news')
})

test('非ASCII/中文名回退为 source', () => {
  assert.strictEqual(generateSourceId('机器人新闻', new Set()), 'source')
})

test('空名称回退为 source', () => {
  assert.strictEqual(generateSourceId('', new Set()), 'source')
  assert.strictEqual(generateSourceId('   ', new Set()), 'source')
})

test('ID冲突时追加数字后缀保证唯一', () => {
  const existing = new Set(['roblox', 'roblox_1'])
  assert.strictEqual(generateSourceId('Roblox', existing), 'roblox_2')
})

test('多个同名中文源不会产生相同ID', () => {
  const existing = new Set()
  const id1 = generateSourceId('新闻', existing)
  existing.add(id1)
  const id2 = generateSourceId('资讯', existing)
  existing.add(id2)
  assert.notStrictEqual(id1, id2)
  assert.strictEqual(id1, 'source')
  assert.strictEqual(id2, 'source_1')
})

test('特殊字符被清理，首尾下划线去除', () => {
  assert.strictEqual(generateSourceId('  Bloxy-News!! ', new Set()), 'bloxy_news')
})
