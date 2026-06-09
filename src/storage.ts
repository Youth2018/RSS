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
  }, {
    primary: 'id',
    autoInc: true,
  })
}

/**
 * 获取插件设置（若不存在则创建默认设置）
 */
export async function getSettings(ctx: Context): Promise<PluginSettings> {
  const settings = await ctx.database.get('rss_settings', {}, { limit: 1 })
  if (settings.length === 0) {
    const created = await ctx.database.create('rss_settings', { ...DEFAULT_SETTINGS })
    return created as unknown as PluginSettings
  }
  return settings[0]
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
 * 添加RSS源
 */
export async function addSource(
  ctx: Context,
  source: Omit<RSSSource, 'id'>,
): Promise<RSSSource> {
  const id = source.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return ctx.database.create('rss_source', { id, ...source }) as unknown as RSSSource
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