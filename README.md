# koishi-plugin-rss-subscribe

自用RSS订阅 - Koishi v4 RSS订阅推送插件

## 功能特性

- 定时抓取RSS源并推送新内容到指定QQ群聊
- 支持QQ官方机器人Markdown格式消息发送
- 专门适配Nitter/Twitter RSS源格式
- 图片自动上传到图床（img.scdn.io）
- 完整的源管理：添加、删除、启用、停用RSS源
- 群组管理：支持批量添加/移除推送目标群
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

## 命令

| 命令 | 说明 |
|------|------|
| `rss 状态` | 查看运行状态 |
| `rss 启动` | 启动定时推送 |
| `rss 停止` | 停止定时推送 |
| `rss 间隔 <分钟>` | 设置检查间隔 |
| `rss 检查` | 手动触发检查 |
| `rss 源列表` | 查看RSS源列表 |
| `rss 启用源 <ID>` | 启用指定源 |
| `rss 停用源 <ID>` | 停用指定源 |
| `rss 添加源 <名称> <URL>` | 添加自定义源 |
| `rss 删除源 <ID>` | 删除指定源 |
| `rss 群列表` | 查看已绑定群 |
| `rss 添加群 <群ID>` | 添加推送群 |
| `rss 移除群 <群ID>` | 移除推送群 |

## 依赖

- Koishi v4
- @koishijs/plugin-database（数据库服务）
- QQ官方适配器（用于群消息推送）

## License

MIT
