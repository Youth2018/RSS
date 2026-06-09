/**
 * RSS订阅插件 - 类型定义
 */

/** RSS源配置 */
export interface RSSSource {
  /** 唯一标识 */
  id: string
  /** RSS源URL */
  url: string
  /** 源名称（用于显示） */
  name: string
  /** 是否启用 */
  enabled: boolean
}

/** 群组订阅配置 */
export interface GroupSubscription {
  /** 唯一标识 */
  id: number
  /** QQ群ID */
  groupId: string
  /** 是否启用 */
  enabled: boolean
  /** 添加时间 */
  createdAt: number
}

/** 已发送记录 */
export interface SentRecord {
  /** 唯一标识 */
  id: number
  /** RSS源ID */
  sourceId: string
  /** 推文链接/GUID */
  itemGuid: string
  /** 发送时间 */
  sentAt: number
}

/** 插件设置 */
export interface PluginSettings {
  /** 唯一标识 */
  id: number
  /** 检查间隔（分钟），默认10分钟 */
  checkInterval: number
  /** 请求超时（毫秒），默认15000 */
  requestTimeout: number
  /** 失败重试次数，默认3 */
  maxRetries: number
  /** 每次推送最大条数，默认5 */
  maxItemsPerPush: number
  /** 是否启用插件 */
  enabled: boolean
}

/** RSS解析后的条目 */
export interface RSSItem {
  /** 唯一标识（GUID或链接） */
  guid: string
  /** 标题 */
  title: string
  /** 内容摘要 */
  content: string
  /** 原文链接 */
  link: string
  /** 发布时间 */
  pubDate: string
  /** 作者 */
  author?: string
  /** 所属源 */
  sourceId: string
  /** 源名称 */
  sourceName: string
  /** 内容中的图片URL列表 */
  imageUrls: string[]
  /** 推文类型：原创/回复/转推 */
  tweetType: 'original' | 'reply' | 'retweet'
}

/** 插件状态 */
export interface PluginStatus {
  /** 是否运行中 */
  running: boolean
  /** 下次检查时间 */
  nextCheckTime: number
  /** 检查间隔（分钟） */
  checkInterval: number
  /** 已订阅源数量 */
  sourceCount: number
  /** 已绑定群数量 */
  groupCount: number
  /** 已推送总数 */
  totalSent: number
  /** 最近一次检查时间 */
  lastCheckTime: number
  /** 最近一次错误 */
  lastError: string
}

/** 默认设置 */
export const DEFAULT_SETTINGS: Omit<PluginSettings, 'id'> = {
  checkInterval: 10,
  requestTimeout: 15000,
  maxRetries: 3,
  maxItemsPerPush: 5,
  enabled: true,
}

/** 默认RSS源列表 */
export const DEFAULT_RSS_SOURCES: Omit<RSSSource, 'id'>[] = [
  { url: 'https://nitter.net/Roblox_RTC/rss', name: 'Roblox_RTC', enabled: true },
  { url: 'https://nitter.net/Bloxy_News/rss', name: 'Bloxy_News', enabled: true },
  { url: 'https://nitter.net/Roblox/rss', name: 'Roblox', enabled: true },
  { url: 'https://nitter.net/MrNotifier/rss', name: 'MrNotifier', enabled: true },
  { url: 'https://nitter.net/Rolimons/rss', name: 'Rolimons', enabled: true },
  { url: 'https://gamerjournalist.com/roblox/feed/', name: 'GamerJournalist_Roblox', enabled: true },
]