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
import { RSSItem, PluginSettings } from './types';
/**
 * 初始化RSS解析器，更新超时设置
 */
export declare function updateParserTimeout(timeout: number): void;
/**
 * 从指定URL抓取并解析RSS内容
 */
export declare function fetchRSSFeed(url: string, sourceId: string, sourceName: string, settings: PluginSettings): Promise<RSSItem[]>;
/**
 * 判断两个条目是否相同（用于去重）
 */
export declare function isDuplicateItem(a: RSSItem, b: RSSItem): boolean;
//# sourceMappingURL=rss-parser.d.ts.map