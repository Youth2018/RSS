"use strict";
/**
 * koishi-plugin-rss-subscribe - ?????
 * Koishi v4 RSS??????
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const storage_1 = require("./storage");
const scheduler_1 = require("./scheduler");
const markdown_1 = require("./markdown");
/** ???? */
exports.name = 'rss-subscribe';
/** ???????? */
exports.inject = ['database'];
/** ??RSS??Schema?? */
const RSSSourceSchema = koishi_1.Schema.object({
    name: koishi_1.Schema.string().description('???').required(),
    url: koishi_1.Schema.string().description('RSS?URL').required(),
    enabled: koishi_1.Schema.boolean().description('????').default(true),
});
/** ??????? */
exports.Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        autoStart: koishi_1.Schema.boolean()
            .description('????????????????')
            .default(true),
    }),
    koishi_1.Schema.object({
        pushTitle: koishi_1.Schema.string()
            .description('???????(?????????"Roblox RSS ????")')
            .default('Roblox RSS ????'),
    }),
    koishi_1.Schema.object({
        enableImageUpload: koishi_1.Schema.boolean()
            .description('???RSS?????????(????????)')
            .default(true),
    }),
    koishi_1.Schema.object({
        checkInterval: koishi_1.Schema.number()
            .description('RSS??????(??)')
            .min(1)
            .max(1440)
            .default(10)
            .role('slider'),
    }),
    koishi_1.Schema.object({
        requestTimeout: koishi_1.Schema.number()
            .description('HTTP??????(??)')
            .min(5000)
            .max(60000)
            .default(15000),
    }),
    koishi_1.Schema.object({
        maxRetries: koishi_1.Schema.number()
            .description('????????')
            .min(1)
            .max(10)
            .default(3),
    }),
    koishi_1.Schema.object({
        maxItemsPerPush: koishi_1.Schema.number()
            .description('????????????')
            .min(1)
            .max(20)
            .default(5),
    }),
    koishi_1.Schema.object({
        sources: koishi_1.Schema.dict(RSSSourceSchema)
            .description('RSS???(??/??/??/??RSS?)')
            .default({
            roblox_rtc: { name: 'Roblox_RTC', url: 'https://nitter.net/Roblox_RTC/rss', enabled: true },
            bloxy_news: { name: 'Bloxy_News', url: 'https://nitter.net/Bloxy_News/rss', enabled: true },
            roblox: { name: 'Roblox', url: 'https://nitter.net/Roblox/rss', enabled: true },
            mrnotifier: { name: 'MrNotifier', url: 'https://nitter.net/MrNotifier/rss', enabled: true },
            rolimons: { name: 'Rolimons', url: 'https://nitter.net/Rolimons/rss', enabled: true },
        }),
    }),
    koishi_1.Schema.object({
        groupIds: koishi_1.Schema.array(koishi_1.Schema.string())
            .description('?????ID??(QQ??group_openid)')
            .default([]),
    }),
]);
/**
 * ????
 */
function apply(ctx, config) {
    const logger = ctx.logger('rss-subscribe');
    // ==================== ???? ====================
    // ???????(??,?apply????)
    (0, storage_1.registerModels)(ctx);
    // ???????
    (0, scheduler_1.configureScheduler)({
        pushTitle: config.pushTitle,
        enableImageUpload: config.enableImageUpload,
    });
    ctx.on('ready', async () => {
        logger.info('RSS?????????...');
        try {
            // ?????????
            await ctx.database.get('rss_settings', {}, { limit: 1 });
            // ???????RSS?????
            await syncSourcesFromConfig(ctx, config);
            // ????????ID????
            await syncGroupsFromConfig(ctx, config);
            // ??????????
            await (0, storage_1.updateSettings)(ctx, {
                checkInterval: config.checkInterval,
                requestTimeout: config.requestTimeout,
                maxRetries: config.maxRetries,
                maxItemsPerPush: config.maxItemsPerPush,
                enabled: true,
            });
            // ???????,????????
            if (config.autoStart) {
                setTimeout(async () => {
                    try {
                        await (0, scheduler_1.startScheduler)(ctx);
                        logger.info('RSS????????');
                    }
                    catch (error) {
                        logger.error(`???????: ${error.message}`);
                    }
                }, 3000);
            }
            else {
                logger.info('RSS???????(??????)');
            }
        }
        catch (error) {
            logger.error(`???????: ${error.message}`);
        }
    });
    ctx.on('dispose', () => {
        (0, scheduler_1.stopScheduler)(ctx);
        logger.info('RSS???????');
    });
    // ==================== ???? ====================
    /**
     * ???????RSS?????
     * ???????????????????
     * ??URL????:?????URL??????,?????????
     */
    async function syncSourcesFromConfig(ctx, config) {
        const configSources = config.sources || {};
        const existingSources = await (0, storage_1.getAllSources)(ctx);
        const existingMap = new Map(existingSources.map(s => [s.id, s]));
        const existingUrlMap = new Map(existingSources.map(s => [s.url, s]));
        for (const [id, sourceConfig] of Object.entries(configSources)) {
            if (existingMap.has(id)) {
                // ?????????????
                await ctx.database.set('rss_source', { id }, {
                    enabled: sourceConfig.enabled,
                    name: sourceConfig.name,
                    url: sourceConfig.url,
                });
                // ??URL??(URL?????)
                existingUrlMap.set(sourceConfig.url, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled });
            }
            else {
                // ??URL?????????(?????????)
                const conflictSource = existingUrlMap.get(sourceConfig.url);
                if (conflictSource) {
                    logger.warn(`????RSS? [${sourceConfig.name}]:URL??? [${conflictSource.name}] ?? (${sourceConfig.url})`);
                    continue;
                }
                // ????
                try {
                    await ctx.database.create('rss_source', {
                        id,
                        name: sourceConfig.name,
                        url: sourceConfig.url,
                        enabled: sourceConfig.enabled,
                    });
                    // ???????URL??,?????????
                    existingUrlMap.set(sourceConfig.url, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled });
                    existingMap.set(id, { id, name: sourceConfig.name, url: sourceConfig.url, enabled: sourceConfig.enabled });
                }
                catch (e) {
                    logger.warn(`??RSS? [${sourceConfig.name}] ??: ${e.message}`);
                }
            }
        }
    }
    /**
     * ????????ID????
     */
    async function syncGroupsFromConfig(ctx, config) {
        const configGroupIds = config.groupIds || [];
        if (configGroupIds.length === 0)
            return;
        const existingGroups = await (0, storage_1.getAllGroups)(ctx);
        const existingIds = new Set(existingGroups.map(g => g.groupId));
        for (const groupId of configGroupIds) {
            const trimmed = groupId.trim();
            if (!trimmed)
                continue;
            if (existingIds.has(trimmed)) {
                // ????????
                await ctx.database.set('rss_group', { groupId: trimmed }, { enabled: true });
            }
            else {
                await ctx.database.create('rss_group', {
                    groupId: trimmed,
                    enabled: true,
                    createdAt: Date.now(),
                });
            }
        }
    }
    // ==================== Markdown???? ====================
    /**
     * ??session????Markdown??
     * ????QQ????crack???
     *
     * ????:
     * 1. ???? session.qq.sendMessage() ????QQ API(????????internal)
     * 2. ???? qq:rawmarkdown ??(crack?????)
     * 3. ????????????
     */
    async function sendMarkdown(session, markdown) {
        // ??1:?? session.qq.sendMessage() ??????Markdown
        // session.qq ?QQ??????internal??,????????,??any??
        const qqInternal = session.qq;
        if (qqInternal?.sendMessage) {
            try {
                await qqInternal.sendMessage(session.channelId, {
                    msg_type: 2,
                    msg_id: session.messageId,
                    msg_seq: Math.floor(Math.random() * 1000000),
                    markdown: { content: markdown },
                });
                return;
            }
            catch (e) {
                logger.debug(`session.qq.sendMessage ????: ${e.message},???????`);
            }
        }
        // ??2:?? qq:rawmarkdown ??(crack?????)
        try {
            await session.send((0, koishi_1.h)('qq:rawmarkdown', { content: markdown }));
            return;
        }
        catch (e) {
            logger.debug(`qq:rawmarkdown ????: ${e.message},???????`);
        }
        // ??3:?????????
        await session.send(markdown);
    }
    // ==================== ???? ====================
    // rss ????
    const rssCmd = ctx.command('rss', 'RSS????')
        .alias('rss??');
    // rss status - ??????
    rssCmd.subcommand('.status', '??RSS????')
        .alias('??')
        .action(async ({ session }) => {
        try {
            const settings = await (0, storage_1.getSettings)(ctx);
            const sources = await (0, storage_1.getAllSources)(ctx);
            const groups = await (0, storage_1.getAllGroups)(ctx);
            const totalSent = await (0, storage_1.getSentCount)(ctx);
            const status = (0, scheduler_1.getStatus)(sources);
            status.checkInterval = settings.checkInterval;
            status.groupCount = groups.filter((g) => g.enabled).length;
            status.totalSent = totalSent;
            const md = (0, markdown_1.formatStatus)(status);
            if (session) {
                await sendMarkdown(session, md);
            }
            else {
                return (0, koishi_1.h)('qq:rawmarkdown', { content: md });
            }
        }
        catch (error) {
            return `??????: ${error.message}`;
        }
    });
    // rss start - ????
    rssCmd.subcommand('.start', '??RSS????')
        .alias('??')
        .action(async () => {
        try {
            await (0, storage_1.updateSettings)(ctx, { enabled: true });
            await (0, scheduler_1.startScheduler)(ctx);
            return 'RSS???????';
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss stop - ????
    rssCmd.subcommand('.stop', '??RSS????')
        .alias('??')
        .action(async () => {
        try {
            await (0, storage_1.updateSettings)(ctx, { enabled: false });
            (0, scheduler_1.stopScheduler)(ctx);
            return 'RSS???????';
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss interval - ??????
    rssCmd.subcommand('.interval <minutes:number>', '????????(??,??1-1440)')
        .alias('??')
        .action(async ({}, minutes) => {
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
            return '??????????(1-1440??)';
        }
        try {
            await (0, storage_1.updateSettings)(ctx, { checkInterval: minutes });
            await (0, scheduler_1.restartScheduler)(ctx, minutes);
            return `???????? ${minutes} ??`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss check - ????????
    rssCmd.subcommand('.check', '??????RSS??')
        .alias('??')
        .action(async () => {
        try {
            await (0, scheduler_1.triggerManualCheck)(ctx);
            return 'RSS?????,?????????';
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // ==================== ????? ====================
    // rss group ????
    const groupCmd = rssCmd.subcommand('.group', '???????');
    // rss group list - ?????
    groupCmd.subcommand('.list', '?????????')
        .alias('???')
        .action(async ({ session }) => {
        try {
            const groups = await (0, storage_1.getAllGroups)(ctx);
            const md = (0, markdown_1.formatGroupList)(groups);
            if (session) {
                await sendMarkdown(session, md);
            }
            else {
                return (0, koishi_1.h)('qq:rawmarkdown', { content: md });
            }
        }
        catch (error) {
            return `???????: ${error.message}`;
        }
    });
    // rss group add - ???
    groupCmd.subcommand('.add <groupIds:text>', '???????(????????)')
        .alias('???')
        .action(async ({}, groupIds) => {
        const ids = groupIds.split(/[,,\s]+/).filter((id) => id.trim());
        if (ids.length === 0) {
            return '???????ID';
        }
        try {
            const result = await (0, storage_1.addGroups)(ctx, ids);
            const lines = [];
            if (result.added.length > 0) {
                lines.push(`???? ${result.added.length} ??: ${result.added.join(', ')}`);
            }
            if (result.skipped.length > 0) {
                lines.push(`??????,??: ${result.skipped.join(', ')}`);
            }
            return lines.join('\n');
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss group remove - ???
    groupCmd.subcommand('.remove <groupIds:text>', '???????(????????)')
        .alias('???')
        .action(async ({}, groupIds) => {
        const ids = groupIds.split(/[,,\s]+/).filter((id) => id.trim());
        if (ids.length === 0) {
            return '???????ID';
        }
        try {
            const count = await (0, storage_1.removeGroups)(ctx, ids);
            return `???? ${count} ??`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // ==================== ????? ====================
    // rss sources - ?????
    rssCmd.subcommand('.sources', '??RSS???')
        .alias('???')
        .action(async ({ session }) => {
        try {
            const sources = await (0, storage_1.getAllSources)(ctx);
            const md = (0, markdown_1.formatSourceList)(sources);
            if (session) {
                await sendMarkdown(session, md);
            }
            else {
                return (0, koishi_1.h)('qq:rawmarkdown', { content: md });
            }
        }
        catch (error) {
            return `???????: ${error.message}`;
        }
    });
    // rss enable - ??RSS?
    rssCmd.subcommand('.enable <sourceId:string>', '?????RSS?')
        .alias('???')
        .action(async ({}, sourceId) => {
        try {
            const source = await (0, storage_1.toggleSource)(ctx, sourceId, true);
            if (!source) {
                return `???RSS?: ${sourceId},??? rss.sources ?????ID`;
            }
            return `???RSS?: ${source.name} (${source.url})`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss disable - ??RSS?
    rssCmd.subcommand('.disable <sourceId:string>', '?????RSS?')
        .alias('???')
        .action(async ({}, sourceId) => {
        try {
            const source = await (0, storage_1.toggleSource)(ctx, sourceId, false);
            if (!source) {
                return `???RSS?: ${sourceId},??? rss.sources ?????ID`;
            }
            return `???RSS?: ${source.name} (${source.url})`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss toggle - ??RSS???
    rssCmd.subcommand('.toggle <sourceId:string>', '??RSS????/????')
        .alias('???')
        .action(async ({}, sourceId) => {
        try {
            const source = await (0, storage_1.toggleSource)(ctx, sourceId);
            if (!source) {
                return `???RSS?: ${sourceId},??? rss.sources ?????ID`;
            }
            const state = source.enabled ? '??' : '??';
            return `RSS? ${source.name} ?${state}`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss add-source - ??RSS?
    rssCmd.subcommand('.add-source <name:string> <url:string>', '?????RSS?')
        .alias('???')
        .action(async ({}, name, url) => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return '??????HTTP/HTTPS??';
        }
        try {
            await (0, storage_1.addSource)(ctx, { name, url, enabled: true });
            return `????RSS?: ${name}`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    // rss remove-source - ??RSS?
    rssCmd.subcommand('.remove-source <sourceId:string>', '??RSS?')
        .alias('???')
        .action(async ({}, sourceId) => {
        try {
            const source = await (0, storage_1.getSource)(ctx, sourceId);
            if (!source) {
                return `???RSS?: ${sourceId}`;
            }
            const count = await (0, storage_1.removeSource)(ctx, sourceId);
            if (count > 0) {
                return `????RSS?: ${source.name}`;
            }
            return `??RSS???: ${sourceId}`;
        }
        catch (error) {
            return `????: ${error.message}`;
        }
    });
    logger.info('RSS???????');
}
//# sourceMappingURL=index.js.map