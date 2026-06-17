# Browser Services Boundaries

These services represent browser product logic that should be portable across Electron and CEF.

## Services

### `BookmarkService`

Responsibilities:

- add/remove/list bookmarks
- enforce bookmark limits
- expose bookmark search

### `HistoryService`

Responsibilities:

- record navigations
- clear history
- query history for internal pages and AI

### `DownloadService`

Responsibilities:

- track download lifecycle
- expose download metadata
- open containing folder

### `SettingsService`

Responsibilities:

- homepage
- search engine
- start page theme
- feature flags

### `AiPermissionService`

Responsibilities:

- store denied-by-default scopes
- check access before AI actions
- log permission changes

### `AiActionService`

Responsibilities:

- summarize current page
- summarize selection
- search browser memory
- list open tabs

## Current Storage Mapping

- [src/storage/database.js](C:/Nexa%20Broswer/src/storage/database.js)

This is the first step toward a portable service layer because persistence is no longer ad hoc JSON in the main process.
