"use strict";
/**
 * RSS订阅插件 - 类型定义
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RSS_SOURCES = exports.DEFAULT_SETTINGS = void 0;
/** 默认设置 */
exports.DEFAULT_SETTINGS = {
    checkInterval: 10,
    requestTimeout: 15000,
    maxRetries: 3,
    maxItemsPerPush: 5,
    enabled: true,
};
/** 默认RSS源列表 */
exports.DEFAULT_RSS_SOURCES = [
    { url: 'https://nitter.net/Roblox_RTC/rss', name: 'Roblox_RTC', enabled: true },
    { url: 'https://nitter.net/Bloxy_News/rss', name: 'Bloxy_News', enabled: true },
    { url: 'https://nitter.net/Roblox/rss', name: 'Roblox', enabled: true },
    { url: 'https://nitter.net/MrNotifier/rss', name: 'MrNotifier', enabled: true },
    { url: 'https://nitter.net/Rolimons/rss', name: 'Rolimons', enabled: true },
    { url: 'https://gamerjournalist.com/roblox/feed/', name: 'GamerJournalist_Roblox', enabled: true },
];
//# sourceMappingURL=types.js.map