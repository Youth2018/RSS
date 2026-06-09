"use strict";
/**
 * ?????????
 * ??Koishi???????????
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModels = registerModels;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.getEnabledSources = getEnabledSources;
exports.getAllSources = getAllSources;
exports.initSources = initSources;
exports.addSource = addSource;
exports.removeSource = removeSource;
exports.toggleSource = toggleSource;
exports.getSource = getSource;
exports.getEnabledGroups = getEnabledGroups;
exports.getAllGroups = getAllGroups;
exports.addGroup = addGroup;
exports.addGroups = addGroups;
exports.removeGroup = removeGroup;
exports.removeGroups = removeGroups;
exports.isItemSent = isItemSent;
exports.recordSentItem = recordSentItem;
exports.cleanOldRecords = cleanOldRecords;
exports.getSentCount = getSentCount;
const types_1 = require("./types");
/**
 * ???????
 */
function registerModels(ctx) {
    // ??RSS???
    ctx.model.extend('rss_source', {
        id: 'string',
        url: 'string',
        name: 'string',
        enabled: 'boolean',
    }, {
        primary: 'id',
        unique: ['url'],
    });
    // ??????
    ctx.model.extend('rss_group', {
        id: 'unsigned',
        groupId: 'string',
        enabled: 'boolean',
        createdAt: 'unsigned',
    }, {
        primary: 'id',
        unique: ['groupId'],
        autoInc: true,
    });
    // ???????
    ctx.model.extend('rss_sent_record', {
        id: 'unsigned',
        sourceId: 'string',
        itemGuid: 'string',
        sentAt: 'unsigned',
    }, {
        primary: 'id',
        autoInc: true,
    });
    // ??????
    ctx.model.extend('rss_settings', {
        id: 'unsigned',
        checkInterval: 'unsigned',
        requestTimeout: 'unsigned',
        maxRetries: 'unsigned',
        maxItemsPerPush: 'unsigned',
        enabled: 'boolean',
    }, {
        primary: 'id',
        autoInc: true,
    });
}
/**
 * ??????(???????????)
 */
async function getSettings(ctx) {
    const settings = await ctx.database.get('rss_settings', {}, { limit: 1 });
    if (settings.length === 0) {
        const created = await ctx.database.create('rss_settings', { ...types_1.DEFAULT_SETTINGS });
        return created;
    }
    return settings[0];
}
/**
 * ??????
 */
async function updateSettings(ctx, updates) {
    const settings = await getSettings(ctx);
    await ctx.database.set('rss_settings', { id: settings.id }, updates);
}
/**
 * ???????RSS?
 */
async function getEnabledSources(ctx) {
    return ctx.database.get('rss_source', { enabled: true });
}
/**
 * ????RSS?
 */
async function getAllSources(ctx) {
    return ctx.database.get('rss_source', {});
}
/**
 * ???RSS?(??????????)
 */
async function initSources(ctx) {
    const existing = await ctx.database.get('rss_source', {});
    const existingUrls = new Set(existing.map((s) => s.url));
    for (const source of types_1.DEFAULT_RSS_SOURCES) {
        if (!existingUrls.has(source.url)) {
            const id = source.name.toLowerCase().replace(/\s+/g, '_');
            await ctx.database.create('rss_source', {
                id,
                url: source.url,
                name: source.name,
                enabled: source.enabled,
            });
        }
    }
}
/**
 * ??RSS?
 * ?????URL???,??UNIQUE constraint??
 */
async function addSource(ctx, source) {
    // ??URL?????
    const existingByUrl = await ctx.database.get('rss_source', { url: source.url });
    if (existingByUrl.length > 0) {
        throw new Error(`RSS?URL???: ${source.url}(???: ${existingByUrl[0].name})`);
    }
    const id = source.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    // ??ID?????,????????
    let finalId = id;
    const existingById = await ctx.database.get('rss_source', { id: finalId });
    if (existingById.length > 0) {
        finalId = `${id}_${Date.now()}`;
    }
    return ctx.database.create('rss_source', { id: finalId, ...source });
}
/**
 * ??RSS?
 */
async function removeSource(ctx, sourceId) {
    const result = await ctx.database.remove('rss_source', { id: sourceId });
    // ?????????????
    await ctx.database.remove('rss_sent_record', { sourceId });
    return result.removed ?? 0;
}
/**
 * ??RSS???/????
 */
async function toggleSource(ctx, sourceId, enabled) {
    const sources = await ctx.database.get('rss_source', { id: sourceId });
    if (sources.length === 0)
        return null;
    const newState = enabled !== undefined ? enabled : !sources[0].enabled;
    await ctx.database.set('rss_source', { id: sourceId }, { enabled: newState });
    const updated = await ctx.database.get('rss_source', { id: sourceId });
    return updated[0] || null;
}
/**
 * ????RSS?
 */
async function getSource(ctx, sourceId) {
    const sources = await ctx.database.get('rss_source', { id: sourceId });
    return sources.length > 0 ? sources[0] : null;
}
/**
 * ?????????
 */
async function getEnabledGroups(ctx) {
    return ctx.database.get('rss_group', { enabled: true });
}
/**
 * ??????
 */
async function getAllGroups(ctx) {
    return ctx.database.get('rss_group', {});
}
/**
 * ??????
 */
async function addGroup(ctx, groupId) {
    // ???????
    const existing = await ctx.database.get('rss_group', { groupId });
    if (existing.length > 0) {
        if (!existing[0].enabled) {
            await ctx.database.set('rss_group', { groupId }, { enabled: true });
        }
        return existing[0];
    }
    return ctx.database.create('rss_group', {
        groupId,
        enabled: true,
        createdAt: Date.now(),
    });
}
/**
 * ??????
 */
async function addGroups(ctx, groupIds) {
    const added = [];
    const skipped = [];
    for (const groupId of groupIds) {
        const trimmed = groupId.trim();
        if (!trimmed)
            continue;
        const existing = await ctx.database.get('rss_group', { groupId: trimmed });
        if (existing.length > 0) {
            if (!existing[0].enabled) {
                await ctx.database.set('rss_group', { groupId: trimmed }, { enabled: true });
                added.push(trimmed);
            }
            else {
                skipped.push(trimmed);
            }
        }
        else {
            await ctx.database.create('rss_group', {
                groupId: trimmed,
                enabled: true,
                createdAt: Date.now(),
            });
            added.push(trimmed);
        }
    }
    return { added, skipped };
}
/**
 * ??????(???,?????)
 */
async function removeGroup(ctx, groupId) {
    const result = await ctx.database.set('rss_group', { groupId }, { enabled: false });
    return (result.matched ?? 0) > 0;
}
/**
 * ??????
 */
async function removeGroups(ctx, groupIds) {
    let count = 0;
    for (const groupId of groupIds) {
        const trimmed = groupId.trim();
        if (!trimmed)
            continue;
        const result = await ctx.database.set('rss_group', { groupId: trimmed }, { enabled: false });
        count += result.matched ?? 0;
    }
    return count;
}
/**
 * ?????????
 */
async function isItemSent(ctx, sourceId, itemGuid) {
    const records = await ctx.database.get('rss_sent_record', { sourceId, itemGuid }, { limit: 1 });
    return records.length > 0;
}
/**
 * ???????
 */
async function recordSentItem(ctx, sourceId, itemGuid) {
    await ctx.database.create('rss_sent_record', {
        sourceId,
        itemGuid,
        sentAt: Date.now(),
    });
}
/**
 * ?????????(????30????)
 */
async function cleanOldRecords(ctx) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const result = await ctx.database.remove('rss_sent_record', {
        sentAt: { $lt: cutoff },
    });
    return result.removed ?? 0;
}
/**
 * ??????
 */
async function getSentCount(ctx) {
    const records = await ctx.database.get('rss_sent_record', {}, {
        fields: ['id'],
    });
    return records.length;
}
//# sourceMappingURL=storage.js.map