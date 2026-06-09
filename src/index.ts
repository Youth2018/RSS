/**
 * koishi-plugin-rss-subscribe - ?????
 * Koishi v4 RSS??????
 */

import { Context, Schema, h, Session } from 'koishi'
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

/** ???? */
export const name = 'rss-subscribe'

/** ???????? */
export const inject = ['database']

/** ??RSS??? */
interface RSSSourceConfig {
  /** ??? */
  name: string
  /** ?URL */
  url: string
  /** ???? */
  enabled: boolean
}

/** ?????? */
export interface Config {
  /** ????(??),??1-1440,??10 */
  checkInterval: number
  /** ????(??),??5000-60000,??15000 */
  requestTimeout: number
  /** ??????,??1-10,??3 */
  maxRetries: number
  /** ????????,??1-20,??5 */
  maxItemsPerPush: number
  /** ???????? */
  autoStart: boolean
  /** ??????? */
  pushTitle: string
  /** ??????????? */
  enableImageUpload: boolean
  /** RSS???(??????) */
  sources: Record<string, RSSSourceConfig>
  /** ?????ID?? */
  groupIds: string[]
}

/** ??RSS??Schema?? */
const RSSSourceSchema = Schema.object({
  name: Schema.string().description('???').required(),
  url: Schema.string().description('RSS?URL').required(),
  enabled: Schema.boolean().description('????').default(true),
})

/** ??????? */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    autoStart: Schema.boolean()
      .description('????????????????')
      .default(true),
  }),
  Schema.object({
    pushTitle: Schema.string()
      .description('???????(?????????"Roblox RSS ????")')
      .default('Roblox RSS ????'),
  }),
  Schema.object({
    enableImageUpload: Schema.boolean()
      .description('???RSS?????????(????????)')
      .default(true),
  }),
  Schema.object({
    checkInterval: Schema.number()
      .description('RSS??????(??)')
      .min(1)
      .max(1440)
      .default(10)
      .role('slider'),
  }),
  Schema.object({
    requestTimeout: Schema.number()
      .description('HTTP??????(??)')
      .min(5000)
      .max(60000)
      .default(15000),
  }),
  Schema.object({
    maxRetries: Schema.number()
      .description('????????')
      .min(1)
      .max(10)
      .default(3),
  }),
  Schema.object({
    maxItemsPerPush: Schema.number()
      .description('????????????')
      .min(1)
      .max(20)
      .default(5),
  }),
  Schema.object({
    sources: Schema.dict(RSSSourceSchema)
      .description('RSS???(??/??/??/??RSS?)')
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
      .description('?????ID??(QQ??group_openid)')
      .default([]),
  }),
])

/**
 * ????
 */
export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('rss-subscribe')

  // ==================== ???? ====================

  // ???????(??,?apply????)
  registerModels(ctx)

  // ???????
  configureScheduler({
    pushTitle: config.pushTitle,
    enableImageUpload: config.enableImageUpload,
  })

  ctx.on('ready', async () => {
    logger.info('RSS?????????...')

    try {
      // ?????????
      await ctx.database.get('rss_settings', {}, { limit: 1 })

      // ???????RSS?????
      await syncSourcesFromConfig(ctx, config)

      // ????????ID????
      await syncGroupsFromConfig(ctx, config)

      // ??????????
      await updateSettings(ctx, {
        checkInterval: config.checkInterval,
        requestTimeout: config.requestTimeout,
        maxRetries: config.maxRetries,
        maxItemsPerPush: config.maxItemsPerPush,
        enabled: true,
      })

      // ???????,????????
      if (config.autoStart) {
        setTimeout(async () => {
          try {
            await startScheduler(ctx)
            logger.info('RSS????????')
          } catch (error) {
            logger.error(`???????: ${(error as Error).message}`)
          }
        }, 3000)
      } else {
        logger.info('RSS???????(??????)')
      }
    } catch (error) {
      logger.error(`???????: ${(error as Error).message}`)
    }
  })

  ctx.on('dispose', () => {
    stopScheduler(ctx)
    logger.info('RSS???????')
  })

  // ==================== ???? ====================

  /**
   * ???????RSS?????
   * ???????????????????
   * ??URL????:?????URL??????,?????????
   */
  async function syncSourcesFromConfig(ctx: Context, config: Config): Promise<void> {
    const configSources = config.sources || {}
    const existingSources = await getAllSources(ctx)
    const existingMap = new Map(existingSources.map(s => [s.id, s]))
    const existingUrlMap = new Map(existingSources.map(s => [s.url, s]))

    for (const [id, sourceConfig] of Object.entries(configSources)) {
      if (existingMap.has(id)) {
        // ?????????????
        await ctx.database.set('rss_source', { id }, {
          enabled: sourceConfig.enabled,
          name: sourceConfig.name,
          url: sourceConfig.url,
        })
        // ??URL??(URL?????)
        existingUrlMap.set(sourceConfig.url, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled } as any)
      } else {
        // ??URL?????????(?????????)
        const conflictSource = existingUrlMap.get(sourceConfig.url)
        if (conflictSource) {
          logger.warn(`????RSS? [${sourceConfig.name}]:URL??? [${conflictSource.name}] ?? (${sourceConfig.url})`)
          continue
        }

        // ????
        try {
          await ctx.database.create('rss_source', {
            id,
            name: sourceConfig.name,
            url: sourceConfig.url,
            enabled: sourceConfig.enabled,
          })
          // ???????URL??,?????????
          existingUrlMap.set(sourceConfig.url, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled } as any)
          existingMap.set(id, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled } as any)
        } catch (e) {
          logger.warn(`??RSS? [${sourceConfig.name}] ??: ${(e as Error).message}`)
        }
      }
    }
  }

  /**
   * ????????ID????
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
        // ????????
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

  // ==================== Markdown???? ====================

  /**
   * ??session????Markdown??
   * ????QQ????crack???
   *
   * ????:
   * 1. ???? session.qq.sendMessage() ????QQ API(????????internal)
   * 2. ???? qq:rawmarkdown ??(crack?????)
   * 3. ????????????
   */
  async function sendMarkdown(session: Session, markdown: string): Promise<void> {
    // ??1:?? session.qq.sendMessage() ??????Markdown
    // session.qq ?QQ??????internal??,????????,??any??
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
        logger.debug(`session.qq.sendMessage ????: ${(e as Error).message},???????`)
      }
    }

    // ??2:?? qq:rawmarkdown ??(crack?????)
    try {
      await session.send(h('qq:rawmarkdown', { content: markdown }))
      return
    } catch (e) {
      logger.debug(`qq:rawmarkdown ????: ${(e as Error).message},???????`)
    }

    // ??3:?????????
    await session.send(markdown)
  }

  // ==================== ???? ====================

  // rss ????
  const rssCmd = ctx.command('rss', 'RSS????')
    .alias('rss??')

  // rss status - ??????
  rssCmd.subcommand('.status', '??RSS????')
    .alias('??')
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
          return h('qq:rawmarkdown', { content: md })
        }
      } catch (error) {
        return `??????: ${(error as Error).message}`
      }
    })

  // rss start - ????
  rssCmd.subcommand('.start', '??RSS????')
    .alias('??')
    .action(async () => {
      try {
        await updateSettings(ctx, { enabled: true })
        await startScheduler(ctx)
        return 'RSS???????'
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss stop - ????
  rssCmd.subcommand('.stop', '??RSS????')
    .alias('??')
    .action(async () => {
      try {
        await updateSettings(ctx, { enabled: false })
        stopScheduler(ctx)
        return 'RSS???????'
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss interval - ??????
  rssCmd.subcommand('.interval <minutes:number>', '????????(??,??1-1440)')
    .alias('??')
    .action(async ({ }, minutes: number) => {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return '??????????(1-1440??)'
      }

      try {
        await updateSettings(ctx, { checkInterval: minutes })
        await restartScheduler(ctx, minutes)
        return `???????? ${minutes} ??`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss check - ????????
  rssCmd.subcommand('.check', '??????RSS??')
    .alias('??')
    .action(async () => {
      try {
        await triggerManualCheck(ctx)
        return 'RSS?????,?????????'
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // ==================== ????? ====================

  // rss group ????
  const groupCmd = rssCmd.subcommand('.group', '???????')

  // rss group list - ?????
  groupCmd.subcommand('.list', '?????????')
    .alias('???')
    .action(async ({ session }) => {
      try {
        const groups = await getAllGroups(ctx)
        const md = formatGroupList(groups)
        if (session) {
          await sendMarkdown(session, md)
        } else {
          return h('qq:rawmarkdown', { content: md })
        }
      } catch (error) {
        return `???????: ${(error as Error).message}`
      }
    })

  // rss group add - ???
  groupCmd.subcommand('.add <groupIds:text>', '???????(????????)')
    .alias('???')
    .action(async ({ }, groupIds: string) => {
      const ids = groupIds.split(/[,,\s]+/).filter((id) => id.trim())

      if (ids.length === 0) {
        return '???????ID'
      }

      try {
        const result = await addGroups(ctx, ids)

        const lines: string[] = []
        if (result.added.length > 0) {
          lines.push(`???? ${result.added.length} ??: ${result.added.join(', ')}`)
        }
        if (result.skipped.length > 0) {
          lines.push(`??????,??: ${result.skipped.join(', ')}`)
        }

        return lines.join('\n')
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss group remove - ???
  groupCmd.subcommand('.remove <groupIds:text>', '???????(????????)')
    .alias('???')
    .action(async ({ }, groupIds: string) => {
      const ids = groupIds.split(/[,,\s]+/).filter((id) => id.trim())

      if (ids.length === 0) {
        return '???????ID'
      }

      try {
        const count = await removeGroups(ctx, ids)
        return `???? ${count} ??`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // ==================== ????? ====================

  // rss sources - ?????
  rssCmd.subcommand('.sources', '??RSS???')
    .alias('???')
    .action(async ({ session }) => {
      try {
        const sources = await getAllSources(ctx)
        const md = formatSourceList(sources)
        if (session) {
          await sendMarkdown(session, md)
        } else {
          return h('qq:rawmarkdown', { content: md })
        }
      } catch (error) {
        return `???????: ${(error as Error).message}`
      }
    })

  // rss enable - ??RSS?
  rssCmd.subcommand('.enable <sourceId:string>', '?????RSS?')
    .alias('???')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await toggleSource(ctx, sourceId, true)
        if (!source) {
          return `???RSS?: ${sourceId},??? rss.sources ?????ID`
        }
        return `???RSS?: ${source.name} (${source.url})`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss disable - ??RSS?
  rssCmd.subcommand('.disable <sourceId:string>', '?????RSS?')
    .alias('???')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await toggleSource(ctx, sourceId, false)
        if (!source) {
          return `???RSS?: ${sourceId},??? rss.sources ?????ID`
        }
        return `???RSS?: ${source.name} (${source.url})`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss toggle - ??RSS???
  rssCmd.subcommand('.toggle <sourceId:string>', '??RSS????/????')
    .alias('???')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await toggleSource(ctx, sourceId)
        if (!source) {
          return `???RSS?: ${sourceId},??? rss.sources ?????ID`
        }
        const state = source.enabled ? '??' : '??'
        return `RSS? ${source.name} ?${state}`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss add-source - ??RSS?
  rssCmd.subcommand('.add-source <name:string> <url:string>', '?????RSS?')
    .alias('???')
    .action(async ({ }, name: string, url: string) => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return '??????HTTP/HTTPS??'
      }

      try {
        await addSource(ctx, { name, url, enabled: true })
        return `????RSS?: ${name}`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  // rss remove-source - ??RSS?
  rssCmd.subcommand('.remove-source <sourceId:string>', '??RSS?')
    .alias('???')
    .action(async ({ }, sourceId: string) => {
      try {
        const source = await getSource(ctx, sourceId)
        if (!source) {
          return `???RSS?: ${sourceId}`
        }
        const count = await removeSource(ctx, sourceId)
        if (count > 0) {
          return `????RSS?: ${source.name}`
        }
        return `??RSS???: ${sourceId}`
      } catch (error) {
        return `????: ${(error as Error).message}`
      }
    })

  logger.info('RSS???????')
}
