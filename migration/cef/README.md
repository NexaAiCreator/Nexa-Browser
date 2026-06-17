# CEF Migration Scaffold

This folder defines the target structure for migrating Nexa Browser from the current Electron prototype to a `CEF + native shell` architecture.

The goal is not to port code directly from this folder today. The goal is to freeze the intended module boundaries early so Electron-specific assumptions do not spread further.

## Planned Layers

- `native-shell/`
  Native desktop host, windowing, tab ownership, downloads, profiles, updater integration.
- `browser-services/`
  Browser domain services that should survive the Electron-to-CEF migration with minimal API changes.
- `internal-pages/`
  React/TypeScript or other web-based internal pages such as Settings, History, Downloads, Start Page, and Nexa AI.
- `contracts/`
  Stable IPC and service contracts between the shell and internal product surfaces.

## Migration Rule

Anything that is purely browser product logic should be moved toward these boundary definitions, not deeper into Electron-specific APIs.
