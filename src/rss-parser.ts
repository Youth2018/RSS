/**
 * RSS解析模块
 * 负责从RSS源抓取并解析内容
 * 专门适配Nitter RSS源格式
 *
 * Nitter RSS格式特点（基于实际rss.txt分析）：
 * - 标题格式：
 *   - 原创: "内容文本"
 *   - 回复: "R to @用户名: 回复内容"
 *   - 转推: "RT by @转发者: 原作者内容"
 * - description: CDATA包裹的HTML，包含<p>文本、<a>链接、<img>图片
 * - dc:creator: "@用户名"格式
 * - guid: 推文ID
 * - link: nitter.net/用户名/status/ID#m
 */

import RssParser from 'rss-parser'
import { RSSItem, PluginSettings } from './types'

const parser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Koishi-RSS-Plugin/1.0',
  },
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'dcCreator'],
    ],
  },
})

/**
 * 初始化RSS解析器，更新超时设置
 */
export function updateParserTimeout(timeout: number): void {
  ;(parser as unknown as Record<string, unknown>).timeout = timeout
}

/**
 * 判断URL是否为Nitter RSS源
 */
function isNitterUrl(url: string): boolean {
  return url.includes('nitter.net') || url.includes('nitter.')
}

/**
 * 从指定URL抓取并解析RSS内容
 */
export async function fetchRSSFeed(
  url: string,
  sourceId: string,
  sourceName: string,
  settings: PluginSettings,
): Promise<RSSItem[]> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= settings.maxRetries; attempt++) {
    try {
      updateParserTimeout(settings.requestTimeout)

      const feed = await parser.parseURL(url)

      if (!feed || !feed.items || feed.items.length === 0) {
        return []
      }

      const nitterMode = isNitterUrl(url)

      const items: RSSItem[] = feed.items.map((item) => {
        const tweetType = detectTweetType(item.title || '', nitterMode)
        return {
          guid: item.guid || item.link || item.title || `unknown-${Date.now()}-${Math.random()}`,
          title: extractTitle(item, nitterMode, tweetType),
          content: extractContent(item, nitterMode, tweetType),
          link: normalizeLink(item.link, url),
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          author: extractAuthor(item, nitterMode, tweetType),
          sourceId,
          sourceName,
          imageUrls: extractImageUrls(item, nitterMode),
          tweetType,
        }
      })

      return items
    } catch (error) {
      lastError = error as Error
      if (attempt < settings.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw new Error(
    `抓取RSS源 [${sourceName}] 失败 (已重试${settings.maxRetries}次): ${lastError?.message}`,
  )
}

/**
 * 检测推文类型
 * Nitter RSS标题格式：
 * - 原创: 直接内容文本
 * - 回复: "R to @用户名: 内容"
 * - 转推: "RT by @用户名: 内容"
 */
function detectTweetType(title: string, nitterMode: boolean): 'original' | 'reply' | 'retweet' {
  if (!nitterMode) return 'original'
  if (title.startsWith('RT by ')) return 'retweet'
  if (title.startsWith('R to ')) return 'reply'
  return 'original'
}

/**
 * 提取标题
 * 根据推文类型清理标题前缀
 */
function extractTitle(item: RssParser.Item, nitterMode: boolean, tweetType: 'original' | 'reply' | 'retweet'): string {
  let title = item.title || '无标题'

  if (nitterMode) {
    if (tweetType === 'reply') {
      // "R to @Roblox_RTC: 内容" → "内容"
      title = title.replace(/^R to @[^:]+:\s*/, '')
    } else if (tweetType === 'retweet') {
      // "RT by @Roblox_RTC: 内容" → "内容"
      title = title.replace(/^RT by @[^:]+:\s*/, '')
    }
    // 解码 &apos; 等HTML实体
    title = decodeEntities(title)
  }

  return title.trim() || '无标题'
}

/**
 * 从RSS条目中提取文本内容
 * 针对Nitter源做专门优化，保留链接信息
 */
function extractContent(item: RssParser.Item, nitterMode: boolean, tweetType: 'original' | 'reply' | 'retweet'): string {
  if (nitterMode) {
    return extractNitterContent(item, tweetType)
  }

  // 通用RSS源
  const encoded = (item as Record<string, unknown>)['content:encoded'] as string | undefined
    || (item as Record<string, unknown>).contentEncoded as string | undefined
  if (encoded) {
    return stripHtmlAndExtractText(encoded)
  }
  if (item.content) {
    return stripHtmlAndExtractText(item.content)
  }
  if (item.contentSnippet) {
    return item.contentSnippet
  }
  return ''
}

/**
 * 专门提取Nitter RSS源的内容
 * 从description的HTML中提取纯文本，保留roblox.com等关键链接
 */
function extractNitterContent(item: RssParser.Item, tweetType: 'original' | 'reply' | 'retweet'): string {
  // 使用content字段（HTML格式），从中提取文本和链接
  if (item.content) {
    let text = extractTextFromNitterHtml(item.content)
    text = decodeEntities(text)
    return text.trim()
  }

  // 回退到contentSnippet
  if (item.contentSnippet) {
    let text = item.contentSnippet
    text = decodeEntities(text)
    return text.trim()
  }

  return item.title || ''
}

/**
 * 从Nitter HTML内容中提取纯文本
 * 保留roblox.com等关键链接，移除nitter.net代理链接和图片标签
 */
function extractTextFromNitterHtml(html: string): string {
  // 先提取<a>标签中的链接信息
  let text = html
    // 将<a href="roblox链接">显示文本</a> 转为 "显示文本(链接)"
    .replace(/<a\s+href="(https?:\/\/(?:www\.)?(?:roblox\.com|devforum\.roblox\.com)\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
      (_, url, linkText) => {
        // 如果链接文本是截断的URL，直接用完整URL
        if (linkText.includes('…') || linkText.includes('...')) {
          return url
        }
        return `${linkText}(${url})`
      })
    // 移除nitter.net链接（推文引用链接）
    .replace(/<a\s+href="https?:\/\/nitter\.net\/[^"]*"[^>]*>([^<]*)<\/a>/gi, '')
    // 移除hashtag链接
    .replace(/<a\s+href="https?:\/\/nitter\.net\/search[^"]*"[^>]*>([^<]*)<\/a>/gi, '$1')
    // <br> 转换为换行
    .replace(/<br\s*\/?>/gi, '\n')
    // </p> 转换为换行
    .replace(/<\/p>/gi, '\n')
    // 移除所有剩余HTML标签（包括<img>）
    .replace(/<[^>]*>/g, '')
    // 移除pic.twitter.com链接
    .replace(/pic\.twitter\.com\/\S+/g, '')
    // 移除nitter.net图片代理URL
    .replace(/https?:\/\/nitter\.net\/pic\/\S+/g, '')
    // 移除twitter/x.com推文链接
    .replace(/https?:\/\/(?:twitter|x)\.com\/\S+/g, '')
    // 合并多余换行
    .replace(/\n{3,}/g, '\n\n')
    // 合并多余空白（保留换行）
    .replace(/[^\S\n]+/g, ' ')
    .trim()

  return text
}

/**
 * 从RSS条目中提取图片URL
 * Nitter RSS的图片在description的<img>标签中
 */
function extractImageUrls(item: RssParser.Item, nitterMode: boolean): string[] {
  const urls: string[] = []
  const html = item.content || (item as Record<string, unknown>).description as string || ''

  if (!html) return urls

  // 匹配<img src="..."> 标签
  const imgRegex = /<img\s+src="([^"]+)"/gi
  let match: RegExpExecArray | null

  while ((match = imgRegex.exec(html)) !== null) {
    let imgUrl = match[1]

    if (nitterMode) {
      // Nitter图片代理URL格式: https://nitter.net/pic/media%2FHKL8p0xXEAALNpF.jpg
      // 需要解码 %2F 来获取原始twitter图片URL
      // 解码后: https://nitter.net/pic/media/HKL8p0xXEAALNpF.jpg
      // 实际原始URL: https://pbs.twimg.com/media/HKL8p0xXEAALNpF.jpg

      // 将nitter代理URL转换为twitter原始URL
      // /pic/media%2Fxxx → https://pbs.twimg.com/xxx
      const mediaMatch = imgUrl.match(/nitter\.net\/pic\/media%2F(.+\.(?:jpg|png|webp|gif))/i)
        || imgUrl.match(/nitter\.net\/pic\/media\/(.+\.(?:jpg|png|webp|gif))/i)
      if (mediaMatch) {
        imgUrl = `https://pbs.twimg.com/media/${decodeURIComponent(mediaMatch[1])}`
      }

      // /pic/card_img%2Fxxx → https://pbs.twimg.com/card_img/xxx
      const cardMatch = imgUrl.match(/nitter\.net\/pic\/card_img%2F(.+)/i)
        || imgUrl.match(/nitter\.net\/pic\/card_img\/(.+)/i)
      if (cardMatch) {
        imgUrl = `https://pbs.twimg.com/card_img/${decodeURIComponent(cardMatch[1])}`
      }

      // /pic/amplify_video_thumb%2Fxxx → 视频缩略图
      const videoMatch = imgUrl.match(/nitter\.net\/pic\/amplify_video_thumb%2F(.+\.(?:jpg|png|webp))/i)
        || imgUrl.match(/nitter\.net\/pic\/amplify_video_thumb\/(.+\.(?:jpg|png|webp))/i)
      if (videoMatch) {
        imgUrl = `https://pbs.twimg.com/amplify_video_thumb/${decodeURIComponent(videoMatch[1])}`
      }

      // /pic/ext_tw_video_thumb%2Fxxx → 外部视频缩略图
      const extVideoMatch = imgUrl.match(/nitter\.net\/pic\/ext_tw_video_thumb%2F(.+\.(?:jpg|png|webp))/i)
        || imgUrl.match(/nitter\.net\/pic\/ext_tw_video_thumb\/(.+\.(?:jpg|png|webp))/i)
      if (extVideoMatch) {
        imgUrl = `https://pbs.twimg.com/ext_tw_video_thumb/${decodeURIComponent(extVideoMatch[1])}`
      }
    }

    // 过滤掉非图片URL和过小的占位图
    if (imgUrl && !imgUrl.includes('profile_images') && !imgUrl.includes('emoji')) {
      urls.push(imgUrl)
    }
  }

  return urls
}

/**
 * 规范化链接
 * Nitter链接转换为x.com链接
 */
function normalizeLink(link: string | undefined, sourceUrl: string): string {
  if (!link) return '#'

  if (link.includes('nitter.net')) {
    // 移除 #m 后缀
    link = link.replace(/#m$/, '')
    return link.replace(/nitter\.net\/([^/]+)\/status\/(\d+)/, 'x.com/$1/status/$2')
  }

  return link
}

/**
 * 提取作者信息
 */
function extractAuthor(item: RssParser.Item, nitterMode: boolean, tweetType: 'original' | 'reply' | 'retweet'): string | undefined {
  if (nitterMode) {
    const creator = item.creator || (item as Record<string, unknown>).dcCreator as string | undefined
    if (creator) {
      return creator.replace(/^@/, '')
    }
  }

  return item.creator || (item as Record<string, unknown>).author as string | undefined
}

/**
 * 移除HTML标签，保留纯文本（通用版本）
 */
function stripHtmlAndExtractText(html: string): string {
  return decodeEntities(html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}

/**
 * 解码HTML实体
 */
function decodeEntities(text: string): string {
  return text
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
}

/**
 * 判断两个条目是否相同（用于去重）
 */
export function isDuplicateItem(a: RSSItem, b: RSSItem): boolean {
  return a.guid === b.guid
}
