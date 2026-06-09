/**
 * ?????????
 * ??Koishi???????????
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
 * ???????
 */
export declare function registerModels(ctx: Context): void;
/**
 * ??????(???????????)
 */
export declare function getSettings(ctx: Context): Promise<PluginSettings>;
/**
 * ??????
 */
export declare function updateSettings(ctx: Context, updates: Partial<PluginSettings>): Promise<void>;
/**
 * ???????RSS?
 */
export declare function getEnabledSources(ctx: Context): Promise<RSSSource[]>;
/**
 * ????RSS?
 */
export declare function getAllSources(ctx: Context): Promise<RSSSource[]>;
/**
 * ???RSS?(??????????)
 */
export declare function initSources(ctx: Context): Promise<void>;
/**
 * ??RSS?
 * ?????URL???,??UNIQUE constraint??
 */
export declare function addSource(ctx: Context, source: Omit<RSSSource, 'id'>): Promise<RSSSource>;
/**
 * ??RSS?
 */
export declare function removeSource(ctx: Context, sourceId: string): Promise<number>;
/**
 * ??RSS???/????
 */
export declare function toggleSource(ctx: Context, sourceId: string, enabled?: boolean): Promise<RSSSource | null>;
/**
 * ????RSS?
 */
export declare function getSource(ctx: Context, sourceId: string): Promise<RSSSource | null>;
/**
 * ?????????
 */
export declare function getEnabledGroups(ctx: Context): Promise<GroupSubscription[]>;
/**
 * ??????
 */
export declare function getAllGroups(ctx: Context): Promise<GroupSubscription[]>;
/**
 * ??????
 */
export declare function addGroup(ctx: Context, groupId: string): Promise<GroupSubscription>;
/**
 * ??????
 */
export declare function addGroups(ctx: Context, groupIds: string[]): Promise<{
    added: string[];
    skipped: string[];
}>;
/**
 * ??????(???,?????)
 */
export declare function removeGroup(ctx: Context, groupId: string): Promise<boolean>;
/**
 * ??????
 */
export declare function removeGroups(ctx: Context, groupIds: string[]): Promise<number>;
/**
 * ?????????
 */
export declare function isItemSent(ctx: Context, sourceId: string, itemGuid: string): Promise<boolean>;
/**
 * ???????
 */
export declare function recordSentItem(ctx: Context, sourceId: string, itemGuid: string): Promise<void>;
/**
 * ?????????(????30????)
 */
export declare function cleanOldRecords(ctx: Context): Promise<number>;
/**
 * ??????
 */
export declare function getSentCount(ctx: Context): Promise<number>;
//# sourceMappingURL=storage.d.ts.map