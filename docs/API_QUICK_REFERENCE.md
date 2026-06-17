# Nexa API Quick Reference

## Available APIs (Phase 2, 3, 4)

All APIs are accessed via `browserApi` object in renderer process.

### Action Execution

#### `executeAction(action, workflowId, screenshot?)`
Execute a single browser action.

```javascript
// Returns: { ok, actionId, success, statusCode, result, timing, domState, error }
const result = await browserApi.executeAction({
  type: 'click',
  params: { selector: 'button' }
}, 'wf_123', true);

if (result.ok) {
  console.log('Action succeeded:', result.result);
}
```

### Workflow Management

#### `startWorkflow(goal, steps, permissions, options)`
Start a multi-step workflow.

```javascript
const { workflowId, status } = await browserApi.startWorkflow(
  'Find prices',
  [{id: 's1', type: 'action', ...}],
  ['navigate_pages', 'click_elements'],
  { totalTimeout: 120000 }
);
```

#### `getWorkflowStatus(workflowId)`
Get status of running workflow.

```javascript
const status = await browserApi.getWorkflowStatus('wf_123');
console.log(status.progress, status.currentStep);
```

#### `pauseWorkflow(workflowId)`
Pause a running workflow.

```javascript
await browserApi.pauseWorkflow('wf_123');
```

#### `resumeWorkflow(workflowId)`
Resume a paused workflow.

```javascript
await browserApi.resumeWorkflow('wf_123');
```

#### `cancelWorkflow(workflowId)`
Cancel a workflow.

```javascript
await browserApi.cancelWorkflow('wf_123');
```

### Permission Management

#### `getActionPermissions()`
Get current permission state.

```javascript
const { granted, denied, pending } = await browserApi.getActionPermissions();
// granted = [{scope: 'click_elements', grantedAt, expiresAt}, ...]
// denied = ['fill_forms', ...]
// pending = [{...}, ...]
```

#### `setActionPermission(scope, allowed, scopeType)`
Grant or deny a permission.

```javascript
// Grant for this session
await browserApi.setActionPermission('click_elements', true, 'session');

// Deny
await browserApi.setActionPermission('click_elements', false, 'session');

// Permanent grant
await browserApi.setActionPermission('click_elements', true, 'permanent');
```

#### `getPermissionDefinitions()`
Get all available permission scopes.

```javascript
const { permissions } = await browserApi.getPermissionDefinitions();
console.log(permissions.click_elements.description);
// "Allow Nexa to click interactive elements"
```

### Workflow Interaction

#### `provideClarification(workflowId, response)`
Answer a clarification question.

```javascript
browserApi.onWorkflowClarificationRequired((data) => {
  // data.question, data.options
  userSelection = await askUser(data);
  browserApi.provideClarification(data.workflowId, userSelection);
});
```

#### `provideErrorResponse(workflowId, response)`
Respond to error recovery prompt.

```javascript
browserApi.onWorkflowUserActionRequired((data) => {
  // data.issue, data.options
  userChoice = await askUser(data);
  browserApi.provideErrorResponse(data.workflowId, userChoice);
});
```

### Workflow Event Listeners

#### `onWorkflowStarted(listener)`
```javascript
browserApi.onWorkflowStarted((data) => {
  console.log('Workflow started:', data.goal);
});
```

#### `onWorkflowStepStarted(listener)`
```javascript
browserApi.onWorkflowStepStarted((data) => {
  console.log(`Executing step ${data.stepIndex}: ${data.stepLabel}`);
});
```

#### `onWorkflowStepCompleted(listener)`
```javascript
browserApi.onWorkflowStepCompleted((data) => {
  console.log('Step result:', data.result);
});
```

#### `onWorkflowProgress(listener)`
```javascript
browserApi.onWorkflowProgress((data) => {
  progressBar.style.width = data.progress + '%';
  stepLabel.textContent = `${data.currentStep}/${data.totalSteps}`;
});
```

#### `onWorkflowCompleted(listener)`
```javascript
browserApi.onWorkflowCompleted((data) => {
  console.log('✓ Workflow complete!');
  console.log('Duration:', data.totalDurationMs, 'ms');
  console.log('Steps executed:', data.stepsExecuted);
  console.log('Results:', data.observations);
});
```

#### `onWorkflowFailed(listener)`
```javascript
browserApi.onWorkflowFailed((data) => {
  console.error('✗ Workflow failed:', data.error);
  console.log('Progress:', data.stepsCompleted, '/', data.totalSteps);
});
```

#### `onWorkflowClarificationRequired(listener)`
```javascript
browserApi.onWorkflowClarificationRequired((data) => {
  // data.workflowId
  // data.question
  // data.options (array)
  // data.timeout
});
```

#### `onWorkflowPermissionRequired(listener)`
```javascript
browserApi.onWorkflowPermissionRequired((data) => {
  // data.workflowId
  // data.missing (array of permission scopes)
});
```

#### `onWorkflowUserActionRequired(listener)`
```javascript
browserApi.onWorkflowUserActionRequired((data) => {
  // data.workflowId
  // data.stepId
  // data.issue
  // data.options
});
```

---

## Action Types Reference

### Click
```javascript
{ type: 'click', params: { selector: 'button', screenshot: true, timeout: 5000 } }
```
- Clicks an element
- Returns: `{ clicked: true, elementsFound: 1, screenshot? }`

### Fill
```javascript
{ type: 'fill', params: { fields: { '.search': 'text' }, timeout: 5000 } }
```
- Fills multiple form fields
- Returns: `{ fieldsUpdated: 2, fieldsFailed: 0, details: {...} }`

### Read
```javascript
{ type: 'read', params: { selector: '.content', returnType: 'text', extractAll: false } }
```
- Reads page content
- `returnType`: 'text' | 'html' | 'data'
- `extractAll`: true for all matching elements
- Returns: `{ elementsFound: 5, content: [...] }`

### Wait
```javascript
{ type: 'wait', params: { selector: '.loading', visible: true, timeout: 5000 } }
```
- Waits for element to appear
- Returns: `{ found: true, waitedMs: 234 }`

### Navigate
```javascript
{ type: 'navigate', params: { url: 'https://example.com', waitFor: '.content', timeout: 10000 } }
```
- Navigates to URL
- `waitFor`: Optional selector to wait for after load
- Returns: `{ navigated: true, url: '...' }`

### Scroll
```javascript
{ type: 'scroll', params: { direction: 'down', amount: 1000, target: '.scrollable' } }
```
- Scrolls page or element
- `direction`: 'up' | 'down' | 'left' | 'right'
- Returns: `{ scrolled: true, scrollY: 1000, scrollX: 0 }`

### Screenshot
```javascript
{ type: 'screenshot', params: { fullPage: false, format: 'png' } }
```
- Captures page screenshot
- Returns: `{ screenshot: 'data:image/png;...', format: 'png', size: {width, height} }`

---

## Workflow Step Types

### Action Step
```javascript
{
  id: 's1',
  type: 'action',
  action_type: 'click' | 'fill' | 'read' | 'navigate' | 'wait' | 'scroll' | 'screenshot',
  label: 'Click search button',
  params: { ... },  // Depends on action_type
  description: 'Click the search button to start search'
}
```

### Decision Step
```javascript
{
  id: 's2',
  type: 'decision',
  label: 'Check results',
  params: {
    check: 'element_found' | 'text_changed' | 'page_idle'
  }
}
```

### Clarification Step
```javascript
{
  id: 's3',
  type: 'clarification',
  label: 'Ask user',
  params: {
    question: 'Which retailers?',
    options: ['Amazon', 'Newegg', 'Best Buy'],
    timeout: 30000
  }
}
```

### Synthesize Step
```javascript
{
  id: 's4',
  type: 'synthesize',
  label: 'Compile results',
  params: {
    inputs: ['s1_result', 's2_result'],  // Step IDs or observation IDs
    output_format: 'markdown'
  }
}
```

---

## Common Patterns

### Pattern 1: Search and Extract

```javascript
const steps = [
  { id: 's1', type: 'action', action_type: 'navigate',
    params: { url: 'https://example.com/search' } },
  { id: 's2', type: 'action', action_type: 'click',
    params: { selector: 'input.search' } },
  { id: 's3', type: 'action', action_type: 'fill',
    params: { fields: { 'input.search': userQuery } } },
  { id: 's4', type: 'action', action_type: 'click',
    params: { selector: 'button[type="submit"]' } },
  { id: 's5', type: 'action', action_type: 'wait',
    params: { selector: '.result-item', timeout: 10000 } },
  { id: 's6', type: 'action', action_type: 'read',
    params: { selector: '.result-item', returnType: 'data', extractAll: true } }
];

const result = await browserApi.startWorkflow(
  `Search for ${userQuery}`,
  steps,
  ['navigate_pages', 'click_elements', 'fill_forms'],
  { totalTimeout: 30000 }
);
```

### Pattern 2: Multi-Site Comparison

```javascript
const sites = ['amazon.com', 'newegg.com', 'bestbuy.com'];
const steps = [];

sites.forEach((site, idx) => {
  const prefix = `site${idx}`;
  steps.push(
    { id: `${prefix}_nav`, type: 'action', action_type: 'navigate',
      params: { url: `https://${site}` } },
    { id: `${prefix}_search`, type: 'action', action_type: 'click',
      params: { selector: 'input.search' } },
    { id: `${prefix}_fill`, type: 'action', action_type: 'fill',
      params: { fields: { 'input.search': query } } },
    { id: `${prefix}_submit`, type: 'action', action_type: 'click',
      params: { selector: 'button[type="submit"]' } },
    { id: `${prefix}_read`, type: 'action', action_type: 'read',
      params: { selector: '.price', returnType: 'text' } }
  );
});

steps.push({
  id: 'synthesis',
  type: 'synthesize',
  params: { inputs: steps.map(s => s.id).filter(id => id.includes('_read')) }
});

await browserApi.startWorkflow('Compare prices', steps, permissions, options);
```

### Pattern 3: Conditional Workflow

```javascript
const steps = [
  // Check if element exists
  { id: 's1', type: 'action', action_type: 'read',
    params: { selector: '.special-offer' } },
  
  // Decision based on result
  { id: 's2', type: 'decision',
    params: { check: 'element_found' } },
  
  // If offer exists, click it
  { id: 's3', type: 'action', action_type: 'click',
    params: { selector: '.special-offer', depends_on: 's2' } },
  
  // Otherwise, continue with default
  { id: 's4', type: 'action', action_type: 'click',
    params: { selector: '.regular-product' } }
];

await browserApi.startWorkflow('Choose offer', steps, permissions, options);
```

---

## Error Handling

### Action Errors

```javascript
const result = await browserApi.executeAction(action, workflowId);

if (!result.ok) {
  console.error('Action failed:', result.error);
  // Error types:
  // "Element not found"
  // "Timeout"
  // "Navigation failed"
  // "Form submission failed"
}
```

### Workflow Errors

```javascript
browserApi.onWorkflowFailed((data) => {
  console.error('Workflow failed:', data.error);
  console.log('Failed at step:', data.stepsCompleted.length);
  
  // User can:
  // 1. Retry workflow
  // 2. Skip to next step
  // 3. Cancel workflow
});
```

### Permission Errors

```javascript
try {
  await browserApi.startWorkflow(goal, steps, permissions);
} catch (error) {
  if (error.message.includes('Permission denied')) {
    // Request permission from user
    await showPermissionDialog(error.message);
  }
}
```

---

## Testing Commands

Run these in browser console to test:

```javascript
// Test 1: Simple click
await browserApi.executeAction({
  type: 'click',
  params: { selector: 'button', screenshot: true }
}, 'test1');

// Test 2: Read page
await browserApi.executeAction({
  type: 'read',
  params: { selector: 'body', returnType: 'text' }
}, 'test2');

// Test 3: Get permissions
await browserApi.getActionPermissions();

// Test 4: Grant permission
await browserApi.setActionPermission('click_elements', true, 'session');

// Test 5: Start simple workflow
await browserApi.startWorkflow(
  'Test workflow',
  [
    { id: 's1', type: 'action', action_type: 'screenshot' },
    { id: 's2', type: 'action', action_type: 'read', 
      params: { selector: 'h1', returnType: 'text' } }
  ],
  [],
  { totalTimeout: 30000 }
);

// Test 6: Listen to events
browserApi.onWorkflowProgress(data => console.log('Progress:', data.progress));
browserApi.onWorkflowCompleted(data => console.log('Done!', data));
browserApi.onWorkflowFailed(data => console.log('Failed:', data.error));
```

---

## Migration Guide from Phase 1

### Phase 1 (Existing)
```javascript
// Only read-only operations
await browserApi.getState()
// Can only summarize/question current page
```

### Phase 2-4 (New)
```javascript
// Can now interact with page
await browserApi.executeAction({ type: 'click', ... })

// Can run complex workflows
await browserApi.startWorkflow(goal, steps, permissions)

// Full control with permissions
await browserApi.setActionPermission('click_elements', true)
```

### Migration Steps
1. Keep Phase 1 APIs (backward compatible)
2. Add Phase 2 action handlers to your UI
3. Integrate Phase 3 workflow listeners
4. When AI service ready, add Phase 4 planning integration

---

## Performance Tips

1. **Batch multiple actions** - Use workflows instead of separate executeAction calls
2. **Set appropriate timeouts** - Don't be too generous
3. **Use returnType wisely** - 'text' is faster than 'data'
4. **Screenshot selectively** - Only when needed
5. **Cache permissions** - Don't re-request
6. **Clean up listeners** - Remove unused event listeners

---

## Debugging

Enable verbose logging:

```javascript
// In main.js
if (process.env.DEBUG_ACTIONS) {
  workflowOrchestrator.on('*', (event, data) => {
    console.log('[WORKFLOW]', event, data);
  });
}
```

Check workflow state:

```javascript
const status = await browserApi.getWorkflowStatus(workflowId);
console.log(JSON.stringify(status, null, 2));
```

See executing actions:

```javascript
// In main process console
console.log(actionExecutor.getExecutingActions());
```
