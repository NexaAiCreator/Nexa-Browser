# Nexa IPC Contract Specification

## Overview

This document defines the inter-process communication (IPC) contract between:
- **Renderer** (browser UI in renderer process)
- **Main** (Electron main process)
- **Remote AI Service** (C:\Nexa Ai)

## Existing IPC Channels (Phase 1)

Documented in [migration/cef/contracts/ipc-contracts.md](../migration/cef/contracts/ipc-contracts.md)

Current scopes:
- Browser control (tabs, navigation)
- Bookmarks/History/Downloads
- AI permissions (read-only)
- AI streaming (read-only)

---

## New IPC Channels (Phase 2, 3, 4)

### Browser Action Executor

#### `browser:execute-action`
Execute a single DOM action in the current tab.

**Invocation:**
```javascript
// Renderer → Main
await ipcRenderer.invoke("browser:execute-action", {
  workflow_id: string,
  action_id: string,
  type: "click" | "fill" | "read" | "wait" | "scroll" | "navigate" | "screenshot",
  params: object,
  screenshot: boolean  // Capture page state after action
})
```

**Parameters by Action Type:**

**click:**
```javascript
{
  type: "click",
  selector: string,
  wait_for_nav: boolean,  // Wait for page load after click
  timeout: number  // ms, default 5000
}
```

**fill:**
```javascript
{
  type: "fill",
  fields: {
    [selector]: string,  // selector → value to fill
    ...
  },
  timeout: number
}
```

**read:**
```javascript
{
  type: "read",
  selector: string,  // optional, defaults to "body"
  return_type: "text" | "html" | "dom_tree" | "data",
  extract_all: boolean,  // Extract all matching elements
  timeout: number
}
```

**wait:**
```javascript
{
  type: "wait",
  selector: string,
  visible: boolean,  // Wait for visibility, not just presence
  timeout: number  // default 5000
}
```

**scroll:**
```javascript
{
  type: "scroll",
  direction: "up" | "down" | "left" | "right",
  amount: number,  // pixels
  target: string  // optional selector of scrollable element
}
```

**navigate:**
```javascript
{
  type: "navigate",
  url: string,
  wait_for: string,  // optional selector to wait for
  timeout: number
}
```

**screenshot:**
```javascript
{
  type: "screenshot",
  full_page: boolean,  // Capture entire page vs viewport
  format: "png" | "jpeg" | "webp"
}
```

**Response:**
```javascript
{
  workflow_id: string,
  action_id: string,
  success: boolean,
  status_code: number,  // 200, 404, 500, etc
  result: {
    // Content depends on action type
    data: any,
    html: string,  // For read actions
    screenshot: string,  // base64 data URL
    elements_found: number,
    page_changed: boolean,
    new_elements: number
  },
  error: string,  // If success === false
  timing: {
    started_at: timestamp,
    completed_at: timestamp,
    duration_ms: number
  },
  dom_state: {
    url: string,
    title: string,
    scroll_y: number,
    focused_element: string,
    form_state: object
  }
}
```

### Workflow Management

#### `browser:start-workflow`
Begin executing a multi-step workflow.

```javascript
// Renderer → Main
await ipcRenderer.invoke("browser:start-workflow", {
  workflow_id: string,
  goal: string,
  steps: Array<WorkflowStep>,
  permissions: Array<string>,  // e.g., ["navigate_pages", "click_elements"]
  options: {
    auto_advance: boolean,  // Auto execute next step after observation
    timeout_per_step: number,  // ms
    total_timeout: number,  // ms for entire workflow
    screenshot_interval: number  // ms, capture state periodically
  }
})
```

**WorkflowStep:**
```javascript
{
  id: string,
  type: string,  // "action" | "decision" | "plan" | "complete"
  action_type?: string,  // if type === "action"
  params?: object,
  depends_on?: Array<string>,  // step IDs this depends on
  label?: string,
  description?: string
}
```

**Response:**
```javascript
{
  workflow_id: string,
  status: "started" | "paused" | "waiting_for_permission",
  current_step: string,
  message: string
}
```

#### `browser:pause-workflow`
Pause current workflow (user clicks "stop" button).

```javascript
await ipcRenderer.invoke("browser:pause-workflow", {
  workflow_id: string,
  reason: string  // "user_request" | "permission_denied" | "error"
})
```

#### `browser:resume-workflow`
Resume paused workflow.

```javascript
await ipcRenderer.invoke("browser:resume-workflow", {
  workflow_id: string,
  user_input?: string  // For clarification responses
})
```

#### `browser:cancel-workflow`
Cancel workflow entirely.

```javascript
await ipcRenderer.invoke("browser:cancel-workflow", {
  workflow_id: string
})
```

### Workflow Observation

#### `browser:get-workflow-status`
Get current status of a workflow.

```javascript
await ipcRenderer.invoke("browser:get-workflow-status", {
  workflow_id: string
})
```

**Response:**
```javascript
{
  workflow_id: string,
  goal: string,
  status: "pending" | "running" | "paused" | "completed" | "failed",
  current_step: number,
  total_steps: number,
  steps_completed: Array<{
    id: string,
    status: "done" | "error" | "skipped",
    result: object,
    error: string
  }>,
  observations: Array<object>,
  progress_percent: number,
  estimated_remaining_ms: number,
  errors: Array<string>
}
```

### Permission Management (Extended)

#### `ai:request-action-permission`
Request user grant for an action type.

```javascript
// Main → Renderer
ipcRenderer.send("ai:request-action-permission", {
  action_scope: string,  // e.g., "submit_forms"
  reason: string,
  site: string,  // For scoping to specific domain
  workflow_id: string
})
```

#### `browser:set-action-permission`
User grants/denies permission for action.

```javascript
// Renderer → Main
await ipcRenderer.invoke("browser:set-action-permission", {
  action_scope: string,
  allowed: boolean,
  scope: "once" | "site" | "session" | "permanent",
  workflow_id: string
})
```

**Response:**
```javascript
{
  action_scope: string,
  allowed: boolean,
  granted_at: timestamp,
  expires_at: timestamp  // if scope === "session"
}
```

#### `browser:get-action-permissions`
Get current action permission state.

```javascript
await ipcRenderer.invoke("browser:get-action-permissions")
```

**Response:**
```javascript
{
  granted: Array<{
    scope: string,
    granted_at: timestamp,
    scope_type: "once" | "site" | "session" | "permanent",
    site: string  // if site-scoped
  }>,
  denied: Array<string>
}
```

### Planning/Clarification

#### `ai:ask-for-clarification`
AI needs user input to proceed.

```javascript
// Main → Renderer
ipcRenderer.send("ai:ask-for-clarification", {
  workflow_id: string,
  question: string,
  options: Array<string>,  // Multiple choice
  allow_freeform: boolean,
  context: string  // What led to this question
})
```

#### `browser:provide-clarification`
User responds to clarification request.

```javascript
// Renderer → Main
await ipcRenderer.invoke("browser:provide-clarification", {
  workflow_id: string,
  response: string,
  selected_option?: number  // If multiple choice
})
```

### Workflow UI Events

#### `workflow:status-update`
Main broadcasts workflow progress to renderer.

```javascript
// Main → Renderer (broadcast)
ipcRenderer.on("workflow:status-update", (event, data) => {
  data: {
    workflow_id: string,
    current_step: number,
    step_label: string,
    status: "executing" | "complete" | "error" | "waiting",
    progress: number,  // 0-100
    message: string,
    screenshot: string  // Optional
  }
})
```

#### `workflow:action-result`
Main sends result of each action step.

```javascript
// Main → Renderer
ipcRenderer.on("workflow:action-result", (event, data) => {
  data: {
    workflow_id: string,
    action_id: string,
    success: boolean,
    result: object,
    error: string
  }
})
```

#### `workflow:completed`
Main notifies when workflow finishes.

```javascript
// Main → Renderer
ipcRenderer.on("workflow:completed", (event, data) => {
  data: {
    workflow_id: string,
    goal: string,
    status: "success" | "failed" | "cancelled",
    final_result: object,
    total_duration_ms: number,
    steps_executed: number,
    errors: Array<string>
  }
})
```

---

## AI Service HTTP Endpoints (New)

### `POST /agent/plan`
Planning engine generates workflow from goal.

**Request:**
```json
{
  "goal": "Find latest RTX 5080 prices",
  "context": {
    "current_url": "https://google.com",
    "current_page_content": "...",
    "open_tabs": [...],
    "user_preferences": {...},
    "available_actions": ["navigate", "click", "fill", "read", ...]
  },
  "max_steps": 20,
  "max_depth": 5
}
```

**Response:**
```json
{
  "workflow_id": "wf_123",
  "goal": "Find latest RTX 5080 prices",
  "plan": [
    {
      "id": "s1",
      "action": "navigate",
      "params": { "url": "https://newegg.com" },
      "label": "Go to Newegg"
    },
    {
      "id": "s2",
      "action": "click",
      "params": { "selector": ".search-input" },
      "label": "Click search box"
    },
    ...
  ],
  "reasoning": "...",
  "estimated_steps": 12,
  "permissions_required": ["navigate_pages", "click_elements"],
  "estimated_duration_ms": 30000
}
```

### `POST /agent/execute`
Execute next step in workflow given current observations.

**Request:**
```json
{
  "workflow_id": "wf_123",
  "current_step_index": 2,
  "current_observation": {
    "action": "click",
    "result": "search_box_focused",
    "page_state": "..."
  },
  "observations_history": [...]
}
```

**Response:**
```json
{
  "workflow_id": "wf_123",
  "next_step": {
    "id": "s3",
    "action": "fill",
    "params": { "fields": { ".search-input": "RTX 5080" } }
  },
  "reasoning": "User clicked search box, now filling with query",
  "or": {
    "clarification_needed": true,
    "question": "Should I click 'Exact Match' or 'Approximate Match'?",
    "options": ["Exact", "Approximate"]
  }
}
```

### `POST /agent/observe`
Interpret action result and decide if plan needs adjustment.

**Request:**
```json
{
  "workflow_id": "wf_123",
  "observation": {
    "action": "read",
    "selector": ".price",
    "result": "$1,499.99",
    "page_changed": false,
    "elements_found": 1
  },
  "plan_so_far": [...]
}
```

**Response:**
```json
{
  "interpretation": "Successfully extracted price",
  "confidence": 0.95,
  "proceed": true,
  "adjustments": null,
  "or": {
    "needs_retry": true,
    "reason": "Price selector changed, trying alternative",
    "suggested_action": "read",
    "suggested_params": { "selector": ".product-price" }
  }
}
```

### `POST /agent/clarify`
Handle ambiguous situations.

**Request:**
```json
{
  "workflow_id": "wf_123",
  "ambiguous_input": "latest releases",
  "context": "You are on openai.com/releases",
  "options": [
    { "label": "ChatGPT", "value": "chatgpt" },
    { "label": "API", "value": "api" },
    { "label": "All", "value": "all" }
  ]
}
```

**Response:**
```json
{
  "clarification": "I found 3 types of releases. Which would you like?",
  "question_id": "q_123",
  "waiting_for_user": true,
  "timeout_ms": 30000
}
```

---

## Error Codes

### IPC Error Codes

```
1000: SUCCESS
1001: INVALID_PARAMS
1002: PERMISSION_DENIED
1003: WORKFLOW_NOT_FOUND
1004: ACTION_TIMEOUT
1005: ELEMENT_NOT_FOUND
1006: NAVIGATION_FAILED
1007: FORM_SUBMISSION_FAILED
1008: SCREENSHOT_FAILED
1009: WORKFLOW_CANCELLED
1010: PERMISSION_REQUEST_DENIED
2000: AI_SERVICE_UNAVAILABLE
2001: AI_SERVICE_ERROR
2002: PLAN_GENERATION_FAILED
```

### Recovery Strategies

```javascript
// Retry with backoff
if (error.code === 1004) {  // Timeout
  retry_attempts++;
  await sleep(500 * retry_attempts);
  result = await executeAction(...);
}

// Fallback to user
if (error.code === 1005) {  // Element not found
  askUser("I couldn't find that element. Should I navigate back and try again?");
}

// Escalate to AI
if (error.code >= 2000) {  // AI service error
  sendToAI({ observation: error, context: "plan_so_far" });
}
```

---

## Security Considerations

### Permission Enforcement
- All action types require explicit permission
- Permissions are scope-gated (site, session, permanent)
- User gets clear UI for permission requests
- Deny-by-default

### Safe Mode
```javascript
// Hard limits to prevent runaway workflows
{
  max_total_steps: 1000,
  max_concurrent_workflows: 3,
  max_tabs_to_open: 10,
  max_requests_per_minute: 100,
  required_user_approval_for: [
    "submit_forms",
    "enter_credentials",
    "download_files",
    "modify_files"
  ]
}
```

### Audit Trail
```
Every action logged:
- Workflow ID
- Action type
- Parameters (redacted for sensitive data)
- Result
- Timestamp
- User (for multi-user systems)
```

---

## Versioning

This spec is version **2.0** (IPC contract including action execution).

**Version History:**
- 1.0: Browser control, bookmarks, history, AI permissions
- 2.0: Action executor, workflows, planning integration
- 3.0 (planned): Multi-tab coordination, custom JavaScript
- 4.0 (planned): Visual recognition, autonomous task batching
