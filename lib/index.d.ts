/**
 * koishi-plugin-rss-subscribe - 主入口文件
 * Koishi v4 RSS订阅推送插件
 */
import { Context, Schema } from 'koishi';
/** 插件名称 */
export declare const name = "rss-subscribe";
/** 插件依赖注入声明 */
export declare const inject: string[];
/** 单个RSS源配置 */
interface RSSSourceConfig {
    /** 源名称 */
    name: string;
    /** 源URL */
    url: string;
    /** 是否启用 */
    enabled: boolean;
}
/** 插件配置接口 */
export interface Config {
    /** 检查间隔（分钟），范围1-1440，默认10 */
    checkInterval: number;
    /** 请求超时（毫秒），范围5000-60000，默认15000 */
    requestTimeout: number;
    /** 失败重试次数，范围1-10，默认3 */
    maxRetries: number;
    /** 每次推送最大条数，范围1-20，默认5 */
    maxItemsPerPush: number;
    /** 是否启用定时推送 */
    autoStart: boolean;
    /** 推送消息主标题 */
    pushTitle: string;
    /** 是否启用图片上传到图床 */
    enableImageUpload: boolean;
    /** RSS源列表（控制台可配置） */
    sources: Record<string, RSSSourceConfig>;
    /** 推送目标群ID列表 */
    groupIds: string[];
}
/** 插件配置项定义 */
export declare const Config: Schema<Config>;
/**
 * 插件主体
 */
export declare function apply(ctx: Context, config: Config): void;
export {};
//# sourceMappingURL=index.d.ts.map