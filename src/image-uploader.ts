/**
 * 图床上传模块
 * 将RSS中的图片上传至img.scdn.io图床，返回可直接访问的CDN链接
 *
 * API文档: https://img.scdn.io/api_docs.php
 * 上传端点: POST https://img.scdn.io/api/v1.php
 * 限流: 5秒/5次, 60秒/120次
 *
 * 限流策略：
 * - 使用滑动窗口令牌桶算法，严格遵守API限流规则
 * - 5秒窗口最多5次请求
 * - 60秒窗口最多120次请求
 * - 单次上传失败自动重试（最多2次）
 * - 批量上传带进度反馈
 */

import { Context } from 'koishi'

/** 图床上传结果 */
interface UploadResult {
  /** 是否成功 */
  success: boolean
  /** 图片CDN链接 */
  url?: string
  /** 错误信息 */
  error?: string
}

/** 批量上传进度回调 */
export interface UploadProgress {
  /** 当前第几张 */
  current: number
  /** 总数 */
  total: number
  /** 当前图片URL */
  url: string
  /** 上传状态 */
  status: 'uploading' | 'success' | 'failed' | 'skipped'
  /** 错误信息（仅failed时） */
  error?: string
}

/** 图片URL到CDN链接的缓存 */
const imageCache = new Map<string, string>()

// ==================== 滑动窗口限流器 ====================

/** 请求时间戳记录 */
const requestTimestamps: number[] = []

/** 5秒窗口最大请求数 */
const WINDOW_5S_MAX = 4  // 留1个余量，实际使用4

/** 60秒窗口最大请求数 */
const WINDOW_60S_MAX = 100  // 留20个余量，实际使用100

/**
 * 清理过期的请求时间戳
 */
function cleanExpiredTimestamps(): void {
  const now = Date.now()
  // 只保留60秒内的时间戳
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 60000) {
    requestTimestamps.shift()
  }
}

/**
 * 获取当前窗口内已使用的请求数
 */
function getRequestCount(windowMs: number): number {
  const now = Date.now()
  cleanExpiredTimestamps()
  return requestTimestamps.filter(ts => now - ts < windowMs).length
}

/**
 * 等待直到可以发送下一个请求
 * 返回等待的毫秒数
 */
async function waitForRateLimit(ctx: Context): Promise<number> {
  const maxRetries = 10
  for (let i = 0; i < maxRetries; i++) {
    const count5s = getRequestCount(5000)
    const count60s = getRequestCount(60000)

    if (count5s < WINDOW_5S_MAX && count60s < WINDOW_60S_MAX) {
      return 0
    }

    // 计算需要等待的时间
    let waitMs: number
    if (count5s >= WINDOW_5S_MAX) {
      // 需要等待5秒窗口中最老的请求过期
      const now = Date.now()
      const window5sRequests = requestTimestamps.filter(ts => now - ts < 5000)
      if (window5sRequests.length > 0) {
        const oldestInWindow = window5sRequests[0]
        waitMs = Math.max(100, 5000 - (now - oldestInWindow) + 100)
      } else {
        waitMs = 1000
      }
    } else {
      // 60秒窗口满了
      waitMs = 2000
    }

    ctx.logger('rss-subscribe').debug(`限流等待: ${waitMs}ms (5s窗口: ${count5s}/${WINDOW_5S_MAX}, 60s窗口: ${count60s}/${WINDOW_60S_MAX})`)
    await new Promise(resolve => setTimeout(resolve, waitMs))
  }

  return 0
}

/**
 * 记录一次请求
 */
function recordRequest(): void {
  requestTimestamps.push(Date.now())
}

// ==================== 上传功能 ====================

/**
 * 上传图片到图床（带限流和重试）
 * @param imageUrl 原始图片URL
 * @param ctx Koishi上下文（用于日志）
 * @param maxRetries 最大重试次数（默认2次）
 */
export async function uploadImage(imageUrl: string, ctx: Context, maxRetries = 2): Promise<string> {
  // 检查缓存
  const cached = imageCache.get(imageUrl)
  if (cached) {
    ctx.logger('rss-subscribe').debug(`图片缓存命中: ${imageUrl}`)
    return cached
  }

  let lastError: string = ''

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 等待限流
      await waitForRateLimit(ctx)

      if (attempt > 0) {
        // 重试前额外等待
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        ctx.logger('rss-subscribe').debug(`图片上传重试 ${attempt}/${maxRetries}，等待 ${retryDelay}ms`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }

      ctx.logger('rss-subscribe').debug(`上传图片到图床: ${imageUrl}`)

      // 记录请求（在下载前记录，因为下载也消耗时间）
      recordRequest()

      // 1. 下载图片
      const imageBuffer = await downloadImage(imageUrl, ctx)

      // 2. 上传到图床
      const result = await uploadToHost(imageBuffer, ctx)

      if (result.success && result.url) {
        imageCache.set(imageUrl, result.url)
        ctx.logger('rss-subscribe').debug(`图片上传成功: ${result.url}`)
        return result.url
      }

      lastError = result.error || '未知错误'

      // 如果是限流错误，等待更长时间
      if (lastError.includes('rate') || lastError.includes('limit') || lastError.includes('429')) {
        ctx.logger('rss-subscribe').warn(`图床限流，等待5秒后重试`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    } catch (error) {
      lastError = (error as Error).message
      ctx.logger('rss-subscribe').warn(`图片处理失败 (尝试${attempt + 1}/${maxRetries + 1}): ${lastError}`)
    }
  }

  ctx.logger('rss-subscribe').warn(`图片上传最终失败: ${imageUrl}, 原因: ${lastError}`)
  return ''
}

/**
 * 批量上传图片，带限流控制和进度反馈
 * @param imageUrls 图片URL列表
 * @param ctx Koishi上下文
 * @param onProgress 进度回调（可选）
 */
export async function uploadImages(
  imageUrls: string[],
  ctx: Context,
  onProgress?: (progress: UploadProgress) => void,
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const total = imageUrls.length

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]

    // 进度反馈：开始上传
    onProgress?.({
      current: i + 1,
      total,
      url,
      status: 'uploading',
    })

    const cdnUrl = await uploadImage(url, ctx)

    if (cdnUrl) {
      results.set(url, cdnUrl)
      onProgress?.({
        current: i + 1,
        total,
        url,
        status: 'success',
      })
    } else {
      onProgress?.({
        current: i + 1,
        total,
        url,
        status: 'failed',
        error: '上传失败',
      })
    }
  }

  return results
}

/**
 * 下载图片到Buffer
 */
async function downloadImage(imageUrl: string, ctx: Context): Promise<Buffer> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Koishi-RSS-Plugin/1.0',
        'Referer': 'https://nitter.net/',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`下载图片失败: HTTP ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 上传Buffer到图床
 */
async function uploadToHost(imageBuffer: Buffer, ctx: Context): Promise<UploadResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(imageBuffer)])
    formData.append('image', blob, 'image.jpg')
    formData.append('outputFormat', 'webp')
    formData.append('cdn_domain', 'img.scdn.io')

    const response = await fetch('https://img.scdn.io/api/v1.php', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    const data = await response.json() as Record<string, unknown>

    if (data.success && data.url) {
      return {
        success: true,
        url: data.url as string,
      }
    }

    return {
      success: false,
      error: (data.error || data.message || '未知错误') as string,
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 清除图片缓存
 */
export function clearImageCache(): void {
  imageCache.clear()
}

/**
 * 获取当前限流状态（用于调试）
 */
export function getRateLimitStatus(): { window5s: number; window60s: number } {
  return {
    window5s: getRequestCount(5000),
    window60s: getRequestCount(60000),
  }
}
