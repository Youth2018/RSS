/**
 * 内容过滤模块
 * 提供关键词过滤与免打扰时段判断能力
 *
 * - 关键词过滤：根据标题、正文、作者匹配关键词
 *   - include（白名单）：仅推送命中关键词的条目
 *   - exclude（黑名单）：过滤命中关键词的条目
 * - 免打扰时段：在指定小时区间内暂停推送（支持跨午夜区间）
 */

import { RSSItem, FilterMode } from './types'

/**
 * 规范化关键词列表：去除空白、空项并去重（忽略大小写）
 */
export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of keywords || []) {
    const kw = (raw || '').trim()
    if (!kw) continue
    const key = kw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(kw)
  }
  return result
}

/**
 * 判断条目是否命中任意关键词（标题/正文/作者，忽略大小写）
 */
export function matchesKeywords(item: RSSItem, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false
  const haystack = `${item.title || ''}\n${item.content || ''}\n${item.author || ''}`.toLowerCase()
  return keywords.some((kw) => {
    const k = kw.trim().toLowerCase()
    return k.length > 0 && haystack.includes(k)
  })
}

/**
 * 判断条目是否应被推送（通过关键词过滤）
 * @returns true 表示通过过滤可推送；false 表示应被过滤
 */
export function passesKeywordFilter(item: RSSItem, mode: FilterMode, keywords: string[]): boolean {
  if (mode === 'off') return true
  const normalized = normalizeKeywords(keywords)
  if (normalized.length === 0) return true

  const matched = matchesKeywords(item, normalized)
  if (mode === 'include') return matched
  if (mode === 'exclude') return !matched
  return true
}

/**
 * 判断给定时间是否处于免打扰时段
 * @param quietStart 开始小时（0-23），-1 表示禁用
 * @param quietEnd 结束小时（0-23），-1 表示禁用
 * @param date 待判断的时间，默认当前时间
 *
 * 区间为左闭右开 [quietStart, quietEnd)：
 * - quietStart < quietEnd：同日区间，如 1-7 表示 01:00~06:59
 * - quietStart > quietEnd：跨午夜区间，如 23-7 表示 23:00~06:59
 * - quietStart === quietEnd：视为未设置，返回 false
 */
export function isInQuietHours(quietStart: number, quietEnd: number, date: Date = new Date()): boolean {
  if (!Number.isInteger(quietStart) || !Number.isInteger(quietEnd)) return false
  if (quietStart < 0 || quietEnd < 0) return false
  if (quietStart > 23 || quietEnd > 23) return false
  if (quietStart === quietEnd) return false

  const hour = date.getHours()
  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd
  }
  // 跨午夜
  return hour >= quietStart || hour < quietEnd
}
