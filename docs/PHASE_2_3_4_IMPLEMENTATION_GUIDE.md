# Nexa Phase 2, 3, 4: Implementation Guide

## Overview

This document provides step-by-step guidance for implementing Phases 2, 3, and 4 of Nexa, transforming it from a passive information reader into an autonomous agent.

## Phase 2: Browser Automation (Action Executor)

### What's Implemented

The Action Executor layer is now complete and integrated into Electron main process.

- **Location**: `src/core/action-executor.js`
- **Status**: Ready to use
- **Access**: Via IPC handlers in main.js

### How to Use

#### From Renderer (JavaScript)

```javascript
// Execute a single action
const result = await browserApi.executeAction({
  type: 'click',
  params: {
    selector: 'button.search',
    screenshot: true,
    timeout: 5000
  }
}, 'workflow_123');

console.log(result);
// {
//   ok: true,
//   actionId: "action_...",
//   success: true,
//   statusCode: 200,
//   result: {
//     clicked: true,
//     elementsFound: 1,
//     screenshot: "data:image/png;base64,..."
//   },
//   timing: { durationMs: 234 },
//   domState: { url, title, scrollY }
// }
```

### Supported Actions

#### Click
```javascript
{
  type: 'click',
  params: {
    selector: 'button',          // CSS selector
    screenshot: true,            // Capture after click
    timeout: 5000,              // ms to wait
    waitForNav: false           // Wait for navigation
  }
}
```

#### Fill Form
```javascript
{
  type: 'fill',
  params: {
    fields: {
      'input.search': 'RTX 5080',
      'select.filter': 'new'
    },
    timeout: 5000
  }
}
```

#### Read Content
```javascript
{
  type: 'read',
  params: {
    selector: 'div.results',     // CSS selector, defaults to body
    returnType: 'text|html|data', // What to return
    extractAll: false,           // Multiple matching elements
    timeout: 5000
  }
}
```

#### Navigate
```javascript
{
  type: 'navigate',
  params: {
    url: 'https://amazon.com',
    waitFor: '.product-list',    // Optional: wait for element
    timeout: 10000
  }
}
```

#### Wait for Element
```javascript
{
  type: 'wait',
  params: {
    selector: 'button.load-more',
    visible: true,               // Wait for visibility
    timeout: 5000
  }
}
```

#### Scroll
```javascript
{
  type: 'scroll',
  params: {
    direction: 'down|up|left|right',
    amount: 1000,                // pixels
    target: '.scrollable'        // optional element
  }
}
```

#### Screenshot
```javascript
{
  type: 'screenshot',
  params: {
    fullPage: false,
    format: 'png|jpeg|webp'
  }
}
```

### Example: Search and Extract Data

```javascript
// 1. Navigate to search page
await browserApi.executeAction({
  type: 'navigate',
  params: { url: 'https://example.com/search' }
}, 'wf_1');

// 2. Click search box
await browserApi.executeAction({
  type: 'click',
  params: { selector: 'input.search' }
}, 'wf_1');

// 3. Fill search query
await browserApi.executeAction({
  type: 'fill',
  params: { fields: { 'input.search': 'RTX 5080' } }
}, 'wf_1');

// 4. Submit search (if form)
await browserApi.executeAction({
  type: 'click',
  params: { selector: 'button[type="submit"]' }
}, 'wf_1');

// 5. Wait for results
await browserApi.executeAction({
  type: 'wait',
  params: { selector: 'div.product', timeout: 10000 }
}, 'wf_1');

// 6. Read results
const results = await browserApi.executeAction({
  type: 'read',
  params: {
    selector: 'div.product-item',
    returnType: 'data',
    extractAll: true
  }
}, 'wf_1');

console.log(results.result.content);
// [{ text: "...", html: "...", attributes: {...} }, ...]
```

---

## Phase 3: Workflow Agent

### What's Implemented

The Workflow Orchestrator is complete and ready to manage multi-step workflows.

- **Location**: `src/core/workflow-orchestrator.js`
- **Status**: Ready to use
- **Access**: Via IPC handlers

### How to Use

#### Start a Workflow

```javascript
const { workflowId, status, message } = await browserApi.startWorkflow(
  'Find RTX 5080 prices at Amazon and Newegg',  // goal
  [
    // steps array
    {
      id: 's1',
      type: 'action',
      action_type: 'navigate',
      label: 'Open Amazon',
      params: { url: 'https://amazon.com' }
    },
    {
      id: 's2',
      type: 'action',
      action_type: 'click',
      label: 'Click search',
      params: { selector: 'input#twotabsearchtextbox' }
    },
    {
      id: 's3',
      type: 'action',
      action_type: 'fill',
      label: 'Enter search term',
      params: { fields: { 'input#twotabsearchtextbox': 'RTX 5080' } }
    },
    // ... more steps
  ],
  ['navigate_pages', 'click_elements', 'fill_forms'],  // required permissions
  { totalTimeout: 120000 }  // options
);

console.log(workflowId);  // "wf_1"
```

#### Listen to Workflow Progress

```javascript
// Listen to step completions
browserApi.onWorkflowStepCompleted((data) => {
  console.log(`Step ${data.stepIndex} completed:`, data.result);
});

// Listen to progress
browserApi.onWorkflowProgress((data) => {
  console.log(`${data.progress}% complete (${data.currentStep}/${data.totalSteps})`);
});

// Listen to completion
browserApi.onWorkflowCompleted((data) => {
  console.log('Workflow complete!', data);
  console.log('Observations:', data.observations);
  console.log('Duration:', data.totalDurationMs, 'ms');
});

// Listen to failures
browserApi.onWorkflowFailed((data) => {
  console.error('Workflow failed:', data.error);
  console.log('Completed steps:', data.stepsCompleted);
});
```

#### Handle Clarifications

```javascript
// Listen for clarification requests
browserApi.onWorkflowClarificationRequired((data) => {
  // Show UI to user asking: data.question
  // Options: data.options
  // Timeout: data.timeout
  
  // User selects an option, then:
  browserApi.provideClarification(data.workflowId, 'Selected option');
});
```

#### Handle Permission Requests

```javascript
// Listen for permission requests
browserApi.onWorkflowPermissionRequired((data) => {
  // Show permission dialog
  // data.missing = ['submit_forms', 'read_form_fields']
  
  // User grants permissions:
  await Promise.all(data.missing.map(scope =>
    browserApi.setActionPermission(scope, true, 'session')
  ));
});
```

#### Get Workflow Status

```javascript
const status = await browserApi.getWorkflowStatus('wf_1');

console.log(status);
// {
//   ok: true,
//   id: 'wf_1',
//   goal: '...',
//   status: 'running|completed|failed',
//   currentStep: 2,
//   totalSteps: 10,
//   progress: 20,
//   stepsCompleted: [...],
//   observations: [...],
//   errors: [...]
// }
```

#### Pause/Resume/Cancel

```javascript
// Pause
await browserApi.pauseWorkflow('wf_1');

// Resume
await browserApi.resumeWorkflow('wf_1');

// Cancel
await browserApi.cancelWorkflow('wf_1');
```

### Example: Complete Workflow

```javascript
// Define a comparison workflow
const steps = [
  // Amazon
  { id: 'a1', type: 'action', action_type: 'navigate',
    label: 'Open Amazon',
    params: { url: 'https://amazon.com' } },
  { id: 'a2', type: 'action', action_type: 'click',
    label: 'Click search box',
    params: { selector: 'input#twotabsearchtextbox' } },
  { id: 'a3', type: 'action', action_type: 'fill',
    label: 'Search for product',
    params: { fields: { 'input#twotabsearchtextbox': 'RTX 5080' } } },
  { id: 'a4', type: 'action', action_type: 'click',
    label: 'Submit search',
    params: { selector: 'button[type="submit"]' } },
  { id: 'a5', type: 'action', action_type: 'wait',
    label: 'Wait for results',
    params: { selector: '.s-result-item', timeout: 10000 } },
  { id: 'a6', type: 'action', action_type: 'read',
    label: 'Extract first result price',
    params: { selector: '.a-price-whole', returnType: 'text' } },
  
  // Newegg
  { id: 'n1', type: 'action', action_type: 'navigate',
    label: 'Open Newegg',
    params: { url: 'https://newegg.com' } },
  { id: 'n2', type: 'action', action_type: 'click',
    label: 'Click search box',
    params: { selector: 'input[name="Keyword"]' } },
  { id: 'n3', type: 'action', action_type: 'fill',
    label: 'Search for product',
    params: { fields: { 'input[name="Keyword"]': 'RTX 5080' } } },
  { id: 'n4', type: 'action', action_type: 'click',
    label: 'Submit search',
    params: { selector: 'button.search-submit-button' } },
  { id: 'n5', type: 'action', action_type: 'wait',
    label: 'Wait for results',
    params: { selector: '.item-cell', timeout: 10000 } },
  { id: 'n6', type: 'action', action_type: 'read',
    label: 'Extract first result price',
    params: { selector: '.price-current', returnType: 'text' } },
  
  // Synthesis
  { id: 's1', type: 'synthesize',
    label: 'Compile results',
    params: { inputs: ['a6', 'n6'] } }
];

// Start workflow
const { workflowId } = await browserApi.startWorkflow(
  'Compare RTX 5080 prices',
  steps,
  ['navigate_pages', 'click_elements', 'fill_forms', 'read_page_content'],
  { totalTimeout: 120000 }
);

// UI updates
browserApi.onWorkflowProgress(data => {
  updateProgressBar(data.progress);
  updateStepLabel(data.currentStep, data.stepLabel);
});

browserApi.onWorkflowCompleted(data => {
  showResults(data.observations);
  console.log('Comparison complete!');
});
```

---

## Phase 4: Advanced Autonomy (AI Integration)

### Architecture

The AI Planning Service (in `C:\Nexa Ai`) generates structured workflows that the browser executes autonomously.

```
User Goal
    ↓
AI Planning Service
    ├─ Parse intent
    ├─ Detect ambiguities
    ├─ Request clarification
    ├─ Generate plan
    └─ Validate plan
    ↓
Workflow Steps (JSON)
    ↓
Browser Orchestrator
    ├─ Check permissions
    ├─ Execute steps
    ├─ Capture observations
    └─ Report results
    ↓
AI Executor (feedback loop)
    ├─ Interpret observations
    ├─ Adapt plan if needed
    └─ Continue or complete
    ↓
User Results
```

### Nexa AI Service Integration

You need to implement these endpoints in `C:\Nexa Ai`:

#### 1. POST /agent/plan

Generates a workflow from a user goal.

**Request:**
```json
{
  "goal": "Compare RTX 5080 prices at Amazon and Newegg",
  "context": {
    "current_url": "https://www.google.com",
    "open_tabs": [{"url": "...", "title": "..."}],
    "available_actions": ["navigate", "click", "fill", "read", "wait", ...]
  },
  "max_steps": 20
}
```

**Response:**
```json
{
  "workflow_id": "wf_123",
  "goal": "Compare RTX 5080 prices at Amazon and Newegg",
  "plan": [
    {
      "id": "s1",
      "action": "navigate",
      "params": {"url": "https://amazon.com"},
      "label": "Open Amazon"
    },
    ...
  ],
  "reasoning": "...",
  "permissions_required": ["navigate_pages", "click_elements"],
  "estimated_steps": 15,
  "estimated_duration_ms": 45000
}
```

#### 2. POST /agent/execute

Executes next step based on observations.

**Request:**
```json
{
  "workflow_id": "wf_123",
  "current_step_index": 2,
  "current_observation": {
    "action": "click",
    "success": true,
    "result": {...}
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
    "params": {"fields": {"input.search": "RTX 5080"}}
  },
  "reasoning": "User clicked search box, now filling with query"
}
```

#### 3. POST /agent/clarify

Handles ambiguous goals.

**Request:**
```json
{
  "goal": "latest releases",
  "context": "You are on openai.com/releases",
  "options": [
    {"label": "ChatGPT", "value": "chatgpt"},
    {"label": "API", "value": "api"},
    {"label": "All", "value": "all"}
  ]
}
```

**Response:**
```json
{
  "clarification": "I found 3 types of releases. Which would you like?",
  "question_id": "q_123",
  "timeout_ms": 30000
}
```

#### 4. POST /agent/observe

Interprets action results.

**Request:**
```json
{
  "workflow_id": "wf_123",
  "observation": {
    "action": "read",
    "selector": ".price",
    "result": "$1,499.99",
    "elementsFound": 1
  }
}
```

**Response:**
```json
{
  "interpretation": "Successfully extracted price",
  "confidence": 0.95,
  "proceed": true
}
```

### Integrating AI Service with Browser

Add this to your renderer code to call the AI planning service:

```javascript
/**
 * Call Nexa AI to generate a plan from user goal
 */
async function generatePlanFromGoal(userGoal) {
  const aiServiceUrl = 'http://127.0.0.1:8000';  // From env var
  
  try {
    const response = await fetch(`${aiServiceUrl}/agent/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: userGoal,
        context: {
          current_url: window.location.href,
          available_actions: [
            'navigate', 'click', 'fill', 'read', 'wait',
            'scroll', 'screenshot', 'submit'
          ]
        },
        max_steps: 20
      })
    });
    
    const plan = await response.json();
    return plan;
  } catch (error) {
    console.error('Failed to generate plan:', error);
    throw error;
  }
}

/**
 * Execute a plan generated by AI
 */
async function executePlanFromAI(userGoal) {
  try {
    // 1. Generate plan
    const plan = await generatePlanFromGoal(userGoal);
    
    console.log('Plan generated:', plan);
    console.log('Permissions required:', plan.permissions_required);
    
    // 2. Check permissions
    const perms = await browserApi.getActionPermissions();
    const missingPerms = plan.permissions_required.filter(
      p => !perms.granted.some(g => g.scope === p)
    );
    
    if (missingPerms.length > 0) {
      // Request permissions
      for (const scope of missingPerms) {
        const approved = await showPermissionDialog(scope);
        if (!approved) {
          throw new Error(`Permission denied: ${scope}`);
        }
        await browserApi.setActionPermission(scope, true, 'session');
      }
    }
    
    // 3. Start workflow
    const { workflowId } = await browserApi.startWorkflow(
      userGoal,
      plan.plan,
      plan.permissions_required,
      { totalTimeout: plan.estimated_duration_ms * 1.5 }
    );
    
    // 4. Listen to updates
    return new Promise((resolve, reject) => {
      browserApi.onWorkflowCompleted((data) => {
        if (data.workflowId === workflowId) {
          resolve(data);
        }
      });
      
      browserApi.onWorkflowFailed((data) => {
        if (data.workflowId === workflowId) {
          reject(new Error(data.error));
        }
      });
    });
    
  } catch (error) {
    console.error('Workflow execution failed:', error);
    throw error;
  }
}
```

### Example: User Asks AI for Task

```javascript
// User types in search: "Research latest RTX 5080 prices"

const userMessage = document.getElementById('search-input').value;

try {
  // Call AI to generate plan
  const result = await executePlanFromAI(userMessage);
  
  // Display results
  displayWorkflowResults(result.observations);
  
} catch (error) {
  showError(error.message);
}
```

---

## Permission Model Details

### Permission Scopes

Actions require specific permissions. All are deny-by-default:

```javascript
{
  // Read Permissions (Low Risk)
  "current_page": {
    risk: "low",
    description: "Read visible page text"
  },
  "open_tabs": {
    risk: "low",
    description: "List tab titles and URLs"
  },
  
  // Interaction Permissions (High Risk)
  "click_elements": {
    risk: "high",
    description: "Click buttons and links"
  },
  "navigate_pages": {
    risk: "high",
    description: "Navigate to different pages"
  },
  "fill_forms": {
    risk: "high",
    description: "Type into form fields"
  },
  
  // Critical Permissions (Critical Risk - Always ask user)
  "submit_forms": {
    risk: "critical",
    description: "Submit forms (emails, purchases, etc.)",
    requires: ["fill_forms", "click_elements"]
  }
}
```

### Permission Lifetimes

```javascript
// Session: 1 hour, then expires
await browserApi.setActionPermission('click_elements', true, 'session');

// Site: Granted for this domain only
await browserApi.setActionPermission('click_elements', true, 'site');

// Permanent: Saved in database (user can revoke)
await browserApi.setActionPermission('click_elements', true, 'permanent');
```

---

## Testing Checklist

### Phase 2: Action Executor
- [ ] Test click on button
- [ ] Test fill form fields
- [ ] Test read page content
- [ ] Test navigate to URL
- [ ] Test wait for element
- [ ] Test scroll page
- [ ] Test screenshot capture
- [ ] Test error handling (element not found, timeout)
- [ ] Test screenshot capture

### Phase 3: Workflow Orchestrator
- [ ] Test start workflow
- [ ] Test step execution
- [ ] Test progress events
- [ ] Test pause/resume
- [ ] Test cancel
- [ ] Test clarification requests
- [ ] Test error recovery

### Phase 4: AI Integration
- [ ] Test AI plan generation
- [ ] Test permission requests
- [ ] Test workflow from AI plan
- [ ] Test multi-step execution
- [ ] Test observation feedback
- [ ] Test plan adaptation

---

## Next Steps

1. **Implement AI Planning Service** (in C:\Nexa Ai)
   - See IPC contract in docs/IPC_CONTRACT_SPECIFICATION.md
   - Implement /agent/plan endpoint
   - Implement /agent/execute endpoint
   - Add observ ation interpretation logic

2. **Build Workflow UI** (in src/renderer/)
   - Workflow progress panel
   - Permission request dialogs
   - Clarification UI
   - Error recovery interface

3. **Integration Testing**
   - Test end-to-end workflows
   - Test error scenarios
   - Performance optimization
   - Website compatibility

4. **Polish & Optimization**
   - Better error messages
   - Retry logic improvements
   - Timeout tuning
   - Visual feedback improvements
