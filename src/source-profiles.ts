/**
 * RSS源画像模块
 * 为已知的 Nitter/Twitter 账号提供专属的展示信息与排版风格，
 * 使不同来源的推送在QQ客户端中呈现统一、整齐、可辨识的版式。
 *
 * 适配账号：
 * - Roblox_RTC   社区资讯
 * - Bloxy_News   新闻资讯
 * - Roblox       官方账号
 * - MrNotifier   更新通知
 * - Rolimons     限量交易行情（含价格/价值数据）
 */

/** 源类别 */
export type SourceCategory = 'official' | 'news' | 'community' | 'trading' | 'generic'

/** 源画像 */
export interface SourceProfile {
  /** 账号handle（小写匹配键） */
  handle: string
  /** 友好显示名 */
  label: string
  /** 标识emoji */
  emoji: string
  /** 类别 */
  category: SourceCategory
  /** 简介 */
  description: string
}

/** 已知账号画像表（键为小写handle） */
const PROFILES: Record<string, SourceProfile> = {
  roblox_rtc: { handle: 'Roblox_RTC', label: 'Roblox RTC', emoji: '📰', category: 'community', description: 'Roblox 社区资讯' },
  bloxy_news: { handle: 'Bloxy_News', label: 'Bloxy News', emoji: '📢', category: 'news', description: 'Roblox 新闻资讯' },
  roblox: { handle: 'Roblox', label: 'Roblox 官方', emoji: '🟥', category: 'official', description: 'Roblox 官方账号' },
  mrnotifier: { handle: 'MrNotifier', label: 'MrNotifier', emoji: '🔔', category: 'news', description: 'Roblox 更新通知' },
  rolimons: { handle: 'Rolimons', label: 'Rolimons', emoji: '💰', category: 'trading', description: 'Roblox 限量交易行情' },
}

/** 默认（未知源）画像 */
const GENERIC_PROFILE: SourceProfile = {
  handle: '',
  label: '',
  emoji: '📄',
  category: 'generic',
  description: '',
}

/**
 * 从URL或链接中提取 Nitter/Twitter 账号handle
 * 支持：nitter.<domain>/<handle>/rss、x.com/<handle>/...、twitter.com/<handle>/...
 */
export function extractHandleFromUrl(url: string): string {
  if (!url) return ''
  const match = url.match(/(?:nitter\.[^/]+|x\.com|twitter\.com)\/([A-Za-z0-9_]+)/i)
  return match ? match[1] : ''
}

/**
 * 根据来源信息获取画像
 * 依次尝试：源URL handle → 原文链接 handle → 源名称
 */
export function getSourceProfile(opts: { url?: string; link?: string; sourceName?: string }): SourceProfile {
  const candidates: string[] = []
  if (opts.url) candidates.push(extractHandleFromUrl(opts.url))
  if (opts.link) candidates.push(extractHandleFromUrl(opts.link))
  if (opts.sourceName) candidates.push(opts.sourceName)

  for (const candidate of candidates) {
    const key = (candidate || '').toLowerCase().trim()
    if (key && PROFILES[key]) {
      return PROFILES[key]
    }
  }
  return GENERIC_PROFILE
}

/**
 * 判断是否为已知的受适配账号
 */
export function isKnownProfile(profile: SourceProfile): boolean {
  return profile.category !== 'generic'
}
