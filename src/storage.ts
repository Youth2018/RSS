/**
 * ?????????
 * ??Koishi???????????
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
 * ???????
 */
export function registerModels(ctx: Context): void {
  // ??RSS???
  ctx.model.extend('rss_source', {
    id: 'string',
    url: 'string',
    name: 'string',
    enabled: 'boolean',
  }, {
    primary: 'id',
    unique: ['url'],
  })

  // ??????
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

  // ???????
  ctx.model.extend('rss_sent_record', {
    id: 'unsigned',
    sourceId: 'string',
    itemGuid: 'string',
    sentAt: 'unsigned',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // ??????
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
 * ??????(???????????)
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
 * ??????
 */
export async function updateSettings(
  ctx: Context,
  updates: Partial<PluginSettings>,
): Promise<void> {
  const settings = await getSettings(ctx)
  await ctx.database.set('rss_settings', { id: settings.id }, updates)
}

/**
 * ???????RSS?
 */
export async function getEnabledSources(ctx: Context): Promise<RSSSource[]> {
  return ctx.database.get('rss_source', { enabled: true })
}

/**
 * ????RSS?
 */
export async function getAllSources(ctx: Context): Promise<RSSSource[]> {
  return ctx.database.get('rss_source', {})
}

/**
 * ???RSS?(??????????)
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
 * ??RSS?
 * ?????URL???,??UNIQUE constraint??
 */
export async function addSource(
  ctx: Context,
  source: Omit<RSSSource, 'id'>,
): Promise<RSSSource> {
  // ??URL?????
  const existingByUrl = await ctx.database.get('rss_source', { url: source.url })
  if (existingByUrl.length > 0) {
    throw new Error(`RSS?URL???: ${source.url}(???: ${existingByUrl[0].name})`)
  }

  const id = source.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')

  // ??ID?????,????????
  let finalId = id
  const existingById = await ctx.database.get('rss_source', { id: finalId })
  if (existingById.length > 0) {
    finalId = `${id}_${Date.now()}`
  }

  return ctx.database.create('rss_source', { id: finalId, ...source }) as unknown as RSSSource
}

/**
 * ??RSS?
 */
export async function removeSource(ctx: Context, sourceId: string): Promise<number> {
  const result = await ctx.database.remove('rss_source', { id: sourceId })
  // ?????????????
  await ctx.database.remove('rss_sent_record', { sourceId })
  return result.removed ?? 0
}

/**
 * ??RSS???/????
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
 * ????RSS?
 */
export async function getSource(ctx: Context, sourceId: string): Promise<RSSSource | null> {
  const sources = await ctx.database.get('rss_source', { id: sourceId })
  return sources.length > 0 ? sources[0] : null
}

/**
 * ?????????
 */
export async function getEnabledGroups(ctx: Context): Promise<GroupSubscription[]> {
  return ctx.database.get('rss_group', { enabled: true })
}

/**
 * ??????
 */
export async function getAllGroups(ctx: Context): Promise<GroupSubscription[]> {
  return ctx.database.get('rss_group', {})
}

/**
 * ??????
 */
export async function addGroup(
  ctx: Context,
  groupId: string,
): Promise<GroupSubscription> {
  // ???????
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
 * ??????
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
 * ??????(???,?????)
 */
export async function removeGroup(
  ctx: Context,
  groupId: string,
): Promise<boolean> {
  const result = await ctx.database.set('rss_group', { groupId }, { enabled: false })
  return (result.matched ?? 0) > 0
}

/**
 * ??????
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
 * ?????????
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
 * ???????
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
 * ?????????(????30????)
 */
export async function cleanOldRecords(ctx: Context): Promise<number> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const result = await ctx.database.remove('rss_sent_record', {
    sentAt: { $lt: cutoff },
  })
  return result.removed ?? 0
}

/**
 * ??????
 */
export async function getSentCount(ctx: Context): Promise<number> {
  const records = await ctx.database.get('rss_sent_record', {}, {
    fields: ['id'],
  })
  return records.length
}