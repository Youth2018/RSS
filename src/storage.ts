/**
 * 数据持久化存储模块
 * 使用Koishi内置数据库进行数据存储
 */

import { Context } from 'koishi'
import {
  RSSSource,
  GroupSubscription,
  SentRecord,
  PluginSettings,
  DEFAULT_SETTINGS,
  DEFAULT_RSS_SOURCES,
} from './types'

declare module 'koishi' {
  interface Tables {
    rss_source: RSSSource
    rss_group: GroupSubscription
    rss_sent_record: SentRecord
    rss_settings: PluginSettings
  }
}

/**
 * 注册数据库模型
 */
export function registerModels(ctx: Context): void {
  // 扩展RSS源模型
  ctx.model.extend('rss_source', {
    id: 'string',
    url: 'string',
    name: 'string',
    enabled: 'boolean',
  }, {
    primary: 'id',
    unique: ['url'],
  })

  // 群组订阅模型
  ctx.model.extend('rss_group', {
    id: 'unsigned',
    groupId: 'string',
    enabled: 'boolean',
    createdAt: 'unsigned',
  }, {
    primary: 'id',
    unique: ['groupId'],
    autoInc: true,
  })

  // 已发送记录模型
  ctx.model.extend('rss_sent_record', {
    id: 'unsigned',
    sourceId: 'string',
    itemGuid: 'string',
    sentAt: 'unsigned',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // 插件设置模型
  ctx.model.extend('rss_settings', {
    id: 'unsigned',
    checkInterval: 'unsigned',
    requestTimeout: 'unsigned',
    maxRetries: 'unsigned',
    maxItemsPerPush: 'unsigned',
    enabled: 'boolean',
    // 关键词过滤与免打扰（v1.3.0 新增，带初始值以兼容旧数据库的列迁移）
    filterMode: { type: 'string', initial: 'off' },
    filterKeywords: { type: 'json', initial: [] },
    quietStart: { type: 'integer', initial: -1 },
    quietEnd: { type: 'integer', initial: -1 },
  }, {
    primary: 'id',
    autoInc: true,
  })
}

/**
 * 规范化设置对象，为旧数据库中可能缺失的字段填充默认值
 */
function normalizeSettings(settings: PluginSettings): PluginSettings {
  if (settings.filterMode !== 'include' && settings.filterMode !== 'exclude') {
    settings.filterMode = 'off'
  }
  if (!Array.isArray(settings.filterKeywords)) {
    settings.filterKeywords = []
  }
  if (typeof settings.quietStart !== 'number' || Number.isNaN(settings.quietStart)) {
    settings.quietStart = -1
  }
  if (typeof settings.quietEnd !== 'number' || Number.isNaN(settings.quietEnd)) {
    settings.quietEnd = -1
  }
  return settings
}

/**
 * 获取插件设置（若不存在则创建默认设置）
 */
export async function getSettings(ctx: Context): Promise<PluginSettings> {
  const settings = await ctx.database.get('rss_settings', {}, { limit: 1 })
  if (settings.length === 0) {
    const created = await ctx.database.create('rss_settings', { ...DEFAULT_SETTINGS })
    return normalizeSettings(created as unknown as PluginSettings)
  }
  return normalizeSettings(settings[0])
}

/**
 * 更新插件设置
 */
export async function updateSettings(
  ctx: Context,
  updates: Partial<PluginSettings>,
): Promise<void> {
  const settings = await getSettings(ctx)
  await ctx.database.set('rss_settings', { id: settings.id }, updates)
}

/**
 * 添加过滤关键词（自动去重，忽略大小写）
 * @returns 添加后的完整关键词列表
 */
export async function addFilterKeywords(ctx: Context, keywords: string[]): Promise<string[]> {
  const settings = await getSettings(ctx)
  const existing = settings.filterKeywords
  const lowerSet = new Set(existing.map((k) => k.toLowerCase()))
  for (const raw of keywords) {
    const kw = raw.trim()
    if (!kw) continue
    if (lowerSet.has(kw.toLowerCase())) continue
    lowerSet.add(kw.toLowerCase())
    existing.push(kw)
  }
  await updateSettings(ctx, { filterKeywords: existing })
  return existing
}

/**
 * 移除过滤关键词（忽略大小写）
 * @returns 移除后的完整关键词列表
 */
export async function removeFilterKeywords(ctx: Context, keywords: string[]): Promise<string[]> {
  const settings = await getSettings(ctx)
  const removeSet = new Set(keywords.map((k) => k.trim().toLowerCase()).filter((k) => k))
  const remaining = settings.filterKeywords.filter((k) => !removeSet.has(k.toLowerCase()))
  await updateSettings(ctx, { filterKeywords: remaining })
  return remaining
}

/**
 * 清空所有过滤关键词
 */
export async function clearFilterKeywords(ctx: Context): Promise<void> {
  await updateSettings(ctx, { filterKeywords: [] })
}

/**
 * 获取所有启用的RSS源
 */
export async function getEnabledSources(ctx: Context): Promise<RSSSource[]> {
  return ctx.database.get('rss_source', { enabled: true })
}

/**
 * 获取所有RSS源
 */
export async function getAllSources(ctx: Context): Promise<RSSSource[]> {
  return ctx.database.get('rss_source', {})
}

/**
 * 初始化RSS源（添加默认源中不存在的）
 */
export async function initSources(ctx: Context): Promise<void> {
  const existing = await ctx.database.get('rss_source', {})
  const existingUrls = new Set(existing.map((s) => s.url))

  for (const source of DEFAULT_RSS_SOURCES) {
    if (!existingUrls.has(source.url)) {
      const id = source.name.toLowerCase().replace(/\s+/g, '_')
      await ctx.database.create('rss_source', {
        id,
        url: source.url,
        name: source.name,
        enabled: source.enabled,
      })
    }
  }
}

/**
 * 根据名称生成安全且唯一的源ID
 * - 仅保留小写字母、数字、下划线
 * - 名称无有效字符（如纯中文/空）时回退为 'source'
 * - 与 existingIds 冲突时追加数字后缀保证唯一
 */
export function generateSourceId(name: string, existingIds: Set<string>): string {
  let base = (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) base = 'source'

  let id = base
  let counter = 1
  while (existingIds.has(id)) {
    id = `${base}_${counter}`
    counter++
  }
  return id
}

/**
 * 添加RSS源
 * - 校验URL有效性与唯一性，重复时抛出友好错误
 * - 自动生成安全且唯一的源ID（兼容中文/空名称），避免主键冲突
 */
export async function addSource(
  ctx: Context,
  source: Omit<RSSSource, 'id'>,
): Promise<RSSSource> {
  const url = (source.url || '').trim()
  if (!url) {
    throw new Error('RSS源URL不能为空')
  }

  const name = (source.name || '').trim() || url

  // 检查URL是否已存在
  const existing = await getAllSources(ctx)
  const duplicate = existing.find((s) => s.url === url)
  if (duplicate) {
    throw new Error(`RSS源URL已存在: ${url}（源名称: ${duplicate.name}）`)
  }

  const id = generateSourceId(name, new Set(existing.map((s) => s.id)))

  return ctx.database.create('rss_source', {
    id,
    name,
    url,
    enabled: source.enabled ?? true,
  }) as unknown as RSSSource
}

/**
 * 删除RSS源
 */
export async function removeSource(ctx: Context, sourceId: string): Promise<number> {
  const result = await ctx.database.remove('rss_source', { id: sourceId })
  // 同时删除该源的相关发送记录
  await ctx.database.remove('rss_sent_record', { sourceId })
  return result.removed ?? 0
}

/**
 * 切换RSS源启用/停用状态
 */
export async function toggleSource(ctx: Context, sourceId: string, enabled?: boolean): Promise<RSSSource | null> {
  const sources = await ctx.database.get('rss_source', { id: sourceId })
  if (sources.length === 0) return null

  const newState = enabled !== undefined ? enabled : !sources[0].enabled
  await ctx.database.set('rss_source', { id: sourceId }, { enabled: newState })

  const updated = await ctx.database.get('rss_source', { id: sourceId })
  return updated[0] || null
}

/**
 * 获取单个RSS源
 */
export async function getSource(ctx: Context, sourceId: string): Promise<RSSSource | null> {
  const sources = await ctx.database.get('rss_source', { id: sourceId })
  return sources.length > 0 ? sources[0] : null
}

/**
 * 获取所有启用的群组
 */
export async function getEnabledGroups(ctx: Context): Promise<GroupSubscription[]> {
  return ctx.database.get('rss_group', { enabled: true })
}

/**
 * 获取所有群组
 */
export async function getAllGroups(ctx: Context): Promise<GroupSubscription[]> {
  return ctx.database.get('rss_group', {})
}

/**
 * 添加群组订阅
 */
export async function addGroup(
  ctx: Context,
  groupId: string,
): Promise<GroupSubscription> {
  // 检查是否已存在
  const existing = await ctx.database.get('rss_group', { groupId })
  if (existing.length > 0) {
    if (!existing[0].enabled) {
      await ctx.database.set('rss_group', { groupId }, { enabled: true })
    }
    return existing[0]
  }

  return ctx.database.create('rss_group', {
    groupId,
    enabled: true,
    createdAt: Date.now(),
  }) as unknown as GroupSubscription
}

/**
 * 批量添加群组
 */
export async function addGroups(
  ctx: Context,
  groupIds: string[],
): Promise<{ added: string[]; skipped: string[] }> {
  const added: string[] = []
  const skipped: string[] = []

  for (const groupId of groupIds) {
    const trimmed = groupId.trim()
    if (!trimmed) continue

    const existing = await ctx.database.get('rss_group', { groupId: trimmed })
    if (existing.length > 0) {
      if (!existing[0].enabled) {
        await ctx.database.set('rss_group', { groupId: trimmed }, { enabled: true })
        added.push(trimmed)
      } else {
        skipped.push(trimmed)
      }
    } else {
      await ctx.database.create('rss_group', {
        groupId: trimmed,
        enabled: true,
        createdAt: Date.now(),
      })
      added.push(trimmed)
    }
  }

  return { added, skipped }
}

/**
 * 移除群组订阅（软删除，设置为禁用）
 */
export async function removeGroup(
  ctx: Context,
  groupId: string,
): Promise<boolean> {
  const result = await ctx.database.set('rss_group', { groupId }, { enabled: false })
  return (result.matched ?? 0) > 0
}

/**
 * 批量移除群组
 */
export async function removeGroups(
  ctx: Context,
  groupIds: string[],
): Promise<number> {
  let count = 0
  for (const groupId of groupIds) {
    const trimmed = groupId.trim()
    if (!trimmed) continue
    const result = await ctx.database.set('rss_group', { groupId: trimmed }, { enabled: false })
    count += result.matched ?? 0
  }
  return count
}

/**
 * 检查条目是否已发送
 */
export async function isItemSent(
  ctx: Context,
  sourceId: string,
  itemGuid: string,
): Promise<boolean> {
  const records = await ctx.database.get('rss_sent_record', { sourceId, itemGuid }, { limit: 1 })
  return records.length > 0
}

/**
 * 记录已发送条目
 */
export async function recordSentItem(
  ctx: Context,
  sourceId: string,
  itemGuid: string,
): Promise<void> {
  await ctx.database.create('rss_sent_record', {
    sourceId,
    itemGuid,
    sentAt: Date.now(),
  })
}

/**
 * 清理过期的发送记录（保留最近30天的记录）
 */
export async function cleanOldRecords(ctx: Context): Promise<number> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const result = await ctx.database.remove('rss_sent_record', {
    sentAt: { $lt: cutoff },
  })
  return result.removed ?? 0
}

/**
 * 获取发送统计
 */
export async function getSentCount(ctx: Context): Promise<number> {
  const records = await ctx.database.get('rss_sent_record', {}, {
    fields: ['id'],
  })
  return records.length
}