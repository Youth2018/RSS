# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-06-09

### New Features

- **Official QQ Adapter Markdown Support**: Added native Markdown message sending compatibility for the official Koishi QQ adapter (`@koishijs/plugin-adapter-qq`). The plugin now uses a three-tier fallback strategy to send Markdown messages:
  1. **Priority**: `bot.internal.sendMessage()` / `session.qq.sendMessage()` - Directly constructs `msg_type: 2` + `markdown.content` request body, bypassing the `escapeMarkdown()` call in the official adapter's message encoder, ensuring all Markdown syntax renders correctly
  2. **Fallback**: `h('qq:rawmarkdown')` element - Supported by the `koishi-plugin-adapter-qq-crack` adapter
  3. **Last resort**: Plain text message sending - Ensures message delivery even when Markdown is unavailable

- **Markdown Command Reply Enhancement**: Command replies (rss status, rss sources, rss group list) now use `session.qq.sendMessage()` for native Markdown rendering, with the same three-tier fallback strategy

### Bug Fixes

- **UNIQUE constraint failed: rss_source.url**: Fixed a critical bug where adding a new RSS source with a duplicate URL in the plugin configuration page caused the entire plugin to crash during initialization. The fix includes:
  - `addSource()` now checks for URL uniqueness before database insertion and throws a user-friendly error message
  - `syncSourcesFromConfig()` now detects URL conflicts before attempting to create new sources, with dynamic URL mapping updates to prevent duplicate entries within the same sync cycle
  - Database `create` operations are wrapped in try-catch blocks to ensure plugin initialization continues even if unexpected constraint violations occur

### Performance Optimizations

- **Dynamic URL Mapping**: The `syncSourcesFromConfig` function now dynamically updates its URL mapping after each successful source creation, preventing redundant database queries and ensuring O(1) conflict detection for subsequent sources in the same sync cycle

### API Changes

- **`addSource()` Error Handling**: The `addSource()` function now throws a descriptive error (`RSS?URL???: <url>(???: <name>)`) when attempting to add a source with a duplicate URL, instead of letting the database constraint error propagate
- **`addSource()` ID Collision**: The `addSource()` function now appends a timestamp suffix to the generated ID if it conflicts with an existing source ID

### Compatibility

- **Official QQ Adapter**: Fully compatible with `@koishijs/plugin-adapter-qq` (v4.12.0+). Markdown messages are sent via `bot.internal.sendMessage()` API, which directly calls the QQ Bot HTTP API endpoint (`POST /v2/groups/{channel_id}/messages`)
- **Crack QQ Adapter**: Backward compatible with `koishi-plugin-adapter-qq-crack`. The `qq:rawmarkdown` element is used as a fallback when `internal.sendMessage` is unavailable
- **Koishi Framework**: Requires Koishi v4.0.0+ (unchanged)
- **Database**: No schema changes; existing databases are fully compatible

### Known Issues

- Nitter RSS sources (nitter.net) may be inaccessible in certain network environments. Users in affected regions should use alternative RSS sources
- The `@shangxueink/qq-markdown-button` plugin is not required for Markdown sending, but can coexist without conflicts
- When using the official QQ adapter, `session.qq` is only available in group message sessions; private message sessions may fall back to the `qq:rawmarkdown` or plain text strategies

---

## [1.0.3] - 2026-06-09

### Bug Fixes

- Fixed Markdown image format: Changed `![?? #400px](url)` to standard `![img #400px #300px](url)` format for proper QQ client rendering
- Fixed Markdown message escaping: Replaced `h('markdown', {}, [h.text(md)])` with `h('qq:rawmarkdown', { content: md })` to prevent `escapeMarkdown()` from stripping Markdown syntax

## [1.0.2] - 2026-06-08

### New Features

- Added image hosting upload (img.scdn.io) with sliding window rate limiter (5s/4 requests, 60s/100 requests)
- Added exponential backoff retry for failed image uploads

### Bug Fixes

- Fixed image upload rate limiting (429 errors) by implementing a sliding window rate limiter

## [1.0.1] - 2026-06-08

### Bug Fixes

- Fixed QQ Markdown image syntax: Size parameters must be between alt text and URL, not appended to URL
- Fixed plugin homepage and issue report links in configuration page

## [1.0.0] - 2026-06-08

### New Features

- Initial release
- RSS feed subscription with configurable check intervals
- QQ Markdown format message rendering
- Source management (add/remove/enable/disable)
- Group management (add/remove target groups)
- Push title customization
- Nitter RSS source adaptation with tweet type detection (original/reply/retweet)
- Content truncation with code block wrapping
