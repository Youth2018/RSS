/**
 * 定时调度模块
 * 负责定时检查RSS源并将新内容推送到群聊
 * 集成图床上传功能
 */
import { Context } from 'koishi';
import { PluginStatus, RSSSource } from './types';
/**
 * 配置调度器参数
 */
export declare function configureScheduler(options: {
    pushTitle?: string;
    enableImageUpload?: boolean;
}): void;
/**
 * 获取当前插件状态
 */
export declare function getStatus(sources: RSSSource[]): PluginStatus;
/**
 * 启动定时调度
 */
export declare function startScheduler(ctx: Context): Promise<void>;
/**
 * 停止定时调度
 */
export declare function stopScheduler(ctx: Context): void;
/**
 * 根据新间隔重启调度
 */
export declare function restartScheduler(ctx: Context, newInterval: number): Promise<void>;
/**
 * 手动触发一次RSS检查
 */
export declare function triggerManualCheck(ctx: Context): Promise<void>;
//# sourceMappingURL=scheduler.d.ts.map