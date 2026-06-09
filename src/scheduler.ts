/**
 * ??????
 * ??????RSS???????????
 * ????????
 */

import { Context, h } from 'koishi'
import { fetchRSSFeed } from './rss-parser'
import { uploadImages, UploadProgress } from './image-uploader'
import {
  getSettings,
  getEnabledSources,
  getEnabledGroups,
  isItemSent,
  recordSentItem,
  cleanOldRecords,
  getSentCount,
} from './storage'
import { convertBatchToMarkdown } from './markdown'
import { PluginStatus, RSSSource, RSSItem } from './types'

/** ????? */
let intervalHandle: ReturnType<typeof setInterval> | null = null
/** ?????? */
let nextCheckTime = 0
/** ?????? */
let lastCheckTime = 0
/** ???? */
let lastError = ''
/** ?????? */
let isRunning = false
/** ??????? */
let schedulerStarted = false
/** ??????? */
let cachedSentCount = 0
/** ??????? */
let customPushTitle = ''
/** ???????? */
let imageUploadEnabled = true

/**
 * ???????
 */
export function configureScheduler(options: { pushTitle?: string; enableImageUpload?: boolean }): void {
  if (options.pushTitle !== undefined) customPushTitle = options.pushTitle
  if (options.enableImageUpload !== undefined) imageUploadEnabled = options.enableImageUpload
}

/**
 * ????????
 */
export function getStatus(sources: RSSSource[]): PluginStatus {
  return {
    running: isRunning || schedulerStarted,
    nextCheckTime,
    checkInterval: 0,
    sourceCount: sources.filter((s) => s.enabled).length,
    groupCount: 0,
    totalSent: cachedSentCount,
    lastCheckTime,
    lastError,
  }
}

/**
 * ??????
 */
export async function startScheduler(ctx: Context): Promise<void> {
  if (schedulerStarted) return

  const settings = await getSettings(ctx)

  if (!settings.enabled) {
    ctx.logger('rss-subscribe').info('?????,???????')
    return
  }

  await runScheduler(ctx, settings.checkInterval)
  schedulerStarted = true

  ctx.logger('rss-subscribe').info(
    `RSS???????,????:${settings.checkInterval}??`,
  )
}

/**
 * ??????
 */
export function stopScheduler(ctx: Context): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  schedulerStarted = false
  ctx.logger('rss-subscribe').info('RSS???????')
}

/**
 * ?????????
 */
export async function restartScheduler(ctx: Context, newInterval: number): Promise<void> {
  stopScheduler(ctx)
  await runScheduler(ctx, newInterval)
  schedulerStarted = true
}

/**
 * ??????RSS??
 */
export async function triggerManualCheck(ctx: Context): Promise<void> {
  ctx.logger('rss-subscribe').info('????RSS??')
  await performCheck(ctx)
}

/**
 * ??????
 */
async function runScheduler(ctx: Context, intervalMinutes: number): Promise<void> {
  const intervalMs = intervalMinutes * 60 * 1000

  await performCheck(ctx)

  intervalHandle = setInterval(async () => {
    await performCheck(ctx)
  }, intervalMs)

  nextCheckTime = Date.now() + intervalMs
}

/**
 * ????RSS??
 */
async function performCheck(ctx: Context): Promise<void> {
  if (isRunning) {
    ctx.logger('rss-subscribe').debug('?????????,????')
    return
  }

  const logger = ctx.logger('rss-subscribe')
  isRunning = true
  lastError = ''

  try {
    const settings = await getSettings(ctx)

    if (!settings.enabled) return

    const sources = await getEnabledSources(ctx)
    const groups = await getEnabledGroups(ctx)

    if (sources.length === 0) {
      logger.debug('?????RSS?')
      return
    }

    if (groups.length === 0) {
      logger.debug('???????')
      return
    }

    logger.info(`???? ${sources.length} ?RSS?...`)
    lastCheckTime = Date.now()

    let newItemsCount = 0

    for (const source of sources) {
      try {
        logger.debug(`???: ${source.name} (${source.url})`)

        const items = await fetchRSSFeed(source.url, source.id, source.name, settings)

        if (items.length === 0) {
          logger.debug(`? [${source.name}] ????`)
          continue
        }

        // ??
        const newItems: RSSItem[] = []
        for (const item of items) {
          const sent = await isItemSent(ctx, source.id, item.guid)
          if (!sent) {
            newItems.push(item)
          }
        }

        if (newItems.length === 0) {
          logger.debug(`? [${source.name}] ????????`)
          continue
        }

        logger.info(`? [${source.name}] ?? ${newItems.length} ????`)

        const toPush = newItems.slice(0, settings.maxItemsPerPush)

        // ???????
        if (imageUploadEnabled) {
          for (const item of toPush) {
            if (item.imageUrls && item.imageUrls.length > 0) {
              try {
                const uploadMap = await uploadImages(item.imageUrls, ctx, (progress: UploadProgress) => {
                  logger.debug(`??????: ${progress.current}/${progress.total} - ${progress.status} ${progress.url}`)
                })
                // ????URL?CDN??
                item.imageUrls = item.imageUrls.map(url => uploadMap.get(url) || url)
              } catch (error) {
                logger.warn(`??????: ${(error as Error).message}`)
              }
            }
          }
        } else {
          // ???????,????URL(nitter??????????)
          for (const item of toPush) {
            item.imageUrls = []
          }
        }

        // ???Markdown
        const markdown = convertBatchToMarkdown(toPush, customPushTitle || undefined)

        // ???????
        let pushSuccess = 0
        let pushFailed = 0

        for (const group of groups) {
          try {
            await sendMarkdownToGroup(ctx, group.groupId, markdown)
            pushSuccess++
          } catch (error) {
            pushFailed++
            logger.warn(`???? ${group.groupId} ??: ${(error as Error).message}`)
          }
        }

        // ?????
        for (const item of toPush) {
          await recordSentItem(ctx, source.id, item.guid)
          newItemsCount++
        }

        if (pushSuccess > 0) {
          logger.info(`? [${source.name}] ????: ??${pushSuccess}??,??${pushFailed}??`)
        }
      } catch (error) {
        const msg = `??? [${source.name}] ??: ${(error as Error).message}`
        logger.warn(msg)
        lastError = msg
      }
    }

    cachedSentCount = await getSentCount(ctx)

    // ???????
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000
    if (now % (7 * dayInMs) < settings.checkInterval * 60 * 1000) {
      const removed = await cleanOldRecords(ctx)
      if (removed > 0) {
        logger.debug(`??? ${removed} ?????`)
      }
    }

    logger.info(`??????: ?? ${newItemsCount} ????,???`)
  } catch (error) {
    const msg = `RSS????: ${(error as Error).message}`
    logger.error(msg)
    lastError = msg
  } finally {
    isRunning = false
    nextCheckTime = Date.now() + (await getSettings(ctx)).checkInterval * 60 * 1000
  }
}

/**
 * ?QQ?????Markdown??
 * ????QQ???(@koishijs/plugin-adapter-qq)?crack???
 *
 * ????:
 * 1. ???? bot.internal.sendMessage() ????QQ API,?? msg_type=2 ?Markdown??
 *    ???????????escapeMarkdown??,????Markdown??
 * 2. ???? qq:rawmarkdown ??(?crack?????)
 * 3. ????????????
 */
async function sendMarkdownToGroup(
  ctx: Context,
  groupId: string,
  markdown: string,
): Promise<void> {
  const bots = [...ctx.bots]
  if (bots.length === 0) {
    throw new Error('?????Bot??')
  }

  let sent = false
  let lastError: Error | null = null

  for (const bot of bots) {
    // ??1:?? bot.internal.sendMessage() ??????Markdown
    // ???????,???? msg_type=2 + markdown.content ???
    if (bot.internal?.sendMessage) {
      try {
        await bot.internal.sendMessage(groupId, {
          msg_type: 2,
          msg_seq: Math.floor(Math.random() * 1000000),
          markdown: { content: markdown },
        })
        sent = true
        break
      } catch (e) {
        lastError = e as Error
        ctx.logger('rss-subscribe').debug(`internal.sendMessage ????: ${(e as Error).message},???????`)
      }
    }

    // ??2:?? qq:rawmarkdown ??(crack?????)
    try {
      const content = h('qq:rawmarkdown', { content: markdown })
      await bot.sendMessage(groupId, content)
      sent = true
      break
    } catch (e) {
      lastError = e as Error
      ctx.logger('rss-subscribe').debug(`qq:rawmarkdown ????: ${(e as Error).message},???????`)
    }

    // ??3:?????????
    try {
      await bot.sendMessage(groupId, markdown)
      sent = true
      break
    } catch (e) {
      lastError = e as Error
      continue
    }
  }

  if (!sent) {
    throw new Error(`?????? ${groupId}:${lastError?.message || '?????Bot??'}`)
  }
}
