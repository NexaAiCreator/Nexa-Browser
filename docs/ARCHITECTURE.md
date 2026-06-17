# Nexa Browser Architecture

## Current State

This repository is an Electron-based prototype.

Current stack:

- `Electron` for desktop windowing and Chromium embedding
- `BrowserView` for web content tabs
- `HTML/CSS/JavaScript` for browser chrome and internal pages
- `JSON` persistence for bookmarks, history, downloads, and settings

This is suitable for rapid product exploration, but it is not the ideal final architecture for a serious browser product.

## Product Direction

Nexa Browser should be treated as a `Chromium-based browser`, not a generic desktop app.

The realistic long-term stack is:

- `Chromium` or `CEF` for rendering, networking, storage, and sandboxing
- `C++` for the browser shell and deep integration
- `React + TypeScript` or similar for internal product pages
- `SQLite` for local browser metadata
- `OS keychain / credential manager` for secrets
- Optional `Python FastAPI` or `Rust` service for Nexa AI features

## Recommended Phases

### Phase 1: Prototype

Goal: validate product UX and AI workflows cheaply.

Use:

- Electron
- Embedded Chromium via `BrowserView`
- HTML/CSS/JS or React for browser chrome
- Local JSON or SQLite storage

This repository is in this phase now.

### Phase 2: Serious Desktop Browser

Goal: move from prototype to a browser-grade desktop application.

Recommended stack:

- `CEF + C++ shell`
- `Qt` or a custom native shell for desktop UI
- Internal pages still allowed to use `React + TypeScript`
- `SQLite` for bookmarks/history/downloads/settings
- Native installer, updater, signing, and process management

This is the most realistic next architecture for Nexa Browser.

### Phase 3: Deep Chromium Product

Goal: full browser ownership and deeper engine integration.

Use:

- Chromium source fork
- Native Chromium UI layer or heavily customized browser shell
- Full extension strategy
- Profile sync, updater infrastructure, browser security hardening

This is significantly more expensive than Phase 2 and should not be the first implementation target.

## Architecture Layers

### 1. Browser Engine

Responsibilities:

- HTML/CSS rendering
- JavaScript execution
- DOM APIs
- Network stack
- Cookies, cache, storage
- Downloads
- DevTools
- Process sandboxing

Recommended foundation:

- `Chromium/Blink + V8`

### 2. Browser Shell

Responsibilities:

- Tabs
- Address bar
- Bookmarks
- Downloads
- History
- Settings
- Profiles
- Window management
- Internal browser pages

Current implementation:

- Electron main process in [src/main.js](C:/Nexa%20Broswer/src/main.js)
- Renderer chrome in [src/renderer/index.html](C:/Nexa%20Broswer/src/renderer/index.html)

### 3. Local Data Layer

Responsibilities:

- Bookmarks
- History
- Downloads
- Session restore
- Preferences
- AI permissions

Recommended evolution:

- Replace ad hoc JSON persistence with `SQLite`
- Keep file storage for larger artifacts only
- Move secrets to OS-managed secure storage

### 4. AI Layer

Responsibilities:

- Summarize current page
- Search across tabs/history/bookmarks
- Browser commands
- User memory and preferences
- Voice features later

Recommended service split:

- Browser UI sends explicit, permissioned requests
- Local AI service handles model inference
- Optional cloud sync for user-approved memory

### 5. Cloud Services

Optional, not required for page loading.

Responsibilities:

- Account login
- Bookmark/settings sync
- AI chat history sync
- Update metadata
- Crash reporting
- Extension/plugin distribution later

## Why Electron Is Not Final

Electron is still acceptable for:

- validating UI
- testing AI workflows
- iterating on browser product ideas

Electron is not ideal long term for:

- native browser performance
- deeper Chromium customization
- process-level control
- browser-grade packaging and updates
- serious security architecture

## Recommended Near-Term Work In This Repo

This repository should focus on product validation features, not pretending to be a full engine fork.

Near-term priorities:

1. Tighten the browser chrome to feel more native.
2. Replace JSON persistence with SQLite.
3. Add session restore and multi-profile support.
4. Add a real Nexa AI sidebar contract with explicit permissions.
5. Add packaging, signing, and update planning for Windows.

## Non-Goals For This Repo Right Now

These should not be attempted inside the current Electron codebase as if they were small tasks:

- building a custom rendering engine
- replacing Blink/V8
- implementing browser sandboxing from scratch
- shipping a true Chromium fork from this repository alone
- creating a production-grade extension store immediately

## Practical Recommendation

If Nexa Browser remains exploratory, keep iterating in Electron.

If Nexa Browser becomes a serious product, plan a migration to:

- `CEF + C++ shell`
- `React/TypeScript` for internal pages
- `SQLite` local storage
- optional local `FastAPI` or `Rust` AI service
