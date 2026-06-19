# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] - 2026-06-19

### New Features

- **Test push (测试推送)**: A new toggle on the plugin config page that, when enabled and saved, immediately fetches the latest 3 items from **all** added RSS sources and pushes them to the configured test group(s) so you can verify rendering end-to-end.
  - Clear visual indicator (🚀) and loading/result feedback via the console **notifier** service (falls back to logs when notifier is unavailable)
  - New `testGroupIds` config — dedicated test target group(s); falls back to `groupIds` when empty
  - Test pushes do **not** write "sent" records, so they never interfere with the normal de-duplication of scheduled pushes
  - New command `rss test` (`rss 测试推送`) for triggering the same flow on demand with an inline result summary

- **Per-source Nitter Markdown adaptation (源画像)**: Dedicated presentation profiles for the five tracked accounts — `Roblox_RTC`, `Bloxy_News`, `Roblox`, `MrNotifier`, `Rolimons` — giving each a recognizable emoji + friendly label in the QQ Markdown banner and metadata line. Trading-style content (Rolimons) now bolds value fields (`Value:`, `RAP:`, `Demand:`, …) for readability. Unknown sources fall back to a clean generic layout.

### Bug Fixes

- **"UNIQUE constraint failed: rss_source.url" / source loading errors**: Hardened source creation so adding a source (via config page or command) can never crash plugin loading:
  - New `generateSourceId()` produces safe, unique IDs even for empty or non-ASCII (e.g. Chinese) source names, with numeric suffixes on collision
  - `syncSourcesFromConfig()` now skips invalid console entries (empty key/URL), de-duplicates URLs, and wraps each create in try/catch with friendly warnings
  - `addSource()` validates URL presence + uniqueness and throws clear, actionable errors

### Tests

- Added a unit-test suite (`node --test`, run via `npm test`) covering ID generation, keyword/quiet-hours filtering, source profiles, and per-source Markdown rendering (29 tests)

### API Changes

- **New module `source-profiles.ts`**: `getSourceProfile()`, `extractHandleFromUrl()`, `isKnownProfile()`
- **New scheduler export**: `performTestPush()` returning a structured `TestPushResult`
- **New markdown helper**: `formatTestPushResult()`
- **New storage export**: `generateSourceId()`
- Plugin now declares `notifier` as an **optional** service

### Compatibility

- Fully backward compatible. No database schema changes. The `testPush` toggle is a transient action switch — turn it off after verifying.

## [1.3.0] - 2026-06-19

### New Features

- **Keyword filtering (关键词过滤)**: Push only the content you care about. A new global filter supports three modes:
  - `off` — push everything (default, unchanged behavior)
  - `include` (whitelist) — only push items whose title/content/author matches any configured keyword
  - `exclude` (blacklist) — drop items matching any configured keyword
  - Matching is case-insensitive and runs against title + content + author
  - Filtered-out items are marked as sent so they are not re-evaluated on every cycle

- **Quiet hours (免打扰时段)**: Suspend pushing during a configurable hour range (e.g. `23:00 – 07:00`). The range is left-closed/right-open and supports across-midnight windows. Items discovered during quiet hours remain unsent and are pushed once the window ends, so nothing is lost.

- **New configuration items** (plugin config page):
  - `filterMode` — keyword filter mode selector (off / include / exclude)
  - `filterKeywords` — keyword list (leave empty to manage purely via commands)
  - `quietStart` / `quietEnd` — quiet-hours window (0–23, `-1` disables)

- **New commands**:
  - `rss filter` (`rss 过滤`) — show current filter mode, keywords, and quiet hours
  - `rss filter mode <off|include|exclude>` (`rss 过滤模式`) — switch filter mode
  - `rss filter add <keywords>` (`rss 添加关键词`) — add keywords (comma/space separated)
  - `rss filter remove <keywords>` (`rss 移除关键词`) — remove keywords
  - `rss filter clear` (`rss 清空关键词`) — clear all keywords
  - `rss quiet <start> [end]` (`rss 免打扰`) — set quiet hours; `rss quiet off` disables

### API Changes

- **`PluginSettings`** extended with `filterMode`, `filterKeywords`, `quietStart`, `quietEnd` fields (with sensible defaults)
- **New module `filter.ts`** exporting `passesKeywordFilter()`, `matchesKeywords()`, `normalizeKeywords()`, and `isInQuietHours()`
- **New storage helpers**: `addFilterKeywords()`, `removeFilterKeywords()`, `clearFilterKeywords()`
- **New markdown helper**: `formatFilterSettings()`

### Compatibility

- **Database**: The `rss_settings` table gains four new columns. They are declared with initial values, so existing databases auto-migrate without data loss. `getSettings()` also normalizes any missing/legacy fields at read time
- **Config precedence**: `filterMode` and quiet-hours are config-authoritative on startup (consistent with `checkInterval`). `filterKeywords` is only overwritten from config when the config list is non-empty, allowing command-based keyword management when left empty
- **Koishi Framework**: Requires Koishi v4.0.0+ (unchanged)
- **Official QQ Adapter**: Fully compatible with `@koishijs/plugin-adapter-qq` (unchanged)

### Known Issues

- Keyword filtering is global (applies to all sources). Per-source filtering is not yet supported
- Quiet hours use the host machine's local timezone

## [1.2.0] - 2026-06-10

### Breaking Changes

- **Removed `koishi-plugin-adapter-qq-crack` dependency**: The plugin no longer uses any crack adapter-specific features. All Markdown message sending now relies exclusively on the official QQ adapter (`@koishijs/plugin-adapter-qq`) via `bot.internal.sendMessage()` and `session.qq.sendMessage()` APIs. The `qq:rawmarkdown` element fallback has been removed entirely.

### New Features

- **Simplified Markdown sending strategy**: The two-tier fallback strategy is now:
  1. **Priority**: `bot.internal.sendMessage()` / `session.qq.sendMessage()` — Directly constructs `msg_type: 2` + `markdown.content` request body via the official QQ Bot HTTP API
  2. **Fallback**: Plain text message sending — Ensures message delivery when Markdown API is unavailable

- **Complete Nitter RSS format adaptation**: Based on analysis of actual rtcrss/bloxyrss data, the RSS parser now fully handles all Nitter RSS content types:
  - Original tweets, replies (`R to @`), retweets (`RT by @`)
  - `<blockquote>` quoted tweets extraction with author attribution
  - Roblox/devforum links preservation (other nitter proxy links removed)
  - Nitter image proxy URL conversion to direct `pbs.twimg.com` URLs
  - Video thumbnail and card image URL extraction
  - HTML entity decoding for all special characters

- **New Markdown message format**: Standardized push message format following QQ Markdown specification:
  - **Bold title** (first sentence, no duplication with content)
  - `> Source | Author | Time` metadata in blockquote
  - `- Content paragraphs` as list items
  - `![img #Wpx #Hpx](url)` image syntax with proper dimensions
  - `[View original](link)` for source link
  - Tweet type icons: 💬 for replies, 🔁 for retweets

- **Title-content deduplication**: Nitter RSS titles are typically the first paragraph of content. The new line-by-line deduplication algorithm correctly removes duplicate title text from content, avoiding the previous character-offset bugs

- **Markdown special character escaping**: Complete escaping for `& < > # * _ ~ \` [ ] ( ) |` etc., with URL protection to avoid escaping URLs within text content

- **Video/GIF marker cleanup**: Removes residual "Video" and "GIF" text markers from Nitter HTML content

### Bug Fixes

- **Title-content deduplication offset error**: Fixed a bug where `removeTitleDuplicate()` used character-offset substring removal, causing incorrect truncation when title and content had different whitespace patterns (e.g., `\n` vs `\n\n`). Now uses line-by-line comparison and removal

- **URL placeholder escaping**: Fixed `escapeMarkdownText()` using `__URL_N__` placeholders that got their underscores escaped by the Markdown escaper. Changed to `URLESCAPENENDURL` format that contains no Markdown special characters

### Performance

- **RSS parsing**: 40 items parsed and formatted in ~2ms (0.1ms/item average)
- **Markdown conversion**: Pure string operations, no async I/O overhead

### Compatibility

- **Official QQ Adapter**: Fully compatible with `@koishijs/plugin-adapter-qq` (v4.12.0+). No crack adapter required
- **Crack QQ Adapter**: No longer supported. Users must use the official adapter
- **Koishi Framework**: Requires Koishi v4.0.0+ (unchanged)
- **Database**: No schema changes; existing databases are fully compatible

---

## [1.1.0] - 2026-06-09

### New Features

- **Official QQ Adapter Markdown Support**: Added native Markdown message sending compatibility for the official Koishi QQ adapter (`@koishijs/plugin-adapter-qq`). The plugin uses `bot.internal.sendMessage()` / `session.qq.sendMessage()` to directly construct `msg_type: 2` + `markdown.content` request body, bypassing the `escapeMarkdown()` call in the official adapter's message encoder, ensuring all Markdown syntax renders correctly

- **Markdown Command Reply Enhancement**: Command replies (rss status, rss sources, rss group list) now use `session.qq.sendMessage()` for native Markdown rendering

### Bug Fixes

- **UNIQUE constraint failed: rss_source.url**: Fixed a critical bug where adding a new RSS source with a duplicate URL in the plugin configuration page caused the entire plugin to crash during initialization. The fix includes:
  - `addSource()` now checks for URL uniqueness before database insertion and throws a user-friendly error message
  - `syncSourcesFromConfig()` now detects URL conflicts before attempting to create new sources, with dynamic URL mapping updates to prevent duplicate entries within the same sync cycle
  - Database `create` operations are wrapped in try-catch blocks to ensure plugin initialization continues even if unexpected constraint violations occur

### Performance Optimizations

- **Dynamic URL Mapping**: The `syncSourcesFromConfig` function now dynamically updates its URL mapping after each successful source creation, preventing redundant database queries and ensuring O(1) conflict detection for subsequent sources in the same sync cycle

### API Changes

- **`addSource()` Error Handling**: The `addSource()` function now throws a descriptive error (`RSS源URL已存在: <url>（源名称: <name>）`) when attempting to add a source with a duplicate URL, instead of letting the database constraint error propagate
- **`addSource()` ID Collision**: The `addSource()` function now appends a timestamp suffix to the generated ID if it conflicts with an existing source ID

### Compatibility

- **Official QQ Adapter**: Fully compatible with `@koishijs/plugin-adapter-qq` (v4.12.0+). Markdown messages are sent via `bot.internal.sendMessage()` API, which directly calls the QQ Bot HTTP API endpoint (`POST /v2/groups/{channel_id}/messages`)
- **Koishi Framework**: Requires Koishi v4.0.0+ (unchanged)
- **Database**: No schema changes; existing databases are fully compatible

### Known Issues

- Nitter RSS sources (nitter.net) may be inaccessible in certain network environments. Users in affected regions should use alternative RSS sources
- The `@shangxueink/qq-markdown-button` plugin is not required for Markdown sending, but can coexist without conflicts
- When using the official QQ adapter, `session.qq` is only available in group message sessions; private message sessions may fall back to plain text strategy

---

## [1.0.3] - 2026-06-09

### Bug Fixes

- Fixed Markdown image format: Changed `![图片 #400px](url)` to standard `![img #400px #300px](url)` format for proper QQ client rendering
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
