# Native Shell Boundaries

These modules should belong to the future native shell, not to internal browser pages.

## Owns

- window lifecycle
- tab creation and destruction
- web view embedding
- process management
- downloads
- permissions enforcement
- filesystem integration
- OS keychain integration
- updater integration
- crash reporting hooks

## Exposes

- `TabService`
- `NavigationService`
- `DownloadService`
- `PermissionService`
- `ProfileService`
- `AiBridgeService`

## Must Not Depend On

- page-specific DOM
- renderer-side component state
- React component trees

## Current Electron Mapping

- [src/main.js](C:/Nexa%20Broswer/src/main.js)

This file currently mixes shell ownership with product logic. The migration target is to split those concerns.
