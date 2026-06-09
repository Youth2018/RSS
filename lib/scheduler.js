"use strict";
/**
 * ??????
 * ??????RSS???????????
 * ????????
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureScheduler = configureScheduler;
exports.getStatus = getStatus;
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
exports.restartScheduler = restartScheduler;
exports.triggerManualCheck = triggerManualCheck;
const koishi_1 = require("koishi");
const rss_parser_1 = require("./rss-parser");
const image_uploader_1 = require("./image-uploader");
const storage_1 = require("./storage");
const markdown_1 = require("./markdown");
/** ????? */
let intervalHandle = null;
/** ?????? */
let nextCheckTime = 0;
/** ?????? */
let lastCheckTime = 0;
/** ???? */
let lastError = '';
/** ?????? */
let isRunning = false;
/** ??????? */
let schedulerStarted = false;
/** ??????? */
let cachedSentCount = 0;
/** ??????? */
let customPushTitle = '';
/** ???????? */
let imageUploadEnabled = true;
/**
 * ???????
 */
function configureScheduler(options) {
    if (options.pushTitle !== undefined)
        customPushTitle = options.pushTitle;
    if (options.enableImageUpload !== undefined)
        imageUploadEnabled = options.enableImageUpload;
}
/**
 * ????????
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
 * ??????
 */
async function startScheduler(ctx) {
    if (schedulerStarted)
        return;
    const settings = await (0, storage_1.getSettings)(ctx);
    if (!settings.enabled) {
        ctx.logger('rss-subscribe').info('?????,???????');
        return;
    }
    await runScheduler(ctx, settings.checkInterval);
    schedulerStarted = true;
    ctx.logger('rss-subscribe').info(`RSS???????,????:${settings.checkInterval}??`);
}
/**
 * ??????
 */
function stopScheduler(ctx) {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
    schedulerStarted = false;
    ctx.logger('rss-subscribe').info('RSS???????');
}
/**
 * ?????????
 */
async function restartScheduler(ctx, newInterval) {
    stopScheduler(ctx);
    await runScheduler(ctx, newInterval);
    schedulerStarted = true;
}
/**
 * ??????RSS??
 */
async function triggerManualCheck(ctx) {
    ctx.logger('rss-subscribe').info('????RSS??');
    await performCheck(ctx);
}
/**
 * ??????
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
 * ????RSS??
 */
async function performCheck(ctx) {
    if (isRunning) {
        ctx.logger('rss-subscribe').debug('?????????,????');
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
            logger.debug('?????RSS?');
            return;
        }
        if (groups.length === 0) {
            logger.debug('???????');
            return;
        }
        logger.info(`???? ${sources.length} ?RSS?...`);
        lastCheckTime = Date.now();
        let newItemsCount = 0;
        for (const source of sources) {
            try {
                logger.debug(`???: ${source.name} (${source.url})`);
                const items = await (0, rss_parser_1.fetchRSSFeed)(source.url, source.id, source.name, settings);
                if (items.length === 0) {
                    logger.debug(`? [${source.name}] ????`);
                    continue;
                }
                // ??
                const newItems = [];
                for (const item of items) {
                    const sent = await (0, storage_1.isItemSent)(ctx, source.id, item.guid);
                    if (!sent) {
                        newItems.push(item);
                    }
                }
                if (newItems.length === 0) {
                    logger.debug(`? [${source.name}] ????????`);
                    continue;
                }
                logger.info(`? [${source.name}] ?? ${newItems.length} ????`);
                const toPush = newItems.slice(0, settings.maxItemsPerPush);
                // ???????
                if (imageUploadEnabled) {
                    for (const item of toPush) {
                        if (item.imageUrls && item.imageUrls.length > 0) {
                            try {
                                const uploadMap = await (0, image_uploader_1.uploadImages)(item.imageUrls, ctx, (progress) => {
                                    logger.debug(`??????: ${progress.current}/${progress.total} - ${progress.status} ${progress.url}`);
                                });
                                // ????URL?CDN??
                                item.imageUrls = item.imageUrls.map(url => uploadMap.get(url) || url);
                            }
                            catch (error) {
                                logger.warn(`??????: ${error.message}`);
                            }
                        }
                    }
                }
                else {
                    // ???????,????URL(nitter??????????)
                    for (const item of toPush) {
                        item.imageUrls = [];
                    }
                }
                // ???Markdown
                const markdown = (0, markdown_1.convertBatchToMarkdown)(toPush, customPushTitle || undefined);
                // ???????
                let pushSuccess = 0;
                let pushFailed = 0;
                for (const group of groups) {
                    try {
                        await sendMarkdownToGroup(ctx, group.groupId, markdown);
                        pushSuccess++;
                    }
                    catch (error) {
                        pushFailed++;
                        logger.warn(`???? ${group.groupId} ??: ${error.message}`);
                    }
                }
                // ?????
                for (const item of toPush) {
                    await (0, storage_1.recordSentItem)(ctx, source.id, item.guid);
                    newItemsCount++;
                }
                if (pushSuccess > 0) {
                    logger.info(`? [${source.name}] ????: ??${pushSuccess}??,??${pushFailed}??`);
                }
            }
            catch (error) {
                const msg = `??? [${source.name}] ??: ${error.message}`;
                logger.warn(msg);
                lastError = msg;
            }
        }
        cachedSentCount = await (0, storage_1.getSentCount)(ctx);
        // ???????
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;
        if (now % (7 * dayInMs) < settings.checkInterval * 60 * 1000) {
            const removed = await (0, storage_1.cleanOldRecords)(ctx);
            if (removed > 0) {
                logger.debug(`??? ${removed} ?????`);
            }
        }
        logger.info(`??????: ?? ${newItemsCount} ????,???`);
    }
    catch (error) {
        const msg = `RSS????: ${error.message}`;
        logger.error(msg);
        lastError = msg;
    }
    finally {
        isRunning = false;
        nextCheckTime = Date.now() + (await (0, storage_1.getSettings)(ctx)).checkInterval * 60 * 1000;
    }
}
/**
 * ?QQ?????Markdown??
 * ????QQ???(@koishijs/plugin-adapter-qq)?crack???
 *
 * ????:
 * 1. ???? bot.internal.sendMessage() ????QQ API,?? msg_type=2 ?Markdown??
 *    ???????????escapeMarkdown??,????Markdown??
 * 2. ???? qq:rawmarkdown ??(?crack?????)
 * 3. ????????????
 */
async function sendMarkdownToGroup(ctx, groupId, markdown) {
    const bots = [...ctx.bots];
    if (bots.length === 0) {
        throw new Error('?????Bot??');
    }
    let sent = false;
    let lastError = null;
    for (const bot of bots) {
        // ??1:?? bot.internal.sendMessage() ??????Markdown
        // ???????,???? msg_type=2 + markdown.content ???
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
                ctx.logger('rss-subscribe').debug(`internal.sendMessage ????: ${e.message},???????`);
            }
        }
        // ??2:?? qq:rawmarkdown ??(crack?????)
        try {
            const content = (0, koishi_1.h)('qq:rawmarkdown', { content: markdown });
            await bot.sendMessage(groupId, content);
            sent = true;
            break;
        }
        catch (e) {
            lastError = e;
            ctx.logger('rss-subscribe').debug(`qq:rawmarkdown ????: ${e.message},???????`);
        }
        // ??3:?????????
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
        throw new Error(`?????? ${groupId}:${lastError?.message || '?????Bot??'}`);
    }
}
//# sourceMappingURL=scheduler.js.map