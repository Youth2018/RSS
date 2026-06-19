# koishi-plugin-rss-subscribe

自用RSS订阅 - Koishi v4 RSS订阅推送插件

## 功能特性

- 定时抓取RSS源并推送新内容到指定QQ群聊
- 支持QQ官方机器人Markdown格式消息发送
- 专门适配Nitter/Twitter RSS源格式（Roblox_RTC / Bloxy_News / Roblox / MrNotifier / Rolimons 各源专属排版）
- 测试推送：一键抓取各源最近3条内容推送到测试群，便于验证渲染效果
- 图片自动上传到图床（img.scdn.io）
- 完整的源管理：添加、删除、启用、停用RSS源
- 群组管理：支持批量添加/移除推送目标群
- 关键词过滤：支持白名单/黑名单两种模式，仅推送/过滤命中关键词的内容
- 免打扰时段：可配置时间段内暂停推送（支持跨午夜），结束后自动恢复
- 内容去重：仅推送未发送过的新内容
- 失败重试：指数退避重试机制
- 数据持久化：基于Koishi数据库存储

## 安装

在Koishi控制台的插件市场中搜索 `rss-subscribe` 并安装。

或手动安装：

```bash
npm install koishi-plugin-rss-subscribe
```

## 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| autoStart | boolean | true | 是否自动启动定时推送 |
| pushTitle | string | Roblox RSS 最新推送 | 推送消息主标题 |
| enableImageUpload | boolean | true | 是否上传图片到图床 |
| checkInterval | number | 10 | 检查间隔（分钟，1-1440） |
| requestTimeout | number | 15000 | HTTP请求超时（毫秒） |
| maxRetries | number | 3 | 失败重试次数 |
| maxItemsPerPush | number | 5 | 每次推送最大条数 |
| sources | dict | - | RSS源列表（控制台配置） |
| groupIds | string[] | [] | 推送目标群ID列表 |
| filterMode | off/include/exclude | off | 关键词过滤模式 |
| filterKeywords | string[] | [] | 过滤关键词列表（留空则由指令管理） |
| quietStart | number | -1 | 免打扰开始时段（0-23，-1禁用） |
| quietEnd | number | -1 | 免打扰结束时段（0-23，-1禁用） |
| testPush | boolean | false | 🚀 测试推送开关：开启并保存后立即抓取各源最近3条推送到测试群（验证后请关闭） |
| testGroupIds | string[] | [] | 测试推送目标群ID（留空则使用 groupIds） |

## 命令

| 命令 | 说明 |
|------|------|
| `rss 状态` | 查看运行状态 |
| `rss 启动` | 启动定时推送 |
| `rss 停止` | 停止定时推送 |
| `rss 间隔 <分钟>` | 设置检查间隔 |
| `rss 检查` | 手动触发检查 |
| `rss 测试推送` | 测试推送：抓取各源最近3条推送到测试群 |
| `rss 源列表` | 查看RSS源列表 |
| `rss 启用源 <ID>` | 启用指定源 |
| `rss 停用源 <ID>` | 停用指定源 |
| `rss 添加源 <名称> <URL>` | 添加自定义源 |
| `rss 删除源 <ID>` | 删除指定源 |
| `rss 群列表` | 查看已绑定群 |
| `rss 添加群 <群ID>` | 添加推送群 |
| `rss 移除群 <群ID>` | 移除推送群 |
| `rss 过滤` | 查看关键词过滤与免打扰设置 |
| `rss filter mode <off\|include\|exclude>` | 设置过滤模式 |
| `rss 添加关键词 <关键词>` | 添加过滤关键词（逗号/空格分隔） |
| `rss 移除关键词 <关键词>` | 移除过滤关键词 |
| `rss 清空关键词` | 清空所有过滤关键词 |
| `rss 免打扰 <开始> [结束]` | 设置免打扰时段（关闭：`rss 免打扰 off`） |

## 依赖

- Koishi v4
- @koishijs/plugin-database（数据库服务）
- QQ官方适配器（用于群消息推送）

## License

MIT
