"use strict";
/**
 * RSS解析模块
 * 负责从RSS源抓取并解析内容
 * 专门适配Nitter RSS源格式（基于rtcrss/bloxyrss实际数据分析）
 *
 * Nitter RSS格式特点：
 * - 标题格式：
 *   - 原创: "内容文本"
 *   - 回复: "R to @用户名: 回复内容"
 *   - 转推: "RT by @转发者: 原作者内容"
 * - description: CDATA包裹的HTML，包含<p>文本、<a>链接、<img>图片、<blockquote>引用
 * - dc:creator: "@用户名"格式
 * - guid: 推文ID
 * - link: nitter.net/用户名/status/ID#m
 *
 * 内容结构解析：
 * - 标题通常是正文的第一段（第一句话）
 * - description包含完整HTML内容，包括图片和引用
 * - <blockquote>包含引用的推文
 * - <img>标签包含图片URL（nitter代理格式）
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateParserTimeout = updateParserTimeout;
exports.fetchRSSFeed = fetchRSSFeed;
exports.isDuplicateItem = isDuplicateItem;
const rss_parser_1 = __importDefault(require("rss-parser"));
const parser = new rss_parser_1.default({
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Koishi-RSS-Plugin/1.0',
    },
    customFields: {
        item: [
            ['content:encoded', 'contentEncoded'],
            ['dc:creator', 'dcCreator'],
        ],
    },
});
/**
 * 初始化RSS解析器，更新超时设置
 */
function updateParserTimeout(timeout) {
    ;
    parser.timeout = timeout;
}
/**
 * 判断URL是否为Nitter RSS源
 */
function isNitterUrl(url) {
    return url.includes('nitter.net') || url.includes('nitter.');
}
/**
 * 从指定URL抓取并解析RSS内容
 */
async function fetchRSSFeed(url, sourceId, sourceName, settings) {
    let lastError = null;
    for (let attempt = 1; attempt <= settings.maxRetries; attempt++) {
        try {
            updateParserTimeout(settings.requestTimeout);
            const feed = await parser.parseURL(url);
            if (!feed || !feed.items || feed.items.length === 0) {
                return [];
            }
            const nitterMode = isNitterUrl(url);
            const items = feed.items.map((item) => {
                const tweetType = detectTweetType(item.title || '', nitterMode);
                return {
                    guid: item.guid || item.link || item.title || `unknown-${Date.now()}-${Math.random()}`,
                    title: extractTitle(item, nitterMode, tweetType),
                    content: extractContent(item, nitterMode, tweetType),
                    link: normalizeLink(item.link, url),
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    author: extractAuthor(item, nitterMode, tweetType),
                    sourceId,
                    sourceName,
                    imageUrls: extractImageUrls(item, nitterMode),
                    tweetType,
                };
            });
            return items;
        }
        catch (error) {
            lastError = error;
            if (attempt < settings.maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`抓取RSS源 [${sourceName}] 失败 (已重试${settings.maxRetries}次): ${lastError?.message}`);
}
/**
 * 检测推文类型
 */
function detectTweetType(title, nitterMode) {
    if (!nitterMode)
        return 'original';
    if (title.startsWith('RT by '))
        return 'retweet';
    if (title.startsWith('R to '))
        return 'reply';
    return 'original';
}
/**
 * 提取标题
 * 标题是正文的第一句话，直接使用清理后的标题文本
 */
function extractTitle(item, nitterMode, tweetType) {
    let title = item.title || '无标题';
    if (nitterMode) {
        if (tweetType === 'reply') {
            title = title.replace(/^R to @[^:]+:\s*/, '');
        }
        else if (tweetType === 'retweet') {
            title = title.replace(/^RT by @[^:]+:\s*/, '');
        }
        title = decodeEntities(title);
    }
    return title.trim() || '无标题';
}
/**
 * 从RSS条目中提取文本内容
 * 针对Nitter源做专门优化
 */
function extractContent(item, nitterMode, tweetType) {
    if (nitterMode) {
        return extractNitterContent(item, tweetType);
    }
    // 通用RSS源
    const encoded = item['content:encoded']
        || item.contentEncoded;
    if (encoded) {
        return stripHtmlAndExtractText(encoded);
    }
    if (item.content) {
        return stripHtmlAndExtractText(item.content);
    }
    if (item.contentSnippet) {
        return item.contentSnippet;
    }
    return '';
}
/**
 * 专门提取Nitter RSS源的内容
 * 从description的HTML中提取纯文本，保留roblox.com等关键链接
 * 分离正文和引用内容
 */
function extractNitterContent(item, tweetType) {
    if (item.content) {
        let text = extractTextFromNitterHtml(item.content);
        text = decodeEntities(text);
        return text.trim();
    }
    if (item.contentSnippet) {
        let text = item.contentSnippet;
        text = decodeEntities(text);
        return text.trim();
    }
    return item.title || '';
}
/**
 * 从Nitter HTML内容中提取纯文本
 * 保留roblox.com等关键链接，移除nitter代理链接
 * 处理<blockquote>引用推文
 */
function extractTextFromNitterHtml(html) {
    let text = html
        // 处理<blockquote>引用内容：提取引用作者和文本
        .replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
        const author = content.match(/<b>([^<]+)<\/b>/)?.[1] || '';
        const quoteText = content
            .replace(/<b>[^<]*<\/b>/g, '')
            .replace(/<footer>[\s\S]*?<\/footer>/g, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/https?:\/\/nitter\.net\/\S+/g, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
        return quoteText ? `\n[引用 ${author}]\n${quoteText}` : '';
    })
        // 将<a>标签中的roblox/devforum链接转为纯URL
        .replace(/<a\s+href="(https?:\/\/(?:www\.)?(?:roblox\.com|devforum\.roblox\.com|bloxy\.news|create\.roblox\.com)\/[^"]*)"[^>]*>([^<]*)<\/a>/gi, (_, url, linkText) => {
        if (linkText.includes('…') || linkText.includes('...')) {
            return url;
        }
        return url;
    })
        // 移除nitter.net链接
        .replace(/<a\s+href="https?:\/\/nitter\.net\/[^"]*"[^>]*>([^<]*)<\/a>/gi, '')
        // 移除hashtag链接，保留标签文本
        .replace(/<a\s+href="https?:\/\/nitter\.net\/search[^"]*"[^>]*>([^<]*)<\/a>/gi, '$1')
        // 移除其他<a>标签（非roblox链接）
        .replace(/<a\s+href="[^"]*"[^>]*>([^<]*)<\/a>/gi, '$1')
        // <br> 转换为换行
        .replace(/<br\s*\/?>/gi, '\n')
        // </p> 转换为换行
        .replace(/<\/p>/gi, '\n')
        // <hr/> 转换为换行分隔
        .replace(/<hr\s*\/?>/gi, '\n')
        // 移除所有剩余HTML标签（包括<img>）
        .replace(/<[^>]*>/g, '')
        // 移除pic.twitter.com链接
        .replace(/pic\.twitter\.com\/\S+/g, '')
        // 移除nitter.net图片代理URL
        .replace(/https?:\/\/nitter\.net\/pic\/\S+/g, '')
        // 移除twitter/x.com推文链接
        .replace(/https?:\/\/(?:twitter|x)\.com\/\S+/g, '')
        // 移除Video标记
        .replace(/\nVideo\n/g, '\n')
        .replace(/^Video$/gm, '')
        // 移除GIF标记
        .replace(/^GIF$/gm, '')
        // 合并多余换行
        .replace(/\n{3,}/g, '\n\n')
        // 合并多余空白（保留换行）
        .replace(/[^\S\n]+/g, ' ')
        .trim();
    return text;
}
/**
 * 从RSS条目中提取图片URL
 * Nitter RSS的图片在description的<img>标签中
 */
function extractImageUrls(item, nitterMode) {
    const urls = [];
    const html = item.content || item.description || '';
    if (!html)
        return urls;
    // 匹配<img src="..."> 标签
    const imgRegex = /<img\s+src="([^"]+)"/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        let imgUrl = match[1];
        if (nitterMode) {
            // /pic/media%2Fxxx → https://pbs.twimg.com/media/xxx
            const mediaMatch = imgUrl.match(/nitter\.net\/pic\/media%2F(.+\.(?:jpg|png|webp|gif))/i)
                || imgUrl.match(/nitter\.net\/pic\/media\/(.+\.(?:jpg|png|webp|gif))/i);
            if (mediaMatch) {
                imgUrl = `https://pbs.twimg.com/media/${decodeURIComponent(mediaMatch[1])}`;
            }
            // /pic/card_img%2Fxxx → https://pbs.twimg.com/card_img/xxx
            const cardMatch = imgUrl.match(/nitter\.net\/pic\/card_img%2F(.+)/i)
                || imgUrl.match(/nitter\.net\/pic\/card_img\/(.+)/i);
            if (cardMatch) {
                imgUrl = `https://pbs.twimg.com/card_img/${decodeURIComponent(cardMatch[1])}`;
            }
            // /pic/amplify_video_thumb%2Fxxx → 视频缩略图
            const videoMatch = imgUrl.match(/nitter\.net\/pic\/amplify_video_thumb%2F(.+\.(?:jpg|png|webp))/i)
                || imgUrl.match(/nitter\.net\/pic\/amplify_video_thumb\/(.+\.(?:jpg|png|webp))/i);
            if (videoMatch) {
                imgUrl = `https://pbs.twimg.com/amplify_video_thumb/${decodeURIComponent(videoMatch[1])}`;
            }
            // /pic/ext_tw_video_thumb%2Fxxx → 外部视频缩略图
            const extVideoMatch = imgUrl.match(/nitter\.net\/pic\/ext_tw_video_thumb%2F(.+\.(?:jpg|png|webp))/i)
                || imgUrl.match(/nitter\.net\/pic\/ext_tw_video_thumb\/(.+\.(?:jpg|png|webp))/i);
            if (extVideoMatch) {
                imgUrl = `https://pbs.twimg.com/ext_tw_video_thumb/${decodeURIComponent(extVideoMatch[1])}`;
            }
            // /pic/https%3A%2F%2Fpbs.twimg.com%2F... → 直接解码
            const directMatch = imgUrl.match(/nitter\.net\/pic\/(https?.+)/i);
            if (directMatch && !mediaMatch && !cardMatch && !videoMatch && !extVideoMatch) {
                imgUrl = decodeURIComponent(directMatch[1]);
            }
        }
        // 过滤掉非图片URL和过小的占位图
        if (imgUrl && !imgUrl.includes('profile_images') && !imgUrl.includes('emoji')) {
            urls.push(imgUrl);
        }
    }
    return urls;
}
/**
 * 规范化链接
 * Nitter链接转换为x.com链接
 */
function normalizeLink(link, sourceUrl) {
    if (!link)
        return '#';
    if (link.includes('nitter.net')) {
        link = link.replace(/#m$/, '');
        return link.replace(/nitter\.net\/([^/]+)\/status\/(\d+)/, 'x.com/$1/status/$2');
    }
    return link;
}
/**
 * 提取作者信息
 */
function extractAuthor(item, nitterMode, tweetType) {
    if (nitterMode) {
        const creator = item.creator || item.dcCreator;
        if (creator) {
            return creator.replace(/^@/, '');
        }
    }
    return item.creator || item.author;
}
/**
 * 移除HTML标签，保留纯文本（通用版本）
 */
function stripHtmlAndExtractText(html) {
    return decodeEntities(html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim());
}
/**
 * 解码HTML实体
 */
function decodeEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8211;/g, '-')
        .replace(/&#8212;/g, '--')
        .replace(/&#8230;/g, '...')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
        .replace(/&[a-zA-Z]+;/g, '');
}
/**
 * 判断两个条目是否相同（用于去重）
 */
function isDuplicateItem(a, b) {
    return a.guid === b.guid;
}
//# sourceMappingURL=rss-parser.js.map