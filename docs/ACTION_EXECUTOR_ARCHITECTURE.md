# Nexa Action Executor Architecture

## Overview

The Action Executor is the bridge between Nexa AI's planning engine and the actual browser. It transforms high-level goals into low-level DOM manipulations, monitors results, and feeds observations back to the AI for reasoning.

```
Planning Engine → Action Executor → Browser DOM → Observation → Reasoning Loop
```

## System Architecture

### Layer 1: Planning Engine (C:\Nexa Ai)
Receives user goal, generates execution plan:
```javascript
{
  id: "workflow_123",
  goal: "Find latest OpenAI releases",
  steps: [
    { id: "s1", type: "navigate", url: "openai.com/releases" },
    { id: "s2", type: "read", selector: "main", context: "find release categories" },
    { id: "s3", type: "plan_branches", count: 4 },
    { id: "s4", type: "for_each_branch", action: "click_and_read" }
  ],
  permissions_required: ["navigate_pages", "click_elements", "read_page_content"]
}
```

### Layer 2: Workflow Orchestrator (Main Process)
In `src/main.js`:
- Manages workflow state
- Dispatches actions to browser
- Collects observations
- Tracks completion/errors
- Enforces permissions

```javascript
class WorkflowOrchestrator {
  executeWorkflow(plan, permissions) {
    for (let step of plan.steps) {
      // Check permission
      if (!this.checkPermission(step.action, permissions)) {
        return { error: "Permission denied", step };
      }
      
      // Execute action
      let result = this.executeAction(step);
      
      // Observe result
      let observation = this.observeResult(result);
      
      // Feed back to AI
      this.sendObservation(observation);
    }
  }
}
```

### Layer 3: Browser Action Layer (Renderer + BrowserView)
In `src/renderer/action-executor.js`:
- Inject action scripts into page
- Execute DOM manipulations
- Screenshot current state
- Return detailed observations

```javascript
class BrowserActionExecutor {
  async clickElement(selector) {
    return this.executeInPage({
      action: "click",
      selector,
      screenshot: true
    });
  }

  async fillForm(fields) {
    return this.executeInPage({
      action: "fill",
      fields,
      screenshot: true
    });
  }
}
```

### Layer 4: Observation System
Every action returns:
```javascript
{
  action: "click",
  selector: "button.load-more",
  success: true,
  status: 200,
  page_changed: true,
  new_elements_count: 12,
  dom_snapshot: "...",
  screenshot: "base64:...",
  interpretation: "Successfully loaded more results"
}
```

## Action Types

### Navigation Actions
```javascript
{
  type: "navigate",
  url: "https://example.com/page",
  wait_for: "selector",  // optional
  timeout: 5000
}
```

### DOM Manipulation
```javascript
{
  type: "click",
  selector: "button.load-more",
  screenshot: true
}

{
  type: "fill_form",
  fields: {
    ".search-input": "query text",
    "input[name='filter']": "value"
  },
  submit: true
}

{
  type: "scroll",
  direction: "down",
  amount: 1000
}
```

### Reading/Extraction
```javascript
{
  type: "read",
  selector: "main",  // optional, defaults to body
  return_structure: "text" | "dom" | "data"
}

{
  type: "extract_table",
  selector: "table.results"
}

{
  type: "list_elements",
  selector: "article",
  properties: ["text", "href", "data-id"]
}
```

### Waiting/Observation
```javascript
{
  type: "wait_for",
  selector: "button.load-more",
  timeout: 5000
}

{
  type: "screenshot"
}

{
  type: "observe",
  check: "element_visible" | "text_changed" | "page_idle"
}
```

## Workflow Execution Loop

```
1. RECEIVE PLAN from AI
   ↓
2. VALIDATE PERMISSIONS
   - User must grant each action type
   - Deny-by-default
   ↓
3. FOR EACH STEP:
   ├─ Execute action in browser
   ├─ Capture observation
   ├─ Send observation to AI
   ├─ Wait for next step (or AI reasoning)
   └─ Handle errors/retry
   ↓
4. AGGREGATE RESULTS
   ↓
5. RETURN TO USER
```

## Error Handling

### Retry Strategy
```javascript
{
  type: "click",
  selector: "button",
  retries: 3,
  retry_on: ["element_not_found", "stale_element"],
  backoff: 500  // ms between retries
}
```

### Failure Recovery
```javascript
if (action.failed) {
  // Option 1: Clarify with user
  askUser("Element not found. Should I navigate back and try again?");
  
  // Option 2: Backtrack
  executeStep(workflow.steps[i - 1]);
  
  // Option 3: Ask AI for alternative
  sendToAI({ observation: failure, context: "plan_so_far" });
}
```

## Permission Model

### Action Permission Scopes
```javascript
const ACTION_PERMISSIONS = {
  "navigate_pages": {
    label: "Navigate to different pages",
    risk: "high",
    description: "Allow Nexa to click links and navigate"
  },
  "click_elements": {
    label: "Click buttons and links",
    risk: "high",
    description: "Allow Nexa to click interactive elements"
  },
  "fill_forms": {
    label: "Fill form fields",
    risk: "high",
    description: "Allow Nexa to type into forms"
  },
  "submit_forms": {
    label: "Submit forms",
    risk: "critical",
    description: "Allow Nexa to submit search, purchase, or email"
  },
  "read_form_fields": {
    label: "Read form values",
    risk: "medium",
    description: "Allow Nexa to see what you've typed"
  },
  "manage_tabs": {
    label: "Open/close tabs",
    risk: "medium",
    description: "Allow Nexa to open new tabs"
  },
  "download_files": {
    label: "Download files",
    risk: "high",
    description: "Allow Nexa to trigger downloads"
  }
};
```

### Request Flow
```
1. AI generates plan requiring "submit_forms"
2. Main process checks if user granted this
3. If not, present permission dialog
4. User approves or denies
5. If approved, proceed; if denied, ask AI for alternative approach
```

## Performance Considerations

### Observation Optimization
- Only capture screenshots when needed
- Use DOM snapshots (JSON) instead of full screenshots for reading
- Batch multiple observations before sending to AI
- Cache recent page states

### Timeout Management
- Navigation: 10s default
- Element wait: 5s default
- Form submission: 15s default
- Overall workflow: 5min default

## State Management

### Workflow State
```javascript
{
  id: "wf_123",
  goal: "Research RTX 5080",
  status: "in_progress",
  current_step: 2,
  steps_completed: [
    { id: "s1", status: "done", result: {...} },
    { id: "s2", status: "done", result: {...} }
  ],
  steps_pending: [
    { id: "s3", status: "pending" },
    { id: "s4", status: "pending" }
  ],
  observations: [...],
  errors: [],
  started_at: timestamp,
  estimated_completion: timestamp
}
```

### Context Tracking
- Current URL
- Open tabs
- Form state
- Scroll position
- Selected text
- Focused element

## Feedback Loop

```
PLAN EXECUTION
    ↓
OBSERVATION CAPTURE
    ↓
INTERPRETATION (local)
    ↓
SEND TO AI ← AI may adjust plan
    ↓
NEXT STEP or FINISH
```

### Observation Interpretation (Browser-side)
```javascript
{
  "navigate": "Loaded successfully" | "Timeout" | "Not found",
  "click": "Element clicked" | "Element not found" | "Intercepted",
  "fill": "Field filled" | "Field not found" | "Not a text input",
  "read": "Content extracted" | "Selector not found",
  "wait": "Element appeared" | "Timeout"
}
```

## Integration Points

### With Nexa AI (C:\Nexa Ai)
```
POST /agent/execute
  Input: workflow_id, current_step_index, observations_so_far
  Output: { next_action, reasoning, adjustments }

POST /agent/observe
  Input: observation, context
  Output: { interpretation, proceed, next_step }

POST /agent/clarify
  Input: ambiguous_situation, options
  Output: { chosen_action }
```

### With Permission UI (Renderer)
```javascript
// When AI requests new permission
ipcRenderer.invoke("ai:request-permission", {
  scope: "submit_forms",
  reason: "Need to submit search form",
  site: "example.com"
})
```

### With Workflow UI (Sidebar)
```javascript
// Real-time updates
ipcRenderer.send("workflow:status-update", {
  workflow_id: "wf_123",
  current_step: 3,
  status: "in_progress",
  message: "Searching for results..."
})
```

## Example: Complete Workflow

### User Request
"Research RTX 5080 prices at 3 retailers"

### Planning
```
Goal: Research RTX 5080 prices
Permissions: navigate_pages, click_elements, read_page_content

Steps:
1. Navigate to Newegg
2. Search for "RTX 5080"
3. Read price from first result
4. Navigate to Amazon
5. Search for "RTX 5080"
6. Read price
7. Navigate to Best Buy
8. Search for "RTX 5080"
9. Read price
10. Synthesize comparison
```

### Execution
```
STEP 1: navigate("newegg.com")
  → Screenshot
  → Send observation: "Newegg homepage loaded"
  
STEP 2: click(".search-input"), fill_form("RTX 5080"), submit()
  → Wait for results
  → Capture results page
  
STEP 3: read("div.product-price")
  → Extract: "$1,499.99"
  → Send to AI
  
[Repeat for Amazon, Best Buy]

FINAL: Synthesize
  → Newegg: $1,499.99
  → Amazon: $1,499.99
  → Best Buy: $1,549.99
  → Best price: Newegg/Amazon
```

## Future Enhancements

1. **Visual Recognition** - Identify elements by visual appearance, not just selectors
2. **Multi-Tab Coordination** - Execute workflows across multiple tabs
3. **Form Field Intelligence** - Auto-detect form types and fill intelligently
4. **JavaScript Execution** - Run complex custom logic in browser context
5. **Video/Audio Handling** - Interact with media elements
6. **Authentication** - Handle login flows safely
7. **Rate Limiting** - Respect site crawl delays
8. **Analytics** - Track what works/fails across sites
