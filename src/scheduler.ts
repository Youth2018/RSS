/**
 * 定时调度模块
 * 负责定时检查RSS源并将新内容推送到群聊
 * 集成图床上传功能
 */

import { Context } from 'koishi'
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

/** 定时器引用 */
let intervalHandle: ReturnType<typeof setInterval> | null = null
/** 下次检查时间 */
let nextCheckTime = 0
/** 上次检查时间 */
let lastCheckTime = 0
/** 最近错误 */
let lastError = ''
/** 是否正在运行 */
let isRunning = false
/** 定时器启动时间 */
let schedulerStarted = false
/** 已推送计数缓存 */
let cachedSentCount = 0
/** 自定义推送标题 */
let customPushTitle = ''
/** 是否启用图片上传 */
let imageUploadEnabled = true

/**
 * 配置调度器参数
 */
export function configureScheduler(options: { pushTitle?: string; enableImageUpload?: boolean }): void {
  if (options.pushTitle !== undefined) customPushTitle = options.pushTitle
  if (options.enableImageUpload !== undefined) imageUploadEnabled = options.enableImageUpload
}

/**
 * 获取当前插件状态
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
 * 启动定时调度
 */
export async function startScheduler(ctx: Context): Promise<void> {
  if (schedulerStarted) return

  const settings = await getSettings(ctx)

  if (!settings.enabled) {
    ctx.logger('rss-subscribe').info('插件已禁用，不启动定时调度')
    return
  }

  await runScheduler(ctx, settings.checkInterval)
  schedulerStarted = true

  ctx.logger('rss-subscribe').info(
    `RSS定时调度已启动，检查间隔：${settings.checkInterval}分钟`,
  )
}

/**
 * 停止定时调度
 */
export function stopScheduler(ctx: Context): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  schedulerStarted = false
  ctx.logger('rss-subscribe').info('RSS定时调度已停止')
}

/**
 * 根据新间隔重启调度
 */
export async function restartScheduler(ctx: Context, newInterval: number): Promise<void> {
  stopScheduler(ctx)
  await runScheduler(ctx, newInterval)
  schedulerStarted = true
}

/**
 * 手动触发一次RSS检查
 */
export async function triggerManualCheck(ctx: Context): Promise<void> {
  ctx.logger('rss-subscribe').info('手动触发RSS检查')
  await performCheck(ctx)
}

/**
 * 运行调度循环
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
 * 执行一次RSS检查
 */
async function performCheck(ctx: Context): Promise<void> {
  if (isRunning) {
    ctx.logger('rss-subscribe').debug('上一次检查尚未完成，跳过本次')
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
      logger.debug('没有可用的RSS源')
      return
    }

    if (groups.length === 0) {
      logger.debug('没有可用的群组')
      return
    }

    logger.info(`开始检查 ${sources.length} 个RSS源...`)
    lastCheckTime = Date.now()

    let newItemsCount = 0

    for (const source of sources) {
      try {
        logger.debug(`检查源: ${source.name} (${source.url})`)

        const items = await fetchRSSFeed(source.url, source.id, source.name, settings)

        if (items.length === 0) {
          logger.debug(`源 [${source.name}] 无新内容`)
          continue
        }

        // 去重
        const newItems: RSSItem[] = []
        for (const item of items) {
          const sent = await isItemSent(ctx, source.id, item.guid)
          if (!sent) {
            newItems.push(item)
          }
        }

        if (newItems.length === 0) {
          logger.debug(`源 [${source.name}] 所有内容已推送过`)
          continue
        }

        logger.info(`源 [${source.name}] 发现 ${newItems.length} 条新内容`)

        const toPush = newItems.slice(0, settings.maxItemsPerPush)

        // 图片上传到图床
        if (imageUploadEnabled) {
          for (const item of toPush) {
            if (item.imageUrls && item.imageUrls.length > 0) {
              try {
                const uploadMap = await uploadImages(item.imageUrls, ctx, (progress: UploadProgress) => {
                  logger.debug(`图片上传进度: ${progress.current}/${progress.total} - ${progress.status} ${progress.url}`)
                })
                // 替换原始URL为CDN链接
                item.imageUrls = item.imageUrls.map(url => uploadMap.get(url) || url)
              } catch (error) {
                logger.warn(`图片上传失败: ${(error as Error).message}`)
              }
            }
          }
        } else {
          // 禁用图床上传时，清空图片URL（nitter代理图片无法直接访问）
          for (const item of toPush) {
            item.imageUrls = []
          }
        }

        // 转换为Markdown
        const markdown = convertBatchToMarkdown(toPush, customPushTitle || undefined)

        // 推送到所有群组
        let pushSuccess = 0
        let pushFailed = 0

        for (const group of groups) {
          try {
            await sendMarkdownToGroup(ctx, group.groupId, markdown)
            pushSuccess++
          } catch (error) {
            pushFailed++
            logger.warn(`推送到群 ${group.groupId} 失败: ${(error as Error).message}`)
          }
        }

        // 记录已发送
        for (const item of toPush) {
          await recordSentItem(ctx, source.id, item.guid)
          newItemsCount++
        }

        if (pushSuccess > 0) {
          logger.info(`源 [${source.name}] 推送完成: 成功${pushSuccess}个群，失败${pushFailed}个群`)
        }
      } catch (error) {
        const msg = `检查源 [${source.name}] 出错: ${(error as Error).message}`
        logger.warn(msg)
        lastError = msg
      }
    }

    cachedSentCount = await getSentCount(ctx)

    // 定期清理旧记录
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000
    if (now % (7 * dayInMs) < settings.checkInterval * 60 * 1000) {
      const removed = await cleanOldRecords(ctx)
      if (removed > 0) {
        logger.debug(`清理了 ${removed} 条过期记录`)
      }
    }

    logger.info(`本轮检查完成: 发现 ${newItemsCount} 条新内容，已推送`)
  } catch (error) {
    const msg = `RSS检查出错: ${(error as Error).message}`
    logger.error(msg)
    lastError = msg
  } finally {
    isRunning = false
    nextCheckTime = Date.now() + (await getSettings(ctx)).checkInterval * 60 * 1000
  }
}

/**
 * 向QQ群发送原生Markdown消息
 * 使用官方QQ适配器(@koishijs/plugin-adapter-qq)
 *
 * 发送策略：
 * 1. 优先使用 bot.internal.sendMessage() 直接调用QQ API，构造 msg_type=2 的Markdown请求
 *    此方式绕过消息编码器的escapeMarkdown转义，支持所有Markdown语法
 * 2. 回退使用普通文本发送
 */
async function sendMarkdownToGroup(
  ctx: Context,
  groupId: string,
  markdown: string,
): Promise<void> {
  const bots = [...ctx.bots]
  if (bots.length === 0) {
    throw new Error('没有可用的Bot实例')
  }

  let sent = false
  let lastError: Error | null = null

  for (const bot of bots) {
    // 策略1：通过 bot.internal.sendMessage() 直接发送原生Markdown
    // 兼容官方适配器，直接构造 msg_type=2 + markdown.content 请求体
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
        ctx.logger('rss-subscribe').debug(`internal.sendMessage 发送失败: ${(e as Error).message}，尝试下一种方式`)
      }
    }

    // 策略2：回退为普通消息发送
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
    throw new Error(`无法推送到群 ${groupId}：${lastError?.message || '没有可用的Bot实例'}`)
  }
}
