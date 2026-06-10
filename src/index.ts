/**
 * koishi-plugin-rss-subscribe - 主入口文件
 * Koishi v4 RSS订阅推送插件
 */

import { Context, Schema, Session } from 'koishi'
import {
  registerModels,
  initSources,
  getSettings,
  updateSettings,
  addSource,
  removeSource,
  toggleSource,
  getSource,
  getAllSources,
  addGroup,
  addGroups,
  removeGroup,
  removeGroups,
  getAllGroups,
  getEnabledGroups,
  getSentCount,
} from './storage'
import { startScheduler, stopScheduler, restartScheduler, getStatus, triggerManualCheck, configureScheduler } from './scheduler'
import { formatSourceList, formatGroupList, formatStatus } from './markdown'

/** 插件名称 */
export const name = 'rss-subscribe'

/** 插件依赖注入声明 */
export const inject = ['database']

/** 单个RSS源配置 */
interface RSSSourceConfig {
  /** 源名称 */
  name: string
  /** 源URL */
  url: string
  /** 是否启用 */
  enabled: boolean
}

/** 插件配置接口 */
export interface Config {
  /** 检查间隔（分钟），范围1-1440，默认10 */
  checkInterval: number
  /** 请求超时（毫秒），范围5000-60000，默认15000 */
  requestTimeout: number
  /** 失败重试次数，范围1-10，默认3 */
  maxRetries: number
  /** 每次推送最大条数，范围1-20，默认5 */
  maxItemsPerPush: number
  /** 是否启用定时推送 */
  autoStart: boolean
  /** 推送消息主标题 */
  pushTitle: string
  /** 是否启用图片上传到图床 */
  enableImageUpload: boolean
  /** RSS源列表（控制台可配置） */
  sources: Record<string, RSSSourceConfig>
  /** 推送目标群ID列表 */
  groupIds: string[]
}

/** 单个RSS源的Schema定义 */
const RSSSourceSchema = Schema.object({
  name: Schema.string().description('源名称').required(),
  url: Schema.string().description('RSS源URL').required(),
  enabled: Schema.boolean().description('是否启用').default(true),
})

/** 插件配置项定义 */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    autoStart: Schema.boolean()
      .description('是否在插件加载后自动启动定时推送')
      .default(true),
  }),
  Schema.object({
    pushTitle: Schema.string()
      .description('推送消息主标题（留空则使用默认标题"Roblox RSS 最新推送"）')
      .default('Roblox RSS 最新推送'),
  }),
  Schema.object({
    enableImageUpload: Schema.boolean()
      .description('是否将RSS中的图片上传到图床（关闭则不显示图片）')
      .default(true),
  }),
  Schema.object({
    checkInterval: Schema.number()
      .description('RSS检查间隔时间（分钟）')
      .min(1)
      .max(1440)
      .default(10)
      .role('slider'),
  }),
  Schema.object({
    requestTimeout: Schema.number()
      .description('HTTP请求超时时间（毫秒）')
      .min(5000)
      .max(60000)
      .default(15000),
  }),
  Schema.object({
    maxRetries: Schema.number()
      .description('请求失败重试次数')
      .min(1)
      .max(10)
      .default(3),
  }),
  Schema.object({
    maxItemsPerPush: Schema.number()
      .description('每次推送最多包含的条目数')
      .min(1)
      .max(20)
      .default(5),
  }),
  Schema.object({
    sources: Schema.dict(RSSSourceSchema)
      .description('RSS源管理（添加/删除/启用/停用RSS源）')
      .default({
        roblox_rtc: { name: 'Roblox_RTC', url: 'https://nitter.net/Roblox_RTC/rss', enabled: true },
        bloxy_news: { name: 'Bloxy_News', url: 'https://nitter.net/Bloxy_News/rss', enabled: true },
        roblox: { name: 'Roblox', url: 'https://nitter.net/Roblox/rss', enabled: true },
        mrnotifier: { name: 'MrNotifier', url: 'https://nitter.net/MrNotifier/rss', enabled: true },
        rolimons: { name: 'Rolimons', url: 'https://nitter.net/Rolimons/rss', enabled: true },
      }),
  }),
  Schema.object({
    groupIds: Schema.array(Schema.string())
      .description('推送目标群ID列表（QQ群的group_openid）')
      .default([]),
  }),
])

/**
 * 插件主体
 */
export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('rss-subscribe')

  // ==================== 生命周期 ====================

  // 注册数据库模型（同步，在apply阶段完成）
  registerModels(ctx)

  // 配置调度器参数
  configureScheduler({
    pushTitle: config.pushTitle,
    enableImageUpload: config.enableImageUpload,
  })

  ctx.on('ready', async () => {
    logger.info('RSS订阅插件正在初始化...')

    try {
      // 等待数据库模型就绪
      await ctx.database.get('rss_settings', {}, { limit: 1 })

      // 从配置文件同步RSS源到数据库
      await syncSourcesFromConfig(ctx, config)

      // 从配置文件同步群ID到数据库
      await syncGroupsFromConfig(ctx, config)

      // 应用配置到数据库设置
      await updateSettings(ctx, {
        checkInterval: config.checkInterval,
        requestTimeout: config.requestTimeout,
        maxRetries: config.maxRetries,
        maxItemsPerPush: config.maxItemsPerPush,
        enabled: true,
      })

      // 延迟启动调度器，确保数据库已就绪
      if (config.autoStart) {
        setTimeout(async () => {
          try {
            await startScheduler(ctx)
            logger.info('RSS订阅插件启动完成')
          } catch (error) {
            logger.error(`启动调度器失败: ${(error as Error).message}`)
          }
        }, 3000)
      } else {
        logger.info('RSS订阅插件已就绪（手动启动模式）')
      }
    } catch (error) {
      logger.error(`插件初始化失败: ${(error as Error).message}`)
    }
  })

  ctx.on('dispose', () => {
    stopScheduler(ctx)
    logger.info('RSS订阅插件已卸载')
  })

  // ==================== 配置同步 ====================

  /**
   * 从配置文件同步RSS源到数据库
   * 配置文件中的源会覆盖数据库中的启用状态
   * 处理URL唯一约束：如果新源的URL与已有源冲突，跳过创建并记录警告
   */
  async function syncSourcesFromConfig(ctx: Context, config: Config): Promise<void> {
    const configSources = config.sources || {}
    const existingSources = await getAllSources(ctx)
    const existingMap = new Map(existingSources.map(s => [s.id, s]))
    const existingUrlMap = new Map(existingSources.map(s => [s.url, s]))

    for (const [id, sourceConfig] of Object.entries(configSources)) {
      if (existingMap.has(id)) {
        // 更新已有源的启用状态和名称
        await ctx.database.set('rss_source', { id }, {
          enabled: sourceConfig.enabled,
          name: sourceConfig.name,
          url: sourceConfig.url,
        })
        // 更新URL映射（URL可能被修改）
        existingUrlMap.set(sourceConfig.url, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled } as any)
      } else {
        // 检查URL是否已被其他源使用（包括本轮已添加的源）
        const conflictSource = existingUrlMap.get(sourceConfig.url)
        if (conflictSource) {
          logger.warn(`跳过添加RSS源 [${sourceConfig.name}]：URL已被源 [${conflictSource.name}] 使用 (${sourceConfig.url})`)
          continue
        }

        // 添加新源
        try {
          await ctx.database.create('rss_source', {
            id,
            name: sourceConfig.name,
            url: sourceConfig.url,
            enabled: sourceConfig.enabled,
          })
          // 添加成功后更新URL映射，防止后续源重复添加
          existingUrlMap.set(sourceConfig.url, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled } as any)
          existingMap.set(id, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled } as any)
        } catch (e) {
          logger.warn(`添加RSS源 [${sourceConfig.name}] 失败: ${(e as Error).message}`)
        }
      }
    }
  }

  /**
   * 从配置文件同步群ID到数据库
   */
  async function syncGroupsFromConfig(ctx: Context, config: Config): Promise<void> {
    const configGroupIds = config.groupIds || []
    if (configGroupIds.length === 0) return

    const existingGroups = await getAllGroups(ctx)
    const existingIds = new Set(existingGroups.map(g => g.groupId))

    for (const groupId of configGroupIds) {
      const trimmed = groupId.trim()
      if (!trimmed) continue

      if (existingIds.has(trimmed)) {
        // 确保已存在且启用
        await ctx.database.set('rss_group', { groupId: trimmed }, { enabled: true })
      } else {
        await ctx.database.create('rss_group', {
          groupId: trimmed,
          enabled: true,
          createdAt: Date.now(),
        })
      }
    }
  }

  // ==================== Markdown发送辅助 ====================

  /**
   * 通过session发送原生Markdown消息
   * 使用官方QQ适配器(@koishijs/plugin-adapter-qq)
   *
   * 发送策略：
   * 1. 优先使用 session.qq.sendMessage() 直接调用QQ API（官方适配器注入的internal）
   * 2. 回退使用普通文本发送
   */
  async function sendMarkdown(session: Session, markdown: string): Promise<void> {
    // 策略1：通过 session.qq.sendMessage() 直接发送原生Markdown
    // session.qq 是QQ适配器注入的internal方法，类型定义中不存在，需用any访问
    const qqInternal = (session as any).qq
    if (qqInternal?.sendMessage) {
      try {
        await qqInternal.sendMessage(session.channelId, {
          msg_type: 2,
          msg_id: session.messageId,
          msg_seq: Math.floor(Math.random() * 1000000),
          markdown: { content: markdown },
        })
        return
      } catch (e) {
        logger.debug(`session.qq.sendMessage 发送失败: ${(e as Error).message}，尝试下一种方式`)
      }
    }

    // 策略2：回退为普通消息发送
    await session.send(markdown)
  }

  // ==================== 命令注册 ====================

  // rss 主命令组
  const rssCmd = ctx.command('rss', 'RSS订阅管理')
    .alias('rss订阅')

  // rss status - 查看插件状态
  rssCmd.subcommand('.status', '查看RSS订阅状态')
    .alias('状态')
    .action(async ({ session }) => {
      try {
        const settings = await getSettings(ctx)
        const sources = await getAllSources(ctx)
        const groups = await getAllGroups(ctx)
        const totalSent = await getSentCount(ctx)

        const status = getStatus(sources)
        status.checkInterval = settings.checkInterval
        status.groupCount = groups.filter((g) => g.enabled).length
        status.totalSent = totalSent

        const md = formatStatus(status)
        if (session) {
          await sendMarkdown(session, md)
        } else {
          return md
        }
      } catch (error) {
        return `获取状态失败: ${(error as Error).message}`
      }
    })

  // rss start - 启动推送
  rssCmd.subcommand('.start', '启动RSS定时推送')
    .alias('启动')
    .action(async () => {
      try {
        await updateSettings(ctx, { enabled: true })
        await startScheduler(ctx)
        return 'RSS定时推送已启动'
      } catch (error) {
        return `启动失败: ${(error as Error).message}`
      }
    })

  // rss stop - 停止推送
  rssCmd.subcommand('.stop', '停止RSS定时推送')
    .alias('停止')
    .action(async () => {
      try {
        await updateSettings(ctx, { enabled: false })
        stopScheduler(ctx)
        return 'RSS定时推送已停止'
      } catch (error) {
        return `停止失败: ${(error as Error).message}`
      }
    })

  // rss interval - 设置检查间隔
  rssCmd.subcommand('.interval <minutes:number>', '设置检查间隔时间（分钟，范围1-1440）')
    .alias('间隔')
    .action(async ({ }, minutes: number) => {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return '请输入有效的间隔时间（1-1440分钟）'
      }

      try {
        await updateSettings(ctx, { checkInterval: minutes })
        await restartScheduler(ctx, minutes)
        return `检查间隔已设置为 ${minutes} 分钟`
      } catch (error) {
        return `设置失败: ${(error as Error).message}`
      }
    })

  // rss check - 手动触发一次检查
  rssCmd.subcommand('.check', '手动触发一次RSS检查')
    .alias('检查')
    .action(async () => {
      try {
        await triggerManualCheck(ctx)
        return 'RSS检查已触发，请查看日志了解结果'
      } catch (error) {
        return `检查失败: ${(error as Error).message}`
      }
    })

  // ==================== 群管理命令 ====================

  // rss group 子命令组
  const groupCmd = rssCmd.subcommand('.group', '管理推送目标群')

  // rss group list - 查看群列表
  groupCmd.subcommand('.list', '查看已绑定的群列表')
    .alias('群列表')
    .action(async ({ session }) => {
      try {
        const groups = await getAllGroups(ctx)
        const md = formatGroupList(groups)
        if (session) {
          await sendMarkdown(session, md)
        } else {
          return md
        }
      } catch (error) {
        return `获取群列表失败: ${(error as Error).message}`
      }
    })

  // rss group add - 添加群
  groupCmd.subcommand('.add <groupIds:text>', '添加推送目标群（多个群用逗号分隔）')
    .alias('添加群')
    .action(async ({ }, groupIds: string) => {
      const ids = groupIds.split(/[,，\s]+/).filter((id) => id.trim())

      if (ids.length === 0) {
        return '请提供有效的群ID'
      }

      try {
        const result = await addGroups(ctx, ids)

        const lines: string[] = []
        if (result.added.length > 0) {
          lines.push(`成功添加 ${result.added.length} 个群: ${result.added.join(', ')}`)
        }
        if (result.skipped.length > 0) {
          lines.push(`以下群已存在，跳过: ${result.skipped.join(', ')}`)
        }

        return lines.join('\n')
      } catch (error) {
        return `添加失败: ${(error as Error).message}`
      }
    })

  // rss group remove - 移除群
  groupCmd.subcommand('.remove <groupIds:text>', '移除推送目标群（多个群用逗号分隔）')
    .alias('移除群')
    .action(async ({ }, groupIds: string) => {
      const ids = groupIds.split(/[,，\s]+/).filter((id) => id.trim())

      if (ids.length === 0) {
        return '请提供有效的群ID'
      }

      try {
        const count = await removeGroups(ctx, ids)
        return `成功移除 ${count} 个群`
      } catch (error) {
        return `移除失败: ${(error as Error).message}`
      }
    })

  // ==================== 源管理命令 ====================

  // rss sources - 查看源列表
  rssCmd.subcommand('.sources', '查看RSS源列表')
    .alias('源列表')
    .action(async ({ session }) => {
      try {
        const sources = await getAllSources(ctx)
        const md = formatSourceList(sources)
        if (session) {
          await sendMarkdown(session, md)
        } else {
          return md
        }
      } catch (error) {
        return `获取源列表失败: ${(error as Error).message}`
      }
    })

  // rss enable - 启用RSS源
  rssCmd.subcommand('.enable <sourceId:string>', '启用指定的RSS源')
    .alias('启用源')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await toggleSource(ctx, sourceId, true)
        if (!source) {
          return `未找到RSS源: ${sourceId}，请使用 rss.sources 查看可用源ID`
        }
        return `已启用RSS源: ${source.name} (${source.url})`
      } catch (error) {
        return `启用失败: ${(error as Error).message}`
      }
    })

  // rss disable - 停用RSS源
  rssCmd.subcommand('.disable <sourceId:string>', '停用指定的RSS源')
    .alias('停用源')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await toggleSource(ctx, sourceId, false)
        if (!source) {
          return `未找到RSS源: ${sourceId}，请使用 rss.sources 查看可用源ID`
        }
        return `已停用RSS源: ${source.name} (${source.url})`
      } catch (error) {
        return `停用失败: ${(error as Error).message}`
      }
    })

  // rss toggle - 切换RSS源状态
  rssCmd.subcommand('.toggle <sourceId:string>', '切换RSS源的启用/停用状态')
    .alias('切换源')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await toggleSource(ctx, sourceId)
        if (!source) {
          return `未找到RSS源: ${sourceId}，请使用 rss.sources 查看可用源ID`
        }
        const state = source.enabled ? '启用' : '停用'
        return `RSS源 ${source.name} 已${state}`
      } catch (error) {
        return `切换失败: ${(error as Error).message}`
      }
    })

  // rss add-source - 添加RSS源
  rssCmd.subcommand('.add-source <name:string> <url:string>', '添加自定义RSS源')
    .alias('添加源')
    .action(async ({ }, name: string, url: string) => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return '请输入有效的HTTP/HTTPS链接'
      }

      try {
        await addSource(ctx, { name, url, enabled: true })
        return `成功添加RSS源: ${name}`
      } catch (error) {
        return `添加失败: ${(error as Error).message}`
      }
    })

  // rss remove-source - 删除RSS源
  rssCmd.subcommand('.remove-source <sourceId:string>', '删除RSS源')
    .alias('删除源')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await getSource(ctx, sourceId)
        if (!source) {
          return `未找到RSS源: ${sourceId}`
        }
        const count = await removeSource(ctx, sourceId)
        if (count > 0) {
          return `成功删除RSS源: ${source.name}`
        }
        return `删除RSS源失败: ${sourceId}`
      } catch (error) {
        return `删除失败: ${(error as Error).message}`
      }
    })

  logger.info('RSS订阅插件已加载')
}
