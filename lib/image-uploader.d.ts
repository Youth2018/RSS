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
import { Context } from 'koishi';
/** 批量上传进度回调 */
export interface UploadProgress {
    /** 当前第几张 */
    current: number;
    /** 总数 */
    total: number;
    /** 当前图片URL */
    url: string;
    /** 上传状态 */
    status: 'uploading' | 'success' | 'failed' | 'skipped';
    /** 错误信息（仅failed时） */
    error?: string;
}
/**
 * 上传图片到图床（带限流和重试）
 * @param imageUrl 原始图片URL
 * @param ctx Koishi上下文（用于日志）
 * @param maxRetries 最大重试次数（默认2次）
 */
export declare function uploadImage(imageUrl: string, ctx: Context, maxRetries?: number): Promise<string>;
/**
 * 批量上传图片，带限流控制和进度反馈
 * @param imageUrls 图片URL列表
 * @param ctx Koishi上下文
 * @param onProgress 进度回调（可选）
 */
export declare function uploadImages(imageUrls: string[], ctx: Context, onProgress?: (progress: UploadProgress) => void): Promise<Map<string, string>>;
/**
 * 清除图片缓存
 */
export declare function clearImageCache(): void;
/**
 * 获取当前限流状态（用于调试）
 */
export declare function getRateLimitStatus(): {
    window5s: number;
    window60s: number;
};
//# sourceMappingURL=image-uploader.d.ts.map