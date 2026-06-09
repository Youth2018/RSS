/**
 * Markdown消息转换模块
 * 将RSS内容转换为符合QQ官方机器人要求的Markdown格式
 *
 * QQ Markdown支持规范（参考：https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html）：
 * - 支持 # ## ### 标题
 * - 支持 **粗体** __下划线加粗__ _斜体_ *斜体* ***加粗斜体*** ~~删除线~~
 * - 支持 > 块引用
 * - 支持 [文字](链接) 和 <URL> 自动链接
 * - 支持 ![text #宽px #高px](url) 图片语法（注意：尺寸参数在alt和URL之间）
 * - 支持 --- 或 *** 水平分割线
 * - 支持 ```代码块``` 语法
 * - 支持 1. 有序列表 和 - 无序列表
 * - 换行使用 \n（QQ不支持\r换行）
 * - 不支持HTML标签
 *
 * 内容格式规范：
 * - 原文内容使用代码块(```text)封装，保证原文格式完整展示
 * - 代码块外的辅助信息（标题、来源、链接等）使用标准Markdown排版
 * - 代码块内不做Markdown转义，保持原文原样
 */

import { RSSItem } from './types'

/** 默认推送标题 */
const DEFAULT_PUSH_TITLE = 'Roblox RSS 最新推送'

/** QQ Markdown图片尺寸参数 */
const QQ_IMAGE_WIDTH = 400
const QQ_IMAGE_HEIGHT = 300

/** 代码块内内容最大长度（QQ消息总长度限制） */
const MAX_CONTENT_LENGTH = 500

/**
 * 将RSS条目转换为QQ Markdown消息
 */
export function convertToMarkdown(item: RSSItem, pushTitle?: string): string {
  const lines: string[] = []

  // 标题
  lines.push(`## ${formatItemTitle(item)}`)
  lines.push('')

  // 来源信息
  const metaParts = [`来源：${item.sourceName}`]
  if (item.author) {
    metaParts.push(`作者：${item.author}`)
  }
  metaParts.push(`时间：${formatDate(item.pubDate)}`)
  lines.push(`> ${metaParts.join(' | ')}`)
  lines.push('')

  // 原文内容使用代码块封装
  if (item.content) {
    const cleaned = cleanContent(item.content)
    const truncated = cleaned.length > MAX_CONTENT_LENGTH
      ? cleaned.substring(0, MAX_CONTENT_LENGTH) + '...'
      : cleaned
    lines.push('```text')
    lines.push(truncated)
    lines.push('```')
    lines.push('')
  }

  // 图片（使用图床CDN链接）
  // QQ Markdown图片格式：![alt文本 #宽px #高px](url)
  if (item.imageUrls && item.imageUrls.length > 0) {
    for (const imgUrl of item.imageUrls) {
      if (imgUrl.startsWith('http')) {
        lines.push(`![图片 #${QQ_IMAGE_WIDTH}px #${QQ_IMAGE_HEIGHT}px](${imgUrl})`)
        lines.push('')
      }
    }
  }

  // 原文链接
  if (item.link && item.link !== '#') {
    lines.push(`[查看原文](${item.link})`)
  }

  return lines.join('\n')
}

/**
 * 将多个RSS条目转换为一条汇总Markdown消息
 * @param items RSS条目列表
 * @param pushTitle 自定义推送标题，默认"Roblox RSS 最新推送"
 */
export function convertBatchToMarkdown(items: RSSItem[], pushTitle?: string): string {
  if (items.length === 0) return ''

  const title = pushTitle || DEFAULT_PUSH_TITLE
  const lines: string[] = []

  lines.push(`# ${title}`)
  lines.push('')

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // 分割线
    if (i > 0) {
      lines.push('---')
      lines.push('')
    }

    // 条目标题（含类型标记）
    lines.push(`## ${formatItemTitle(item)}`)
    lines.push('')

    // 来源信息（引用块）
    const metaParts = [`来源：${item.sourceName}`]
    if (item.author) {
      metaParts.push(`作者：${item.author}`)
    }
    metaParts.push(`时间：${formatDate(item.pubDate)}`)
    lines.push(`> ${metaParts.join(' | ')}`)
    lines.push('')

    // 原文内容使用代码块封装
    if (item.content) {
      const cleaned = cleanContent(item.content)
      const truncated = cleaned.length > MAX_CONTENT_LENGTH
        ? cleaned.substring(0, MAX_CONTENT_LENGTH) + '...'
        : cleaned
      lines.push('```text')
      lines.push(truncated)
      lines.push('```')
      lines.push('')
    }

    // 图片（使用图床CDN链接）
    // QQ Markdown图片格式：![alt文本 #宽px #高px](url)
    if (item.imageUrls && item.imageUrls.length > 0) {
      for (const imgUrl of item.imageUrls) {
        if (imgUrl.startsWith('http')) {
          lines.push(`![图片 #${QQ_IMAGE_WIDTH}px #${QQ_IMAGE_HEIGHT}px](${imgUrl})`)
          lines.push('')
        }
      }
    }

    // 原文链接
    if (item.link && item.link !== '#') {
      lines.push(`[查看原文](${item.link})`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * 格式化条目标题，包含推文类型标记
 */
function formatItemTitle(item: RSSItem): string {
  const typeIcons: Record<string, string> = {
    reply: '💬',
    retweet: '🔁',
    original: '',
  }
  const icon = typeIcons[item.tweetType] || ''
  return icon ? `${icon} ${item.title}` : item.title
}

/**
 * 将源列表转换为Markdown格式（用于命令回复）
 */
export function formatSourceList(sources: { id: string; name: string; url: string; enabled: boolean }[]): string {
  if (sources.length === 0) return '暂无RSS源'

  const lines: string[] = []
  lines.push('# RSS源列表')
  lines.push('')

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    const status = s.enabled ? '✅' : '❌'
    lines.push(`${i + 1}. ${status} **${s.name}**`)
    lines.push(`   ${s.url}`)
  }

  return lines.join('\n')
}

/**
 * 将群列表转换为Markdown格式（用于命令回复）
 */
export function formatGroupList(groups: { groupId: string; enabled: boolean; createdAt: number }[]): string {
  if (groups.length === 0) return '暂无绑定的群组'

  const lines: string[] = []
  lines.push('# 已绑定群列表')
  lines.push('')

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const status = g.enabled ? '✅' : '❌'
    const time = new Date(g.createdAt).toLocaleString()
    lines.push(`${i + 1}. ${status} 群ID：${g.groupId} | 添加时间：${time}`)
  }

  return lines.join('\n')
}

/**
 * 将状态信息转换为Markdown格式（用于命令回复）
 */
export function formatStatus(status: {
  running: boolean
  checkInterval: number
  sourceCount: number
  groupCount: number
  totalSent: number
  lastCheckTime: number
  nextCheckTime: number
  lastError: string
}): string {
  const lines: string[] = []
  lines.push('# RSS订阅状态')
  lines.push('')
  lines.push(`- **运行状态：** ${status.running ? '✅ 运行中' : '⏹ 已停止'}`)
  lines.push(`- **检查间隔：** ${status.checkInterval} 分钟`)
  lines.push(`- **订阅源数量：** ${status.sourceCount} 个`)
  lines.push(`- **推送群数量：** ${status.groupCount} 个`)
  lines.push(`- **已推送总数：** ${status.totalSent} 条`)
  lines.push(`- **上次检查：** ${status.lastCheckTime ? new Date(status.lastCheckTime).toLocaleString() : '尚未检查'}`)
  lines.push(`- **下次检查：** ${status.nextCheckTime ? new Date(status.nextCheckTime).toLocaleString() : '未安排'}`)

  if (status.lastError) {
    lines.push(`- **最近错误：** ${status.lastError}`)
  }

  return lines.join('\n')
}

/**
 * 清理内容文本（用于代码块内展示）
 * 代码块内不需要Markdown转义，保持原文格式
 */
function cleanContent(content: string): string {
  return content
    // 移除HTML标签
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    // 解码HTML实体
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#8230;/g, '...')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&[a-zA-Z]+;/g, '')
    // 转义代码块内的反引号，防止破坏代码块格式
    .replace(/```/g, '\\`\\`\\`')
    // 合并多余空白（保留换行）
    .replace(/[^\S\n]+/g, ' ')
    // 合并多余换行
    .replace(/\n{3,}/g, '\n\n')
    // 移除控制字符
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
}

/**
 * 格式化日期
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}`
  } catch {
    return dateStr
  }
}
