# Nexa Browser <-> Nexa AI Service Contract

## Purpose

This contract defines the boundary between:

- `C:\Nexa Broswer`: browser shell, tabs, page extraction, permissions, local browser state
- `C:\Nexa Ai`: model serving, prompting, generation, structured AI responses

The browser must remain the policy enforcement point. The AI service should never be trusted to decide what browser data it is allowed to see.

## Ownership Split

### Browser owns

- tab lifecycle
- navigation
- page text extraction
- selected text extraction
- bookmark/history/download/profile storage
- AI permission checks
- safe truncation and redaction of page context
- user confirmation for sensitive actions

### AI service owns

- prompt construction
- model inference
- streaming text generation
- structured response formatting
- later: model-side evaluation, tools, ranking, rewrite quality

## Contract Principles

1. The browser sends only data already approved by the user.
2. The AI service receives prepared context, not direct database or tab access.
3. The transport must support both structured JSON responses and text streaming.
4. The contract must work locally first over `http://127.0.0.1:8000`.
5. The browser should be able to fall back to local non-AI behavior for simple actions.

## Current AI API

The local API in `C:\Nexa Ai` already exposes:

- `GET /health`
- `GET /ui-config`
- `POST /generate`
- `POST /chat`
- `POST /chat/stream`

That is enough for a prototype adapter layer, but not ideal as the long-term browser contract because it is too generic.

## Recommended Versioned Browser Contract

Add these endpoints in `C:\Nexa Ai`:

- `GET /v1/browser/capabilities`
- `POST /v1/browser/execute`
- `POST /v1/browser/stream`

The browser should call these endpoints instead of building raw prompt strings everywhere in Electron.

## Endpoint: `GET /v1/browser/capabilities`

Purpose: let the browser discover which actions and response modes the AI service supports.

Example response:

```json
{
  "version": "1.0",
  "assistant_name": "Nexa",
  "supports": {
    "execute": true,
    "stream": true,
    "json_mode": true
  },
  "actions": [
    "summarize_page",
    "summarize_selection",
    "answer_with_page_context",
    "answer_with_browser_context",
    "rewrite_selection"
  ],
  "limits": {
    "max_page_chars": 6000,
    "max_selection_chars": 2000,
    "max_memory_items": 20,
    "max_open_tabs": 25
  }
}
```

## Endpoint: `POST /v1/browser/execute`

Purpose: single structured request/response endpoint for non-streaming browser AI work.

### Request shape

```json
{
  "version": "1.0",
  "request_id": "6d7cf5d1-38d4-4d8f-a5a4-9f5280c9d9ce",
  "action": "summarize_page",
  "user_prompt": null,
  "context": {
    "page": {
      "url": "https://openai.com",
      "title": "OpenAI",
      "content": "Page text excerpt...",
      "selection": "",
      "content_truncated": true
    },
    "open_tabs": [],
    "memory": []
  },
  "permissions": {
    "current_page": true,
    "selected_text": false,
    "open_tabs": false,
    "browsing_history": false,
    "bookmarks": false,
    "downloads": false
  },
  "client": {
    "name": "nexa-browser",
    "version": "1.0.0",
    "platform": "win32"
  },
  "generation": {
    "temperature": 0.2,
    "max_new_tokens": 300
  }
}
```

### Response shape

```json
{
  "ok": true,
  "request_id": "6d7cf5d1-38d4-4d8f-a5a4-9f5280c9d9ce",
  "action": "summarize_page",
  "result": {
    "type": "summary",
    "text": "OpenAI is ...",
    "title": "OpenAI",
    "source": {
      "url": "https://openai.com"
    }
  },
  "warnings": [],
  "model": {
    "name": "models/Qwen3-4B-Instruct-2507",
    "adapter_dir": null
  }
}
```

### Error response

```json
{
  "ok": false,
  "request_id": "6d7cf5d1-38d4-4d8f-a5a4-9f5280c9d9ce",
  "error": {
    "code": "INVALID_CONTEXT",
    "message": "Page content is required for summarize_page."
  }
}
```

## Endpoint: `POST /v1/browser/stream`

Purpose: streaming variant for chat-style or long-form responses.

Use the same request body as `/v1/browser/execute`, but return a plain text stream or SSE later.

Short-term recommendation:

- return `text/plain; charset=utf-8`
- stream only the generated text
- keep request metadata in the initial HTTP request body

Long-term recommendation:

- upgrade to SSE with events such as `meta`, `delta`, `done`, `error`

## Action Definitions

### `summarize_page`

Required browser permission:

- `current_page`

Required context:

- `context.page.url`
- `context.page.title`
- `context.page.content`

Expected result:

```json
{
  "type": "summary",
  "text": "..."
}
```

### `summarize_selection`

Required browser permission:

- `selected_text`

Required context:

- `context.page.url`
- `context.page.title`
- `context.page.selection`

Expected result:

```json
{
  "type": "summary",
  "text": "..."
}
```

### `answer_with_page_context`

Required browser permission:

- `current_page`

Required context:

- page content
- `user_prompt`

Expected result:

```json
{
  "type": "answer",
  "text": "..."
}
```

### `answer_with_browser_context`

Required browser permissions:

- any combination of `current_page`, `selected_text`, `open_tabs`, `browsing_history`, `bookmarks`, `downloads`

Required context:

- `user_prompt`
- optional page/open-tab/memory payloads already filtered by the browser

Expected result:

```json
{
  "type": "answer",
  "text": "...",
  "used_context": {
    "page": true,
    "open_tabs": true,
    "memory_items": 4
  }
}
```

### `rewrite_selection`

Required browser permission:

- `selected_text`

Required context:

- selected text
- optional `user_prompt` such as "make this shorter"

Expected result:

```json
{
  "type": "rewrite",
  "text": "..."
}
```

## Browser-Side Context Rules

Before any request is sent to `C:\Nexa Ai`, `C:\Nexa Broswer` must:

1. check the requested action against the granted permissions
2. extract only the required data
3. truncate page text to a safe limit
4. omit denied scopes entirely
5. avoid sending passwords, secrets, or form field values by default

Recommended limits:

- page content: `6000` chars
- selection: `2000` chars
- open tabs: `25`
- memory items: `12`
- memory item text fields: title + url only unless explicitly needed later

## Memory and Browser Data

The AI service should not directly query browser history, bookmarks, downloads, or tab state.

Instead, the browser should:

1. fetch the relevant local data
2. filter it according to permissions
3. send a prepared subset in `context.memory` or `context.open_tabs`

Example memory payload:

```json
[
  {
    "type": "bookmark",
    "title": "OpenAI",
    "url": "https://openai.com"
  },
  {
    "type": "history",
    "title": "Electron docs",
    "url": "https://www.electronjs.org/docs/latest"
  }
]
```

This keeps the browser as the source of truth and prevents the AI service from becoming a privileged browser backend.

## Safety Rules

The browser must not send any request for:

- passwords
- auth tokens
- secret keys
- payment form completion
- autonomous submission of forms

The AI service may suggest text, summaries, or draft actions, but the browser must keep the user in control of sensitive operations.

## Mapping to Current Browser Repo

Current browser actions in `src/main.js`:

- `summarize_page`
- `summarize_selection`
- `list_open_tabs`
- `search_memory`

Recommended mapping:

- keep `list_open_tabs` and `search_memory` as browser-native data fetches
- add AI-powered actions that consume those results:
  - `answer_with_browser_context`
  - `summarize_page`
  - `summarize_selection`
  - `rewrite_selection`

That split is cleaner than asking the AI service to own raw browser state queries.

## Mapping to Current AI Repo

Short-term adapter in `C:\Nexa Ai`:

- implement `/v1/browser/execute`
- convert structured requests into internal chat messages
- call the existing `generate_reply(...)`
- return structured JSON

This means the AI repo does not need a new inference engine, only a browser-specific adapter layer on top of the current `/chat` capability.

## Immediate Prototype Path

Phase 1:

- browser calls `GET /health`
- browser calls `POST /chat` with a carefully built system prompt and JSON-only output instruction
- browser parses JSON

Phase 2:

- add `/v1/browser/execute`
- move prompt-building into `C:\Nexa Ai`
- keep Electron free of model-specific prompt formatting

Phase 3:

- add `/v1/browser/stream`
- support richer actions and typed results

## Example Prompt Adapter Behavior

Internal AI-service prompt construction for `summarize_page` should look like:

1. system instruction defining output schema
2. action name
3. allowed scopes
4. page title/url/text
5. explicit response format requirement

The browser should not generate complex model prompts inline in `src/main.js`.

## Recommendation

Use this contract shape:

- browser = policy, data access, UX, safety
- AI service = generation, formatting, model behavior

Do not let `C:\Nexa Broswer` become a second prompt-engineering repo, and do not let `C:\Nexa Ai` become a privileged browser-state owner.
