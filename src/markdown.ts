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
 * 消息格式规范：
 * **新闻第一句话**
 * > 作者时间等额外信息
 * - 新闻主要内容
 * ![img #图片高参数px #图片宽参数px](上传图床后的链接)
 * - 新闻补充内容（如存在）
 */

import { RSSItem } from './types'

/** 默认推送标题 */
const DEFAULT_PUSH_TITLE = 'Roblox RSS 最新推送'

/** QQ Markdown图片尺寸参数 */
const QQ_IMAGE_WIDTH = 400
const QQ_IMAGE_HEIGHT = 300

/**
 * 将RSS条目转换为QQ Markdown消息
 * 格式规范：
 * **标题（第一句话）**
 * > 来源：xxx | 作者：xxx | 时间：xxx
 * - 主要内容段落1
 * - 主要内容段落2
 * ![img #400px #300px](图片链接)
 * - 补充内容
 */
export function convertToMarkdown(item: RSSItem, pushTitle?: string): string {
  const lines: string[] = []

  // 标题（粗体显示，消除与正文的重复）
  const typeIcon = getTypeIcon(item.tweetType)
  const titleText = escapeMarkdownText(item.title)
  lines.push(`**${typeIcon}${titleText}**`)
  lines.push('')

  // 来源信息（引用块）
  const metaParts = [`来源：${item.sourceName}`]
  if (item.author) {
    metaParts.push(`作者：${item.author}`)
  }
  metaParts.push(`时间：${formatDate(item.pubDate)}`)
  lines.push(`> ${metaParts.join(' | ')}`)
  lines.push('')

  // 正文内容（去掉与标题重复的第一段）
  const contentBody = removeTitleDuplicate(item.title, item.content)
  if (contentBody) {
    const contentLines = formatContentBody(contentBody)
    for (const line of contentLines) {
      lines.push(line)
    }
  }

  // 图片（使用图床CDN链接）
  if (item.imageUrls && item.imageUrls.length > 0) {
    for (const imgUrl of item.imageUrls) {
      if (imgUrl.startsWith('http')) {
        lines.push('')
        lines.push(`![img #${QQ_IMAGE_WIDTH}px #${QQ_IMAGE_HEIGHT}px](${imgUrl})`)
      }
    }
    lines.push('')
  }

  // 原文链接
  if (item.link && item.link !== '#') {
    lines.push(`[查看原文](${item.link})`)
  }

  return lines.join('\n')
}

/**
 * 将多个RSS条目转换为一条汇总Markdown消息
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

    // 条目标题（粗体显示）
    const typeIcon = getTypeIcon(item.tweetType)
    const titleText = escapeMarkdownText(item.title)
    lines.push(`**${typeIcon}${titleText}**`)
    lines.push('')

    // 来源信息（引用块）
    const metaParts = [`来源：${item.sourceName}`]
    if (item.author) {
      metaParts.push(`作者：${item.author}`)
    }
    metaParts.push(`时间：${formatDate(item.pubDate)}`)
    lines.push(`> ${metaParts.join(' | ')}`)
    lines.push('')

    // 正文内容（去掉与标题重复的第一段）
    const contentBody = removeTitleDuplicate(item.title, item.content)
    if (contentBody) {
      const contentLines = formatContentBody(contentBody)
      for (const line of contentLines) {
        lines.push(line)
      }
    }

    // 图片
    if (item.imageUrls && item.imageUrls.length > 0) {
      for (const imgUrl of item.imageUrls) {
        if (imgUrl.startsWith('http')) {
          lines.push('')
          lines.push(`![img #${QQ_IMAGE_WIDTH}px #${QQ_IMAGE_HEIGHT}px](${imgUrl})`)
        }
      }
      lines.push('')
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
 * 获取推文类型图标
 */
function getTypeIcon(tweetType: string): string {
  const icons: Record<string, string> = {
    reply: '💬 ',
    retweet: '🔁 ',
    original: '',
  }
  return icons[tweetType] || ''
}

/**
 * 移除内容中与标题重复的第一段
 * Nitter RSS的标题通常是正文的第一段，需要去重
 *
 * 去重策略：按行比对，移除内容开头与标题匹配的行
 */
function removeTitleDuplicate(title: string, content: string): string {
  if (!content) return ''
  if (!title) return content.trim()

  const titleLines = title.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim().toLowerCase()).filter(l => l)
  const contentLines = content.split(/\n+/)

  // 逐行比对，跳过内容开头与标题匹配的行
  let skipCount = 0
  for (let i = 0; i < titleLines.length && i < contentLines.length; i++) {
    const contentLine = contentLines[i].replace(/\s+/g, ' ').trim().toLowerCase()
    if (contentLine === titleLines[i]) {
      skipCount = i + 1
    } else {
      break
    }
  }

  if (skipCount > 0) {
    const remaining = contentLines.slice(skipCount).join('\n').trim()
    return remaining
  }

  return content.trim()
}

/**
 * 格式化正文内容为Markdown列表项
 * 将每个段落转换为 - 列表项格式
 */
function formatContentBody(content: string): string[] {
  const lines: string[] = []

  // 按换行分段
  const paragraphs = content.split(/\n+/).filter(p => p.trim())

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // 处理引用内容
    if (trimmed.startsWith('[引用')) {
      lines.push(`> ${escapeMarkdownText(trimmed)}`)
      lines.push('')
      continue
    }

    // 处理URL链接行
    if (trimmed.match(/^https?:\/\/\S+$/)) {
      lines.push(`- ${trimmed}`)
      continue
    }

    // 普通内容段落，使用列表项格式
    lines.push(`- ${escapeMarkdownText(trimmed)}`)
  }

  return lines
}

/**
 * 转义Markdown文本中的特殊字符
 * 确保 &, <, >, #, *, _, ~, `, [, ], (, ) 等字符不会破坏Markdown格式
 * 但保留URL中的特殊字符
 */
function escapeMarkdownText(text: string): string {
  if (!text) return ''

  // 保护URL：先提取所有URL，用不含特殊字符的占位符替换
  const urls: string[] = []
  let protected_text = text.replace(/https?:\/\/\S+/g, (url) => {
    urls.push(url)
    return `URLESCAPE${urls.length - 1}ENDURL`
  })

  // 转义Markdown特殊字符
  protected_text = protected_text
    // 转义反斜杠（先处理，避免双重转义）
    .replace(/\\/g, '\\\\')
    // 转义反引号
    .replace(/`/g, '\\`')
    // 转义星号
    .replace(/\*/g, '\\*')
    // 转义下划线
    .replace(/_/g, '\\_')
    // 转义波浪号
    .replace(/~/g, '\\~')
    // 转义方括号
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    // 转义圆括号
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // 转义井号
    .replace(/#/g, '\\#')
    // 转义大于号（避免被解析为引用块）
    .replace(/>/g, '\\>')
    // 转义小于号
    .replace(/</g, '\\<')
    // 转义竖线
    .replace(/\|/g, '\\|')
    // 转义加号（避免被解析为列表）
    .replace(/^\+/gm, '\\+')
    // 转义减号（避免被解析为列表）—— 仅行首
    .replace(/^-/gm, '\\-')
    // 转义感叹号（避免被解析为图片）
    .replace(/^!/gm, '\\!')

  // 恢复URL
  protected_text = protected_text.replace(/URLESCAPE(\d+)ENDURL/g, (_, idx) => {
    return urls[parseInt(idx)]
  })

  return protected_text
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
