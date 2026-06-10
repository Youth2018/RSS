/**
 * 数据持久化存储模块
 * 使用Koishi内置数据库进行数据存储
 */
import { Context } from 'koishi';
import { RSSSource, GroupSubscription, SentRecord, PluginSettings } from './types';
declare module 'koishi' {
    interface Tables {
        rss_source: RSSSource;
        rss_group: GroupSubscription;
        rss_sent_record: SentRecord;
        rss_settings: PluginSettings;
    }
}
/**
 * 注册数据库模型
 */
export declare function registerModels(ctx: Context): void;
/**
 * 获取插件设置（若不存在则创建默认设置）
 */
export declare function getSettings(ctx: Context): Promise<PluginSettings>;
/**
 * 更新插件设置
 */
export declare function updateSettings(ctx: Context, updates: Partial<PluginSettings>): Promise<void>;
/**
 * 获取所有启用的RSS源
 */
export declare function getEnabledSources(ctx: Context): Promise<RSSSource[]>;
/**
 * 获取所有RSS源
 */
export declare function getAllSources(ctx: Context): Promise<RSSSource[]>;
/**
 * 初始化RSS源（添加默认源中不存在的）
 */
export declare function initSources(ctx: Context): Promise<void>;
/**
 * 添加RSS源
 * 添加前检查URL唯一性，避免UNIQUE constraint冲突
 */
export declare function addSource(ctx: Context, source: Omit<RSSSource, 'id'>): Promise<RSSSource>;
/**
 * 删除RSS源
 */
export declare function removeSource(ctx: Context, sourceId: string): Promise<number>;
/**
 * 切换RSS源启用/停用状态
 */
export declare function toggleSource(ctx: Context, sourceId: string, enabled?: boolean): Promise<RSSSource | null>;
/**
 * 获取单个RSS源
 */
export declare function getSource(ctx: Context, sourceId: string): Promise<RSSSource | null>;
/**
 * 获取所有启用的群组
 */
export declare function getEnabledGroups(ctx: Context): Promise<GroupSubscription[]>;
/**
 * 获取所有群组
 */
export declare function getAllGroups(ctx: Context): Promise<GroupSubscription[]>;
/**
 * 添加群组订阅
 */
export declare function addGroup(ctx: Context, groupId: string): Promise<GroupSubscription>;
/**
 * 批量添加群组
 */
export declare function addGroups(ctx: Context, groupIds: string[]): Promise<{
    added: string[];
    skipped: string[];
}>;
/**
 * 移除群组订阅（软删除，设置为禁用）
 */
export declare function removeGroup(ctx: Context, groupId: string): Promise<boolean>;
/**
 * 批量移除群组
 */
export declare function removeGroups(ctx: Context, groupIds: string[]): Promise<number>;
/**
 * 检查条目是否已发送
 */
export declare function isItemSent(ctx: Context, sourceId: string, itemGuid: string): Promise<boolean>;
/**
 * 记录已发送条目
 */
export declare function recordSentItem(ctx: Context, sourceId: string, itemGuid: string): Promise<void>;
/**
 * 清理过期的发送记录（保留最近30天的记录）
 */
export declare function cleanOldRecords(ctx: Context): Promise<number>;
/**
 * 获取发送统计
 */
export declare function getSentCount(ctx: Context): Promise<number>;
//# sourceMappingURL=storage.d.ts.map