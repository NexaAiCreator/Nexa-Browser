# IPC Contracts

These contracts should remain stable as the shell implementation changes.

## Browser State Contract

Producer:

- shell

Consumers:

- start page
- bookmarks panel
- history panel
- downloads panel
- settings page
- Nexa AI page/panel

Shape:

- active tab
- tab list
- bookmarks
- history
- downloads
- settings
- AI permissions
- AI activity

## AI Contract

Producer:

- shell permission layer + AI bridge

Actions:

- `summarize_page`
- `summarize_selection`
- `list_open_tabs`
- `search_memory`

Permission scopes:

- `current_page`
- `selected_text`
- `open_tabs`
- `browsing_history`
- `bookmarks`
- `downloads`

## Migration Constraint

Renderer code should consume stable contracts.

It should not know whether the shell implementation is:

- Electron IPC
- CEF message router
- custom native bridge
