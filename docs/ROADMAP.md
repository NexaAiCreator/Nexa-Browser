# Nexa Browser Roadmap

## Immediate

Goal: improve the current Electron prototype into a better product prototype.

1. Reduce browser chrome height and make controls feel native.
2. Add proper icons and keyboard shortcuts.
3. Persist browser data in SQLite instead of JSON.
4. Add session restore.
5. Add profile-aware storage layout.
6. Add a permission model for Nexa AI access.

## Next

Goal: make the architecture migration-ready.

1. Separate renderer UI state from browser state more cleanly.
2. Isolate internal pages from generic web UI assumptions.
3. Define browser services: tabs, history, bookmarks, downloads, settings, AI.
4. Introduce typed IPC boundaries.
5. Prepare a migration path away from Electron-specific primitives.

## Migration Target

Goal: move toward a serious Chromium-based browser shell.

Preferred target:

1. `CEF`
2. `C++` shell
3. `Qt` or custom native window UI
4. `React/TypeScript` for settings/history/downloads/AI pages
5. `SQLite` + secure OS credential storage

## AI Scope

Nexa AI should start with explicit, narrow permissions:

1. Current page summarization
2. Selected text summarization
3. Open tabs listing
4. History search
5. Bookmark search

It should not silently access all browser data by default.
