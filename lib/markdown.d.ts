/**
 * Markdown消息转换模块
 * 将RSS内容转换为符合QQ官方机器人要求的Markdown格式
 *
 * QQ Markdown支持规范（参考：https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html）：
 * - 支持 # ## ### 标题
 * - 支持 **粗体** __下划线加粗__ _斜体_ *斜体* ***加粗斜体*** ~~删除线~~
 * - 支持 > 块引用
 * - 支持 [文字](链接) 和 <URL> 自动链接
 * - 支持 ![text #宽px #高px](url) 图片语法（注意：尺寸参数在alt和URL之间）
 * - 支持 --- 或 *** 水平分割线
 * - 支持 ```代码块``` 语法
 * - 支持 1. 有序列表 和 - 无序列表
 * - 换行使用 \n（QQ不支持\r换行）
 * - 不支持HTML标签
 *
 * 消息格式规范：
 * **新闻第一句话**
 * > 作者时间等额外信息
 * - 新闻主要内容
 * ![img #图片高参数px #图片宽参数px](上传图床后的链接)
 * - 新闻补充内容（如存在）
 */
import { RSSItem } from './types';
/**
 * 将RSS条目转换为QQ Markdown消息
 * 格式规范：
 * **标题（第一句话）**
 * > 来源：xxx | 作者：xxx | 时间：xxx
 * - 主要内容段落1
 * - 主要内容段落2
 * ![img #400px #300px](图片链接)
 * - 补充内容
 */
export declare function convertToMarkdown(item: RSSItem, pushTitle?: string): string;
/**
 * 将多个RSS条目转换为一条汇总Markdown消息
 */
export declare function convertBatchToMarkdown(items: RSSItem[], pushTitle?: string): string;
/**
 * 将源列表转换为Markdown格式（用于命令回复）
 */
export declare function formatSourceList(sources: {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
}[]): string;
/**
 * 将群列表转换为Markdown格式（用于命令回复）
 */
export declare function formatGroupList(groups: {
    groupId: string;
    enabled: boolean;
    createdAt: number;
}[]): string;
/**
 * 将状态信息转换为Markdown格式（用于命令回复）
 */
export declare function formatStatus(status: {
    running: boolean;
    checkInterval: number;
    sourceCount: number;
    groupCount: number;
    totalSent: number;
    lastCheckTime: number;
    nextCheckTime: number;
    lastError: string;
}): string;
//# sourceMappingURL=markdown.d.ts.map