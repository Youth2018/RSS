/**
 * ??????
 * ??????RSS???????????
 * ????????
 */
import { Context } from 'koishi';
import { PluginStatus, RSSSource } from './types';
/**
 * ???????
 */
export declare function configureScheduler(options: {
    pushTitle?: string;
    enableImageUpload?: boolean;
}): void;
/**
 * ????????
 */
export declare function getStatus(sources: RSSSource[]): PluginStatus;
/**
 * ??????
 */
export declare function startScheduler(ctx: Context): Promise<void>;
/**
 * ??????
 */
export declare function stopScheduler(ctx: Context): void;
/**
 * ?????????
 */
export declare function restartScheduler(ctx: Context, newInterval: number): Promise<void>;
/**
 * ??????RSS??
 */
export declare function triggerManualCheck(ctx: Context): Promise<void>;
//# sourceMappingURL=scheduler.d.ts.map