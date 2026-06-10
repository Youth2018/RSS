"use strict";
/**
 * 定时调度模块
 * 负责定时检查RSS源并将新内容推送到群聊
 * 集成图床上传功能
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureScheduler = configureScheduler;
exports.getStatus = getStatus;
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
exports.restartScheduler = restartScheduler;
exports.triggerManualCheck = triggerManualCheck;
const rss_parser_1 = require("./rss-parser");
const image_uploader_1 = require("./image-uploader");
const storage_1 = require("./storage");
const markdown_1 = require("./markdown");
/** 定时器引用 */
let intervalHandle = null;
/** 下次检查时间 */
let nextCheckTime = 0;
/** 上次检查时间 */
let lastCheckTime = 0;
/** 最近错误 */
let lastError = '';
/** 是否正在运行 */
let isRunning = false;
/** 定时器启动时间 */
let schedulerStarted = false;
/** 已推送计数缓存 */
let cachedSentCount = 0;
/** 自定义推送标题 */
let customPushTitle = '';
/** 是否启用图片上传 */
let imageUploadEnabled = true;
/**
 * 配置调度器参数
 */
function configureScheduler(options) {
    if (options.pushTitle !== undefined)
        customPushTitle = options.pushTitle;
    if (options.enableImageUpload !== undefined)
        imageUploadEnabled = options.enableImageUpload;
}
/**
 * 获取当前插件状态
 */
function getStatus(sources) {
    return {
        running: isRunning || schedulerStarted,
        nextCheckTime,
        checkInterval: 0,
        sourceCount: sources.filter((s) => s.enabled).length,
        groupCount: 0,
        totalSent: cachedSentCount,
        lastCheckTime,
        lastError,
    };
}
/**
 * 启动定时调度
 */
async function startScheduler(ctx) {
    if (schedulerStarted)
        return;
    const settings = await (0, storage_1.getSettings)(ctx);
    if (!settings.enabled) {
        ctx.logger('rss-subscribe').info('插件已禁用，不启动定时调度');
        return;
    }
    await runScheduler(ctx, settings.checkInterval);
    schedulerStarted = true;
    ctx.logger('rss-subscribe').info(`RSS定时调度已启动，检查间隔：${settings.checkInterval}分钟`);
}
/**
 * 停止定时调度
 */
function stopScheduler(ctx) {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
    schedulerStarted = false;
    ctx.logger('rss-subscribe').info('RSS定时调度已停止');
}
/**
 * 根据新间隔重启调度
 */
async function restartScheduler(ctx, newInterval) {
    stopScheduler(ctx);
    await runScheduler(ctx, newInterval);
    schedulerStarted = true;
}
/**
 * 手动触发一次RSS检查
 */
async function triggerManualCheck(ctx) {
    ctx.logger('rss-subscribe').info('手动触发RSS检查');
    await performCheck(ctx);
}
/**
 * 运行调度循环
 */
async function runScheduler(ctx, intervalMinutes) {
    const intervalMs = intervalMinutes * 60 * 1000;
    await performCheck(ctx);
    intervalHandle = setInterval(async () => {
        await performCheck(ctx);
    }, intervalMs);
    nextCheckTime = Date.now() + intervalMs;
}
/**
 * 执行一次RSS检查
 */
async function performCheck(ctx) {
    if (isRunning) {
        ctx.logger('rss-subscribe').debug('上一次检查尚未完成，跳过本次');
        return;
    }
    const logger = ctx.logger('rss-subscribe');
    isRunning = true;
    lastError = '';
    try {
        const settings = await (0, storage_1.getSettings)(ctx);
        if (!settings.enabled)
            return;
        const sources = await (0, storage_1.getEnabledSources)(ctx);
        const groups = await (0, storage_1.getEnabledGroups)(ctx);
        if (sources.length === 0) {
            logger.debug('没有可用的RSS源');
            return;
        }
        if (groups.length === 0) {
            logger.debug('没有可用的群组');
            return;
        }
        logger.info(`开始检查 ${sources.length} 个RSS源...`);
        lastCheckTime = Date.now();
        let newItemsCount = 0;
        for (const source of sources) {
            try {
                logger.debug(`检查源: ${source.name} (${source.url})`);
                const items = await (0, rss_parser_1.fetchRSSFeed)(source.url, source.id, source.name, settings);
                if (items.length === 0) {
                    logger.debug(`源 [${source.name}] 无新内容`);
                    continue;
                }
                // 去重
                const newItems = [];
                for (const item of items) {
                    const sent = await (0, storage_1.isItemSent)(ctx, source.id, item.guid);
                    if (!sent) {
                        newItems.push(item);
                    }
                }
                if (newItems.length === 0) {
                    logger.debug(`源 [${source.name}] 所有内容已推送过`);
                    continue;
                }
                logger.info(`源 [${source.name}] 发现 ${newItems.length} 条新内容`);
                const toPush = newItems.slice(0, settings.maxItemsPerPush);
                // 图片上传到图床
                if (imageUploadEnabled) {
                    for (const item of toPush) {
                        if (item.imageUrls && item.imageUrls.length > 0) {
                            try {
                                const uploadMap = await (0, image_uploader_1.uploadImages)(item.imageUrls, ctx, (progress) => {
                                    logger.debug(`图片上传进度: ${progress.current}/${progress.total} - ${progress.status} ${progress.url}`);
                                });
                                // 替换原始URL为CDN链接
                                item.imageUrls = item.imageUrls.map(url => uploadMap.get(url) || url);
                            }
                            catch (error) {
                                logger.warn(`图片上传失败: ${error.message}`);
                            }
                        }
                    }
                }
                else {
                    // 禁用图床上传时，清空图片URL（nitter代理图片无法直接访问）
                    for (const item of toPush) {
                        item.imageUrls = [];
                    }
                }
                // 转换为Markdown
                const markdown = (0, markdown_1.convertBatchToMarkdown)(toPush, customPushTitle || undefined);
                // 推送到所有群组
                let pushSuccess = 0;
                let pushFailed = 0;
                for (const group of groups) {
                    try {
                        await sendMarkdownToGroup(ctx, group.groupId, markdown);
                        pushSuccess++;
                    }
                    catch (error) {
                        pushFailed++;
                        logger.warn(`推送到群 ${group.groupId} 失败: ${error.message}`);
                    }
                }
                // 记录已发送
                for (const item of toPush) {
                    await (0, storage_1.recordSentItem)(ctx, source.id, item.guid);
                    newItemsCount++;
                }
                if (pushSuccess > 0) {
                    logger.info(`源 [${source.name}] 推送完成: 成功${pushSuccess}个群，失败${pushFailed}个群`);
                }
            }
            catch (error) {
                const msg = `检查源 [${source.name}] 出错: ${error.message}`;
                logger.warn(msg);
                lastError = msg;
            }
        }
        cachedSentCount = await (0, storage_1.getSentCount)(ctx);
        // 定期清理旧记录
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;
        if (now % (7 * dayInMs) < settings.checkInterval * 60 * 1000) {
            const removed = await (0, storage_1.cleanOldRecords)(ctx);
            if (removed > 0) {
                logger.debug(`清理了 ${removed} 条过期记录`);
            }
        }
        logger.info(`本轮检查完成: 发现 ${newItemsCount} 条新内容，已推送`);
    }
    catch (error) {
        const msg = `RSS检查出错: ${error.message}`;
        logger.error(msg);
        lastError = msg;
    }
    finally {
        isRunning = false;
        nextCheckTime = Date.now() + (await (0, storage_1.getSettings)(ctx)).checkInterval * 60 * 1000;
    }
}
/**
 * 向QQ群发送原生Markdown消息
 * 使用官方QQ适配器(@koishijs/plugin-adapter-qq)
 *
 * 发送策略：
 * 1. 优先使用 bot.internal.sendMessage() 直接调用QQ API，构造 msg_type=2 的Markdown请求
 *    此方式绕过消息编码器的escapeMarkdown转义，支持所有Markdown语法
 * 2. 回退使用普通文本发送
 */
async function sendMarkdownToGroup(ctx, groupId, markdown) {
    const bots = [...ctx.bots];
    if (bots.length === 0) {
        throw new Error('没有可用的Bot实例');
    }
    let sent = false;
    let lastError = null;
    for (const bot of bots) {
        // 策略1：通过 bot.internal.sendMessage() 直接发送原生Markdown
        // 兼容官方适配器，直接构造 msg_type=2 + markdown.content 请求体
        if (bot.internal?.sendMessage) {
            try {
                await bot.internal.sendMessage(groupId, {
                    msg_type: 2,
                    msg_seq: Math.floor(Math.random() * 1000000),
                    markdown: { content: markdown },
                });
                sent = true;
                break;
            }
            catch (e) {
                lastError = e;
                ctx.logger('rss-subscribe').debug(`internal.sendMessage 发送失败: ${e.message}，尝试下一种方式`);
            }
        }
        // 策略2：回退为普通消息发送
        try {
            await bot.sendMessage(groupId, markdown);
            sent = true;
            break;
        }
        catch (e) {
            lastError = e;
            continue;
        }
    }
    if (!sent) {
        throw new Error(`无法推送到群 ${groupId}：${lastError?.message || '没有可用的Bot实例'}`);
    }
}
//# sourceMappingURL=scheduler.js.map